/**
 * Public entry point for the daily recommendation pipeline (Task 2).
 * Downstream code (scheduler, API, backtester seeding) imports from here.
 */

export { runDailyBatch, buildMarketContext } from "./dailyBatch.js";
export type { RunDailyBatchOptions } from "./dailyBatch.js";
export { ArtifactStore } from "./artifactStore.js";
export type { DailyPicksArtifact, ArtifactStoreOptions } from "./artifactStore.js";

export { makeDailyBatchGenerator, parseDailyBatch, DAILY_BATCH_SYSTEM_PROMPT } from "../llm/dailyBatch.js";
export type {
  DailyBatchGenerator,
  DailyBatchGenerated,
  DailyBatchGenerateInput,
  DailyBatchMarketContext,
  RankedTickerRef,
  BriefNewsRef,
} from "../llm/dailyBatch.js";
export {
  TimingSignalStore,
  MarketBriefStore,
  recordTimingArtifacts,
  makeTimingRecorder,
} from "../timing/index.js";
export type {
  TimingSignal,
  DailyMarketBrief,
  TimingSignalEntry,
  MarketBriefEntry,
  TimingRecordOptions,
} from "../timing/index.js";

export { buildTickerFeatures } from "../features/indicators.js";
export type { TickerFeatures } from "../features/indicators.js";

export {
  makePicksGenerator,
  orderProviders,
  defaultProviders,
} from "../llm/generator.js";
export type {
  PicksGenerator,
  GeneratePicksInput,
  GeneratedPicks,
  GeneratorOptions,
} from "../llm/generator.js";
export { ADVICE_DISCLAIMER, SYSTEM_PROMPT } from "../llm/prompt.js";
export type { Pick, PicksResult, PersonaContext, BadgeLevel } from "../llm/types.js";
export { LlmError } from "../llm/types.js";
export { resolveUsUniverse, DEFAULT_US_UNIVERSE } from "../config/universe.js";

export {
  runBacktest,
  Backtester,
  makeSymbolBacktester,
  DEFAULT_BENCHMARK,
  trendMomentumStrategy,
  DEFAULT_STRATEGY,
  BacktestError,
} from "../backtest/index.js";
export type {
  BacktestResult,
  Strategy,
  SymbolBacktester,
  BacktesterOptions,
} from "../backtest/index.js";

export {
  TrackRecordStore,
  recordArtifact,
  makeArtifactRecorder,
  ScorecardService,
  periodStart,
  ALL_PERIODS,
} from "../track/index.js";
export type {
  TrackRecordEntry,
  Scorecard,
  ScorecardMetrics,
  ScorecardPeriod,
  RealizedOutcome,
  RecordOptions,
  ScorecardServiceOptions,
} from "../track/index.js";
