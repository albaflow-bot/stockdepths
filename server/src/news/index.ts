/**
 * Public entry point for the verified news/disclosure collection pipeline (Task 3).
 * The §5.3 daily market brief (Task 4) consumes these gated, ticker-tagged raw items.
 */

export { NewsCollector, taggedTickers } from "./collector.js";
export type {
  CollectedNewsItem,
  NewsCollectorDeps,
  NewsCollectInput,
  NewsCollectResult,
} from "./collector.js";
export { isWhitelistedUrl, gateItems, hostOf } from "./gate.js";
export { makeTickerTagger } from "./tag.js";
export type { TickerTagger } from "./tag.js";
export {
  WHITELISTED_SOURCES,
  WHITELISTED_DOMAINS,
  sourcesForMarket,
} from "../config/newsSources.js";
export type { NewsSource, NewsSourceKind } from "../config/newsSources.js";
