/**
 * Client-side mirror of the server scorecard contract (server Task 4) plus an
 * optional per-period 5-year backtest aggregate so the screen can show realized
 * outcomes ALONGSIDE automatic backtest results (SPEC Task 9).
 *
 * Realized fields mirror the server `ScorecardMetrics` 1:1. `backtest` is the
 * aggregate of the 5Y backtests logged with each recommendation (Task 3/4); it is
 * optional so the UI degrades gracefully if the server hasn't populated it yet.
 */

export type ScorecardPeriod = "1W" | "1M" | "3M" | "1Y" | "ALL";

/** The periods exposed as filters on the screen (1W/1M/3M/1Y). 1Y = 최근 365일 trailing. */
export const FILTER_PERIODS: ScorecardPeriod[] = ["1W", "1M", "3M", "1Y"];

export interface BestWorst {
  symbol: string;
  date: string;
  returnPct: number;
}

/** One recommendation's realized line within a period (전체 추천 목록). */
export interface ScorecardEntry {
  symbol: string;
  date: string;
  /** 실현 수익률 entry→asOf, % — 아직 평가 불가면 null. */
  returnPct: number | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
}

/** Aggregate of the 5-year backtests across the period's recommendations. */
export interface BacktestAggregate {
  excessReturnPct: number;
  winRatePct: number | null;
  avgTradeReturnPct: number | null;
  maxDrawdownPct: number;
  /** How many recommendations contributed a backtest. */
  sampleSize: number;
}

export interface ScorecardMetrics {
  period: ScorecardPeriod;
  periodStart: string;
  asOf: string;
  recommendations: number;
  evaluated: number;
  winRatePct: number | null;
  avgTradeReturnPct: number | null;
  /** Equal-weight realized portfolio return, in %. */
  cumulativeReturnPct: number | null;
  benchmarkReturnPct: number | null;
  /** HEADLINE: realized portfolio − benchmark, in percentage points. */
  excessReturnPct: number | null;
  maxDrawdownPct: number | null;
  best?: BestWorst;
  worst?: BestWorst;
  /** 이 기간의 모든 추천(수익률 desc; 미평가분 returnPct=null은 뒤). */
  entries?: ScorecardEntry[];
  /** Optional 5Y backtest aggregate for side-by-side comparison. */
  backtest?: BacktestAggregate;
}

export interface Scorecard {
  asOf: string;
  benchmarkSymbol: string;
  totalRecommendations: number;
  periods: ScorecardMetrics[];
}

/** Korean label for a period filter. 1Y = 최근 365일 trailing(올해 누적 YTD ✗). */
const PERIOD_LABELS: Record<ScorecardPeriod, string> = {
  "1W": "1주일",
  "1M": "1개월",
  "3M": "3개월",
  "1Y": "1년",
  ALL: "전체",
};
export function periodLabel(p: ScorecardPeriod): string {
  return PERIOD_LABELS[p] ?? p;
}

// ── Timing-signal accuracy (SPEC §5.6) — client mirror of server TimingAccuracy ──

/** Hit stats for one signal direction within a period. */
export interface TimingHitStats {
  total: number;
  evaluated: number;
  hits: number;
  /** hits / evaluated, in % — null when evaluated === 0. */
  hitRatePct: number | null;
}

export interface TimingAccuracyMetrics {
  period: ScorecardPeriod;
  periodStart: string;
  asOf: string;
  horizonDays: number;
  buy: TimingHitStats;
  sell: TimingHitStats;
  overall: TimingHitStats;
  /** True when too few signals were evaluable to trust the rate (과장 방지). */
  lowSample: boolean;
}

export interface TimingAccuracy {
  asOf: string;
  horizonDays: number;
  minSample: number;
  /** Explicit hit criterion, surfaced for transparency. */
  criterion: string;
  periods: TimingAccuracyMetrics[];
}
