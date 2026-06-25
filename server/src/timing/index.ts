/**
 * Public entry point for the timing-signal model + daily market brief (Task 1).
 * The daily batch (Task 2+) emits these; the 관심·보유 탭 + 추천 카드 consume them.
 */

export {
  TIMING_ACTIONS,
  SIGNAL_SOURCES,
  SECTOR_MIN,
  SECTOR_MAX,
  clampConfidence,
  validateTimingSignal,
  validateDailyMarketBrief,
} from "./types.js";
export type {
  TimingAction,
  SignalSource,
  TimingSignal,
  SectorSignal,
  DailyMarketBrief,
} from "./types.js";

export {
  TimingSignalStore,
  MarketBriefStore,
  timingSignalId,
  marketBriefId,
} from "./store.js";
export type {
  TimingSignalEntry,
  MarketBriefEntry,
  TimingStoreOptions,
} from "./store.js";
export { recordTimingArtifacts, makeTimingRecorder } from "./recorder.js";
export type { TimingRecordOptions } from "./recorder.js";
