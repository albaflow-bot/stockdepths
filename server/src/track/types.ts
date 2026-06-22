/**
 * Append-only track-record + scorecard types (SPEC Task 4).
 *
 * SPEC §3.3 (Architect): "Every daily recommendation immutably logged with entry
 * context so realized returns and hit-rate can be recomputed honestly over
 * arbitrary periods — the scorecard reads from this append-only history, not
 * regenerated." SPEC §3.5 (QA): public transparency of past outcomes drives trust.
 *
 * The log stores the FROZEN entry context (entry price + benchmark entry price at
 * recommendation time). The scorecard recomputes realized returns against fresh
 * prices — so the same history yields an honest, never-rewritten result for any
 * period. Metrics mirror the four SPEC success metrics (SPEC §추천 성공 지표):
 * benchmark-relative cumulative excess return (headline), win rate, per-trade
 * average return, and MDD.
 */

import type { Market } from "../market/types.js";
import type { BadgeLevel } from "../llm/types.js";
import type { BacktestResult } from "../backtest/types.js";

/**
 * One immutably-logged recommendation. The id makes logging idempotent per
 * (market, date, symbol); entryPrice/benchmarkEntryPrice are frozen at record
 * time and never change — realized returns are recomputed against them.
 */
export interface TrackRecordEntry {
  /** `${market}:${date}:${symbol}` — uniqueness + idempotency key. */
  id: string;
  market: Market;
  /** Recommendation (entry) date, YYYY-MM-DD. */
  date: string;
  symbol: string;
  companyName?: string;
  confidence: BadgeLevel;
  risk: BadgeLevel;
  rationale: string;
  /** Asset adjClose frozen at entry (the immutable entry context). */
  entryPrice: number;
  /** The actual trading day the entry price is from (≤ date). */
  entryPriceDate: string;
  benchmarkSymbol: string;
  benchmarkEntryPrice: number;
  benchmarkEntryDate: string;
  /** 5Y backtest snapshot at recommendation time (Task 3), if available. */
  backtest?: BacktestResult;
  /** ISO timestamp the entry was appended. */
  loggedAt: string;
}

/** Scorecard reporting periods (SPEC §3.2 / IA: filterable 1W/1M/3M/YTD). */
export type ScorecardPeriod = "1W" | "1M" | "3M" | "YTD" | "ALL";

export const ALL_PERIODS: readonly ScorecardPeriod[] = ["1W", "1M", "3M", "YTD", "ALL"];

/** A single recommendation's realized outcome (one "trade"). */
export interface RealizedOutcome {
  symbol: string;
  date: string;
  entryPrice: number;
  lastPrice: number;
  /** Asset return entry→asOf, in %. */
  returnPct: number;
  /** Benchmark return over the same span, in %. */
  benchmarkReturnPct: number;
  /** returnPct − benchmarkReturnPct, in percentage points. */
  excessReturnPct: number;
}

/** Aggregate of the 5Y backtests logged with the period's recommendations. */
export interface BacktestAggregate {
  excessReturnPct: number;
  winRatePct: number | null;
  avgTradeReturnPct: number | null;
  maxDrawdownPct: number;
  /** How many recommendations contributed a backtest snapshot. */
  sampleSize: number;
}

/** Aggregate metrics for one period, derived (never stored) from the log. */
export interface ScorecardMetrics {
  period: ScorecardPeriod;
  /** Inclusive lower bound on entry date for this period. */
  periodStart: string;
  asOf: string;
  /** Recommendations whose entry date falls in the period. */
  recommendations: number;
  /** Of those, how many had a computable realized return. */
  evaluated: number;
  /** Hit rate: % of evaluated recs with a positive realized return. */
  winRatePct: number | null;
  /** Mean per-recommendation realized return, in %. */
  avgTradeReturnPct: number | null;
  /** Equal-weight portfolio realized return over the period, in %. */
  cumulativeReturnPct: number | null;
  benchmarkSymbol: string;
  /** Equal-weight benchmark return over the same spans, in %. */
  benchmarkReturnPct: number | null;
  /** HEADLINE: portfolio − benchmark, in percentage points. */
  excessReturnPct: number | null;
  /** Equal-weight basket equity max drawdown, in % (negative). */
  maxDrawdownPct: number | null;
  /** Best/worst single recommendation by realized return (honesty). */
  best?: { symbol: string; date: string; returnPct: number };
  worst?: { symbol: string; date: string; returnPct: number };
  /** 5Y backtest aggregate for the period (realized 옆 백테스트 비교용). */
  backtest?: BacktestAggregate;
}

/** The full scorecard across all requested periods. */
export interface Scorecard {
  asOf: string;
  benchmarkSymbol: string;
  totalRecommendations: number;
  periods: ScorecardMetrics[];
}
