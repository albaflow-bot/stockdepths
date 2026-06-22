/**
 * Caching decorator over any MarketSourceAdapter. This is the "cached quote/news
 * model downstream pick/alert logic reads" (SPEC §3.3). It memoizes on a key
 * derived from (market, op, symbol) and, when every live source fails, serves
 * the last known value (stale-on-error) so a transient outage of a free feed
 * never blocks the daily batch (RESILIENCE CONTRACT).
 */

import { TtlCache } from "./cache.js";
import type {
  HistoricalSeries,
  HistoryOptions,
  Market,
  MarketSourceAdapter,
  NewsItem,
  NewsOptions,
  Quote,
} from "./types.js";

export interface CacheTtls {
  /** Delayed quotes refresh through the day; short TTL. Default 15 min. */
  quoteMs?: number;
  /** 5Y history changes only once/day (new close); longer TTL. Default 12 h. */
  historyMs?: number;
  /** News/disclosures; medium TTL. Default 30 min. */
  newsMs?: number;
}

const DEFAULT_TTLS: Required<CacheTtls> = {
  quoteMs: 15 * 60 * 1000,
  historyMs: 12 * 60 * 60 * 1000,
  newsMs: 30 * 60 * 1000,
};

export class CachedMarketSource implements MarketSourceAdapter {
  readonly market: Market;
  private readonly inner: MarketSourceAdapter;
  private readonly cache: TtlCache;
  private readonly ttls: Required<CacheTtls>;

  constructor(inner: MarketSourceAdapter, cache: TtlCache, ttls: CacheTtls = {}) {
    this.inner = inner;
    this.market = inner.market;
    this.cache = cache;
    this.ttls = { ...DEFAULT_TTLS, ...ttls };
  }

  private key(op: string, symbol?: string, extra?: string): string {
    return [this.market, op, symbol ?? "_market", extra ?? ""].join(":").toLowerCase();
  }

  private async memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get<T>(key);
    if (hit !== undefined) return hit;
    try {
      const fresh = await load();
      this.cache.set(key, fresh, ttlMs);
      return fresh;
    } catch (err) {
      // Stale-on-error: better a slightly old close than a broken batch run.
      const stale = this.cache.getStale<T>(key);
      if (stale !== undefined) return stale;
      throw err;
    }
  }

  getQuote(symbol: string): Promise<Quote> {
    return this.memo(this.key("quote", symbol), this.ttls.quoteMs, () =>
      this.inner.getQuote(symbol),
    );
  }

  getHistory(symbol: string, opts: HistoryOptions = {}): Promise<HistoricalSeries> {
    const years = opts.years ?? 5;
    return this.memo(this.key("history", symbol, String(years)), this.ttls.historyMs, () =>
      this.inner.getHistory(symbol, opts),
    );
  }

  getNews(symbol?: string, opts: NewsOptions = {}): Promise<NewsItem[]> {
    const limit = opts.limit ?? 25;
    return this.memo(this.key("news", symbol, String(limit)), this.ttls.newsMs, () =>
      this.inner.getNews(symbol, opts),
    );
  }
}
