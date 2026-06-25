/**
 * Public entry for the 발굴 스크리너 / 종목 검색 layer (SPEC 피드백 라운드 4).
 * 후보 선정 = 결정론적 시장 스캔(엣지), LLM = 한 줄 코멘트만(§0-Δ).
 */

export type {
  ExchangeMarket,
  MarketGroup,
  Direction,
  SecurityMasterRecord,
  DailyScreenRecord,
  WeeklySeriesRecord,
  SecuritySignal,
  SecuritySearchItem,
  SecuritySearchQuery,
  SecuritySearchProvider,
} from "./types.js";
export { marketsInGroup } from "./types.js";
export { deriveSignal, directionOf } from "./signal.js";
export {
  InMemorySecuritySearchStore,
  type SearchStoreSeed,
  type SearchStoreOptions,
} from "./searchStore.js";

// 발굴 일배치 파이프라인 (SPEC §3.3-Δ2).
export {
  US_THRESHOLDS,
  KR_THRESHOLDS,
  thresholdsFor,
  type ScreenThresholds,
} from "./config.js";
export {
  computeScreenedSymbol,
  markLargeCaps,
  rsi14,
  rvol,
  isPreferredStock,
  type ScreenedSymbol,
  type SymbolScanInput,
} from "./screenMetrics.js";
export {
  passesNoiseFilter,
  applyNoiseFilter,
  type NoiseFilterOptions,
  type NoiseVerdict,
} from "./noiseFilter.js";
export {
  selectCategory,
  screenCategories,
  hasUnusualSignal,
  CATEGORY_LABELS,
  MOMENTUM_CATEGORIES,
  LARGECAP_GUARDED_CATEGORIES,
  type ScreenCategory,
  type ScreenCandidate,
} from "./categories.js";
export { makeScreenCommenter, type ScreenCommenter, type CommentCandidate } from "./commenter.js";
export {
  DiskScreenStore,
  type ScreenPersistence,
  type ScreenArtifact,
  type ScreenResultItem,
} from "./screenStore.js";
export { runScreenBatch, type RunScreenOptions, type RunScreenResult } from "./screenRunner.js";
