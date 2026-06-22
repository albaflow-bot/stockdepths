/**
 * US market source adapter (Nasdaq / S&P).
 *
 * Zero-cost sources only (SPEC §3.3 "무조건 무료"):
 *   - Quotes + 5Y daily candles: Stooq CSV (no key, no quota). Yahoo Finance v8
 *     chart JSON is the automatic fallback when Stooq is empty/blocked.
 *   - News/disclosures (no free symbol-news API → crawl feeds): Yahoo Finance
 *     headline RSS per ticker, with SEC EDGAR 8-K Atom as a verified-disclosure
 *     fallback (SPEC §3.2 "검증된 뉴스·공시 기반, 찌라시 제외").
 *
 * Every method walks a primary→fallback chain and aggregates failures into a
 * MarketDataError only if *all* sources fail (RESILIENCE CONTRACT). This class
 * does no caching itself — wrap it with CachedMarketSource.
 */

import { fetchText, type Fetcher, type HttpOptions } from "../http.js";
import {
  parseStooqDailyCsv,
  parseYahooChart,
  parseFeed,
} from "../parse.js";
import {
  MarketDataError,
  type HistoricalSeries,
  type HistoryOptions,
  type MarketSourceAdapter,
  type NewsItem,
  type NewsOptions,
  type Quote,
} from "../types.js";

