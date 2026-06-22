/**
 * Public entry point for the automatic backtesting engine (Task 3).
 * The daily pipeline (Task 2) and the scorecard (Task 4) consume these.
 */

export { runBacktest } from "./engine.js";
export type { RunBacktestOptions } from "./engine.js";
export {
  Backtester,
  makeSymbolBacktester,
  DEFAULT_BENCHMARK,
} from "./backtester.js";
export type { SymbolBacktester, BacktesterOptions } from "./backtester.js";
export {
  trendMomentumStrategy,
  rollingSma,
  DEFAULT_STRATEGY,
} from "./strategies.js";
export type { TrendMomentumParams } from "./strategies.js";
export { BacktestError } from "./types.js";
export type { BacktestResult, Strategy } from "./types.js";
