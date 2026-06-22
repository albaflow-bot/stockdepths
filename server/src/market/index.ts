/**
 * Public entry point for the market data ingestion layer.
 *
 * Downstream code (daily pick batch, backtester, alert rule engine) imports from
 * here only — concrete sources (Stooq/Yahoo/RSS) stay behind the interface.
 */

export type {
  Market,
  Candle,
  Quote,
  HistoricalSeries,
  NewsItem,
  NewsKind,
  HistoryOptions,
  NewsOptions,
  MarketSourceAdapter,
} from "./types.js";
export { MarketDataError } from "./types.js";

export { TtlCache } from "./cache.js";
export { CachedMarketSource } from "./cached.js";
export type { CacheTtls } from "./cached.js";

export { UsMarketAdapter, toStooqSymbol } from "./adapters/us.js";

export {
  MarketRegistry,
  getMarketRegistry,
} from "./registry.js";
export type { RegistryOptions } from "./registry.js";