export interface UsAdapterDeps {
  fetcher?: Fetcher;
  http?: HttpOptions;
  /** Injectable clock for deterministic date-range URLs in tests. */
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stooq US symbols are lowercase + ".us"; "BRK.B" style dots become dashes. */
export function toStooqSymbol(symbol: string): string {
  return `${symbol.trim().toLowerCase().replace(/\./g, "-")}.us`;
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Yahoo's chart `range` param only accepts a fixed set of tokens — fractional
 * years (e.g. a ~20-day quote window) produce no data. Map a years value to the
 * smallest valid token that covers it.
 */
export function yahooRange(years: number): string {
  if (years <= 0.02) return "5d";
  if (years <= 0.1) return "1mo";
  if (years <= 0.3) return "3mo";
  if (years <= 0.6) return "6mo";
  if (years <= 1) return "1y";
  if (years <= 2) return "2y";
  if (years <= 5) return "5y";
  if (years <= 10) return "10y";
  return "max";
}

export class UsMarketAdapter implements MarketSourceAdapter {
  readonly market = "US" as const;
  private readonly fetcher?: Fetcher;
  private readonly http: HttpOptions;
  private readonly now: () => Date;

  constructor(deps: UsAdapterDeps = {}) {
    this.fetcher = deps.fetcher;
    this.http = { fetcher: deps.fetcher, ...deps.http };
    this.now = deps.now ?? (() => new Date());
  }

  // ---- URL builders (exposed for testing) -------------------------------

  stooqHistoryUrl(symbol: string, from: Date, to: Date): string {
    const s = toStooqSymbol(symbol);
    return `https://stooq.com/q/d/l/?s=${s}&d1=${yyyymmdd(from)}&d2=${yyyymmdd(to)}&i=d`;
  }

  yahooChartUrl(symbol: string, years: number): string {
    const sym = encodeURIComponent(symbol.trim().toUpperCase());
    return `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${yahooRange(years)}&interval=1d&events=div%2Csplits`;
  }

  yahooRssUrl(symbol: string): string {
    const sym = encodeURIComponent(symbol.trim().toUpperCase());
    return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=US&lang=en-US`;
  }

  secEdgarAtomUrl(symbol: string): string {
    const sym = encodeURIComponent(symbol.trim().toUpperCase());
    // EDGAR resolves a ticker passed in the CIK param. 8-K = material events.
    return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${sym}&type=8-K&dateb=&owner=include&count=20&output=atom`;
  }

  marketNewsRssUrl(): string {
    // Market-wide context feed (S&P 500 index headline stream).
    return "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US";
  }

  // ---- History ----------------------------------------------------------

  async getHistory(symbol: string, opts: HistoryOptions = {}): Promise<HistoricalSeries> {
    const years = opts.years ?? 5;
    const to = this.now();
    const from = new Date(to.getTime() - years * 365 * DAY_MS);
    const causes: unknown[] = [];

    // Primary: Stooq.
    try {
      const csv = await fetchText(this.stooqHistoryUrl(symbol, from, to), this.http);
      const candles = parseStooqDailyCsv(csv);
      if (candles.length > 0) {
        return this.toSeries(symbol, candles, "stooq");
      }
      causes.push(new Error("stooq returned no rows"));
    } catch (err) {
      causes.push(err);
    }

    // Fallback: Yahoo chart.
    try {
      const json = await fetchText(this.yahooChartUrl(symbol, years), this.http);
      const candles = parseYahooChart(json);
      if (candles.length > 0) {
        return this.toSeries(symbol, candles, "yahoo");
      }
      causes.push(new Error("yahoo returned no rows"));
    } catch (err) {
      causes.push(err);
    }

    throw new MarketDataError(`No historical data for ${symbol}`, symbol, causes);
  }

  private toSeries(symbol: string, candles: HistoricalSeries["candles"], source: string): HistoricalSeries {
    return {
      symbol: symbol.toUpperCase(),
      market: this.market,
      candles,
      from: candles[0]!.date,
      to: candles[candles.length - 1]!.date,
      source,
    };
  }

  // ---- Quote ------------------------------------------------------------

  /**
   * Latest delayed daily quote, derived from the two most recent candles of a
   * short history window. Single source path → previousClose is always
   * consistent with price (no cross-endpoint drift). Flagged `delayed: true`
   * since free daily data is end-of-day / 15–20 min delayed.
   */
  async getQuote(symbol: string): Promise<Quote> {
    // ~20 calendar days covers weekends/holidays to guarantee >= 2 sessions.
    const series = await this.getHistory(symbol, { years: 20 / 365 });
    const candles = series.candles;
    if (candles.length === 0) {
      throw new MarketDataError(`No quote data for ${symbol}`, symbol, []);
    }
    const last = candles[candles.length - 1]!;
    const prev = candles.length >= 2 ? candles[candles.length - 2]! : last;
    const change = last.close - prev.close;
    const changePercent = prev.close !== 0 ? (change / prev.close) * 100 : 0;
    return {
      symbol: symbol.toUpperCase(),
      market: this.market,
      price: last.close,
      previousClose: prev.close,
      change,
      changePercent,
      asOf: last.date,
      delayed: true,
      source: series.source,
    };
  }

  // ---- News / disclosures ----------------------------------------------

  async getNews(symbol?: string, opts: NewsOptions = {}): Promise<NewsItem[]> {
    const limit = opts.limit ?? 25;
    const collected: NewsItem[] = [];
    const causes: unknown[] = [];

    if (symbol) {
      // Primary: per-ticker Yahoo headline RSS.
      try {
        const xmlText = await fetchText(this.yahooRssUrl(symbol), this.http);
        collected.push(
          ...parseFeed(xmlText, {
            market: this.market,
            symbol: symbol.toUpperCase(),
            source: "yahoo-rss",
            kind: "news",
          }),
        );
      } catch (err) {
        causes.push(err);
      }

      // Fallback / enrichment: SEC EDGAR 8-K disclosures (verified filings).
      try {
        const atom = await fetchText(this.secEdgarAtomUrl(symbol), {
          ...this.http,
          // SEC fair-access policy requires an identifying UA.
          headers: { "User-Agent": "StockTimingBot/0.1 contact@example.invalid", ...this.http.headers },
        });
        collected.push(
          ...parseFeed(atom, {
            market: this.market,
            symbol: symbol.toUpperCase(),
            source: "sec-edgar",
            kind: "disclosure",
          }),
        );
      } catch (err) {
        causes.push(err);
      }
    } else {
      // Market-wide context news.
      try {
        const xmlText = await fetchText(this.marketNewsRssUrl(), this.http);
        collected.push(
          ...parseFeed(xmlText, { market: this.market, source: "yahoo-rss", kind: "news" }),
        );
      } catch (err) {
        causes.push(err);
      }
    }

    if (collected.length === 0 && causes.length > 0) {
      throw new MarketDataError(`No news for ${symbol ?? "US market"}`, symbol, causes);
    }

    return dedupeAndSort(collected).slice(0, limit);
  }
}

/** De-dup by id, then sort newest-first. */
export function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  for (const it of items) {
    if (!seen.has(it.id)) seen.set(it.id, it);
  }
  return [...seen.values()].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0,
  );
}
