/**
 * Automatic backtesting engine — types (SPEC Task 3).
 *
 * For each daily pick we backtest the SAME deterministic strategy over the prior
 * 5 years before delivery, and report the four honest metrics the SPEC requires
 * (SPEC §추천 성공 지표 제안):
 *   - benchmark-relative cumulative excess return (vs S&P500 / SPY) — the headline
 *   - win rate
 *   - per-trade average return
 *   - max drawdown (MDD)
 *
 * The selection itself is an LLM synthesis (Task 2), which is neither deterministic
 * nor cheap to replay. So the backtest runs an explainable rule that mirrors the
 * app's "장기 추세 × 최근 동향" thesis — the result that sits next to each pick is a
 * reproducible "이 로직은 지난 5년이면 이랬다" (SPEC §핵심 차별점), not a replayed
 * black box. Everything here is pure + deterministic, feeding the card and the
 * scorecard from one computation.
 */

import type { Candle } from "../market/types.js";

/**
 * A long-only signal strategy. `signals(candles)` returns a 0/1 desired-position
 * array (same length as `candles`), using ONLY data up to and including each bar
 * (no lookahead). The engine applies yesterday's signal to today's return.
 */
export interface Strategy {
  readonly name: string;
  /** Minimum bars required before the strategy can produce a meaningful signal. */
  readonly minBars: number;
  signals(candles: Candle[]): number[];
}

/** The four-metric backtest result attached to a pick and read by the scorecard. */
export interface BacktestResult {
  symbol: string;
  strategy: string;
  /** First/last calendar day of the backtested (asset∩benchmark) window. */
  from: string;
  to: string;
  /** Bars actually simulated after date alignment. */
  dataPoints: number;
  /** Number of completed long trades. */
  trades: number;
  /** % of trades with a positive return, or null when there were no trades. */
  winRatePct: number | null;
  /** Mean per-trade return in %, or null when there were no trades. */
  avgTradeReturnPct: number | null;
  /** Strategy cumulative return over the window, in %. */
  cumulativeReturnPct: number;
  /** Benchmark symbol used (e.g. "SPY" as the S&P 500 proxy). */
  benchmarkSymbol: string;
  /** Benchmark buy-and-hold cumulative return over the same window, in %. */
  benchmarkReturnPct: number;
  /** Headline: strategy − benchmark cumulative return, in percentage points. */
  excessReturnPct: number;
  /** Worst peak-to-trough decline of the strategy equity curve, in % (negative). */
  maxDrawdownPct: number;
}

/** Raised when a symbol can't be backtested (e.g. too little overlapping data). */
export class BacktestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestError";
  }
}
