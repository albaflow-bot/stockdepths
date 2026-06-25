/**
 * Korea market source adapter (KOSPI / KOSDAQ).
 *
 * SPEC §대상 시장 lists Korea alongside the US, and §우선순위 schedules it as the
 * fast-follow "after the free-data path is verified". That path exists and is
 * zero-cost (SPEC §3.3 "무조건 무료"):
 *   - Quotes + 5Y daily candles: Yahoo Finance v8 chart JSON (KOSPI tickers use
 *     the ".KS" suffix, KOSDAQ ".KQ"). Stooq's ".kr" CSV is the fallback. Yahoo is
 *     the *primary* here (vs. US, where Stooq leads) because its KR coverage is the
 *     more reliable free path; either way both are tried (RESILIENCE CONTRACT).
 *   - News: Yahoo Finance headline RSS (region=KR). Best-effort only — there is no
 *     free, keyless KR disclosure feed (DART requires an API key), so disclosures
 *     are intentionally omitted rather than faked. The daily batch already treats
 *     news as optional enrichment, so a KR pick never blocks on it.
 *
 * Symbols are the 6-digit KRX code (e.g. "005930" = Samsung Electronics). A code
 * may carry an explicit ".KS"/".KQ" suffix to pin the board (KOSDAQ tickers must,
 * since the default board is KOSPI). Like the US adapter, this class does no
 * caching itself — wrap it with CachedMarketSource (the registry does this).
 */

import { fetchText, type Fetcher, type HttpOptions } from "../http.js";
import { parseStooqDailyCsv, parseYahooChart, parseFeed } from "../parse.js";
import {
  MarketDataError,
  type HistoricalSeries,
  type HistoryOptions,
  type MarketSourceAdapter,
  type NewsItem,
  type NewsOptions,
  type Quote,
} from "../types.js";
import { yahooRange } from "./us.js";

export interface KrAdapterDeps {
  fetcher?: Fetcher;
  http?: HttpOptions;
  /** Injectable clock for deterministic date-range URLs in tests. */
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Strip a board suffix (.KS/.KQ) and surrounding whitespace → bare 6-digit code. */
function baseCode(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(KS|KQ)$/i, "");
}

/**
 * Yahoo needs a board suffix. If the symbol already pins one (".KS"/".KQ") keep
 * it; otherwise default to KOSPI (".KS"). KOSDAQ tickers must be entered as
 * "CODE.KQ" (e.g. in the PICKS_UNIVERSE override) so this default doesn't misroute.
 */
export function toYahooKrSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  return /\.(KS|KQ)$/i.test(s) ? s : `${s}.KS`;
}

/** Stooq KR symbols are the lowercase bare code + ".kr" (board-agnostic). */
export function toStooqKrSymbol(symbol: string): string {
  return `${baseCode(symbol).toLowerCase()}.kr`;
}

export class KrMarketAdapter implements MarketSourceAdapter {
  readonly market = "KR" as const;
  private readonly http: HttpOptions;
  private readonly now: () => Date;

  constructor(deps: KrAdapterDeps = {}) {
    this.http = { fetcher: deps.fetcher, ...deps.http };
    this.now = deps.now ?? (() => new Date());
  }

  // ---- URL builders (exposed for testing) -------------------------------

  yahooChartUrl(symbol: string, years: number): string {
    const sym = encodeURIComponent(toYahooKrSymbol(symbol));
    return `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${yahooRange(years)}&interval=1d&events=div%2Csplits`;
  }

  stooqHistoryUrl(symbol: string, from: Date, to: Date): string {
    const s = toStooqKrSymbol(symbol);
    return `https://stooq.com/q/d/l/?s=${s}&d1=${yyyymmdd(from)}&d2=${yyyymmdd(to)}&i=d`;
  }

  yahooRssUrl(symbol: string): string {
    const sym = encodeURIComponent(toYahooKrSymbol(symbol));
    return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}&region=KR&lang=ko-KR`;
  }

  marketNewsRssUrl(): string {
    // Market-wide context feed (KOSPI composite index headline stream).
    return "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EKS11&region=KR&lang=ko-KR";
  }

  // ---- History ----------------------------------------------------------

  async getHistory(symbol: string, opts: HistoryOptions = {}): Promise<HistoricalSeries> {
    const years = opts.years ?? 5;
    const to = this.now();
    const from = new Date(to.getTime() - years * 365 * DAY_MS);
    const causes: unknown[] = [];

    // Primary: Yahoo chart (most reliable free KR coverage).
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

    // Fallback: Stooq.
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

    throw new MarketDataError(`No historical data for ${symbol}`, symbol, causes);
  }

  private toSeries(
    symbol: string,
    candles: HistoricalSeries["candles"],
    source: string,
  ): HistoricalSeries {
    return {
      symbol: baseCode(symbol),
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
   * short history window (single source path → previousClose is always consistent
   * with price). Flagged `delayed: true` since free daily data is end-of-day.
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
      symbol: baseCode(symbol),
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

  // ---- News -------------------------------------------------------------

  async getNews(symbol?: string, opts: NewsOptions = {}): Promise<NewsItem[]> {
    const limit = opts.limit ?? 25;
    const collected: NewsItem[] = [];
    const causes: unknown[] = [];

    try {
      const url = symbol ? this.yahooRssUrl(symbol) : this.marketNewsRssUrl();
      const xmlText = await fetchText(url, this.http);
      collected.push(
        ...parseFeed(xmlText, {
          market: this.market,
          symbol: symbol ? baseCode(symbol) : undefined,
          source: "yahoo-rss",
          kind: "news",
        }),
      );
    } catch (err) {
      causes.push(err);
    }

    if (collected.length === 0 && causes.length > 0) {
      throw new MarketDataError(`No news for ${symbol ?? "KR market"}`, symbol, causes);
    }

    return dedupeAndSort(collected).slice(0, limit);
  }
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** De-dup by id, then sort newest-first. */
function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  for (const it of items) {
    if (!seen.has(it.id)) seen.set(it.id, it);
  }
  return [...seen.values()].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0,
  );
}
