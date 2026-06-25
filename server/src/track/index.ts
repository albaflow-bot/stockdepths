/**
 * Public entry point for append-only track-record + scorecard (Task 4).
 * The scorecard screen (Task 9) and the daily batch (recorder hook) consume these.
 */

export { TrackRecordStore } from "./store.js";
export type { TrackRecordStoreOptions } from "./store.js";
export { recordArtifact, makeArtifactRecorder } from "./recorder.js";
export type { RecordOptions } from "./recorder.js";
export { ScorecardService, periodStart } from "./scorecard.js";
export type { ScorecardServiceOptions } from "./scorecard.js";
export { TimingAccuracyService } from "./timingAccuracy.js";
export type {
  TimingAccuracy,
  TimingAccuracyMetrics,
  TimingHitStats,
  TimingAccuracyOptions,
} from "./timingAccuracy.js";
export { SeriesIndex, maxDrawdownFromValues } from "./prices.js";
export { ALL_PERIODS } from "./types.js";
export type {
  TrackRecordEntry,
  Scorecard,
  ScorecardMetrics,
  ScorecardPeriod,
  RealizedOutcome,
} from "./types.js";
