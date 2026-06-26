/**
 * Sample scorecard for component tests and local preview. Shape matches the
 * server `Scorecard` (Task 4) plus the optional per-period backtest aggregate.
 * Includes an empty period (1W) and an underperforming period to exercise the
 * honest-degradation paths.
 */

import type { Scorecard } from "../types/scorecard";

export const SAMPLE_SCORECARD: Scorecard = {
  asOf: "2026-06-21",
  benchmarkSymbol: "SPY",
  totalRecommendations: 24,
  periods: [
    {
      period: "1W",
      periodStart: "2026-06-14",
      asOf: "2026-06-21",
      recommendations: 0,
      evaluated: 0,
      winRatePct: null,
      avgTradeReturnPct: null,
      cumulativeReturnPct: null,
      benchmarkReturnPct: null,
      excessReturnPct: null,
      maxDrawdownPct: null,
    },
    {
      period: "1M",
      periodStart: "2026-05-21",
      asOf: "2026-06-21",
      recommendations: 6,
      evaluated: 6,
      winRatePct: 66.67,
      avgTradeReturnPct: 3.8,
      cumulativeReturnPct: 4.1,
      benchmarkReturnPct: 2.5,
      excessReturnPct: 1.6,
      maxDrawdownPct: -5.2,
      best: { symbol: "NVDA", date: "2026-05-28", returnPct: 12.4 },
      worst: { symbol: "TSLA", date: "2026-05-23", returnPct: -6.1 },
      backtest: { excessReturnPct: 3.2, winRatePct: 41.0, avgTradeReturnPct: 5.4, maxDrawdownPct: -22.0, sampleSize: 6 },
    },
    {
      period: "3M",
      periodStart: "2026-03-21",
      asOf: "2026-06-21",
      recommendations: 14,
      evaluated: 13,
      winRatePct: 53.85,
      avgTradeReturnPct: 2.2,
      cumulativeReturnPct: 8.9,
      benchmarkReturnPct: 11.4,
      excessReturnPct: -2.5, // honestly trailed the benchmark this window
      maxDrawdownPct: -9.7,
      best: { symbol: "AAPL", date: "2026-04-02", returnPct: 18.7 },
      worst: { symbol: "INTC", date: "2026-03-25", returnPct: -14.2 },
      backtest: { excessReturnPct: 6.1, winRatePct: 44.0, avgTradeReturnPct: 4.9, maxDrawdownPct: -28.5, sampleSize: 13 },
    },
    {
      period: "1Y",
      periodStart: "2025-06-21",
      asOf: "2026-06-21",
      recommendations: 24,
      evaluated: 22,
      winRatePct: 59.09,
      avgTradeReturnPct: 4.6,
      cumulativeReturnPct: 19.7,
      benchmarkReturnPct: 13.2,
      excessReturnPct: 6.5,
      maxDrawdownPct: -12.3,
      best: { symbol: "NVDA", date: "2026-02-10", returnPct: 41.2 },
      worst: { symbol: "PYPL", date: "2026-01-20", returnPct: -18.9 },
      backtest: { excessReturnPct: 9.4, winRatePct: 43.5, avgTradeReturnPct: 5.8, maxDrawdownPct: -30.1, sampleSize: 22 },
    },
    {
      period: "ALL",
      periodStart: "0000-01-01",
      asOf: "2026-06-21",
      recommendations: 24,
      evaluated: 22,
      winRatePct: 59.09,
      avgTradeReturnPct: 4.6,
      cumulativeReturnPct: 19.7,
      benchmarkReturnPct: 13.2,
      excessReturnPct: 6.5,
      maxDrawdownPct: -12.3,
      best: { symbol: "NVDA", date: "2026-02-10", returnPct: 41.2 },
      worst: { symbol: "PYPL", date: "2026-01-20", returnPct: -18.9 },
      backtest: { excessReturnPct: 9.4, winRatePct: 43.5, avgTradeReturnPct: 5.8, maxDrawdownPct: -30.1, sampleSize: 22 },
    },
  ],
};
