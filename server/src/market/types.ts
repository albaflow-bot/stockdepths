/**
 * Common quote/news interface shared by every per-market source adapter.
 *
 * Per SPEC §3.3 (Software Architect): "Pluggable per-market source adapters
 * (US: Nasdaq/S&P, KR: KOSPI/KOSDAQ) behind a common quote/news interface, so a
 * free-source or crawler can be swapped per market without touching downstream
 * pick/alert logic." Downstream pick/alert logic depends only on the normalized
 * models declared here — never on a concrete source.
 */

/** Supported markets. KR is a planned fast-follow (SPEC §우선순위 "나중"). */
export type Market = "US" | "KR";

/** A single normalized daily OHLCV candle. `date` is an ISO calendar day (YYYY-MM-DD, exchange local). */
export interface Candle {
  /** ISO calendar day, e.g. "2024-06-21". */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Adjusted close when the source supplies it, otherwise equals `close`. */
  adjClose: number;
  volume: number;
}

/** A normalized (possibly delayed) latest quote. */
export interface Quote {
  symbol: string;
  market: Market;
  /** Last/most-recent price. */
  price: number;
  /** Previous session close, used for change math. */
  previousClose: number;
  /** Absolute change vs previousClose. */
  change: number;
  /** Percent change vs previousClose (e.g. 1.23 means +1.23%). */
  changePercent: number;
  /** Latest trade day this quote refers to (YYYY-MM-DD). */
  asOf: string;
  /** Free sources are typically 15–20 min delayed; flagged honestly per SPEC §현실적 대안. */
  delayed: boolean;
  /** Which concrete source produced this (e.g. "stooq", "yahoo"). */
  source: string;
}

/** A normalized historical daily series. Default span is 5 years (SPEC core requirement). */
export interface HistoricalSeries {
  symbol: string;
  market: Market;
  /** Ascending by date. */
  candles: Candle[];
  /** First/last calendar day actually returned. */
  from: string;
  to: string;
  source: string;
}

/** Classifies a feed item so the pick engine can weight verified disclosures over general news. */
export type NewsKind = "news" | "disclosure";

/** A normalized news / disclosure item crawled from an RSS or Atom feed. */
export interface NewsItem {
  /** Stable de-dup key (hash of url|title). */
  id: string;
  /** Ticker this item is associated with, when the feed is per-symbol. */
  symbol?: string;
  market: Market;
  title: string;
  url: string;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  summary?: string;
  /** Origin label, e.g. "yahoo-rss", "sec-edgar". */
  source: string;
  kind: NewsKind;
}

/** Options for a historical fetch. */
export interface HistoryOptions {
  /** Lookback window in years. Defaults to 5 (SPEC). */
  years?: number;
}

/** Options for a news fetch. */
export interface NewsOptions {
  /** Max items to return after normalization + de-dup. Defaults to 25. */
  limit?: number;
}

/**
 * The common interface every market adapter implements. Downstream code is
 * written against this type only.
 */
export interface MarketSourceAdapter {
  readonly market: Market;
  /** Latest delayed quote for a single symbol. */
  getQuote(symbol: string): Promise<Quote>;
  /** Daily candles over `years` (default 5), ascending by date. */
  getHistory(symbol: string, opts?: HistoryOptions): Promise<HistoricalSeries>;
  /** Verified news/disclosure items; symbol-scoped when provided, else market-wide. */
  getNews(symbol?: string, opts?: NewsOptions): Promise<NewsItem[]>;
}

/** Raised when every source (primary + fallbacks) failed for a request. */
export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly symbol: string | undefined,
    readonly causes: unknown[],
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}
