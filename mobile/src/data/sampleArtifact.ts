/**
 * A realistic sample artifact for component tests and local UI preview. Shape
 * matches the server's DailyPicksArtifact (server Tasks 2–4).
 */

import type { DailyPicksArtifact } from "../types/picks";

export const SAMPLE_ARTIFACT: DailyPicksArtifact = {
  market: "US",
  date: "2026-06-21",
  generatedAt: "2026-06-21T00:05:00.000Z",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  disclaimer: "AI는 보장이 아닌 참고 조언입니다. 투자 판단과 책임은 본인에게 있습니다.",
  marketContext: "기술주 중심으로 반등 흐름이 이어지고 있습니다.",
  universe: ["AAPL", "MSFT", "NVDA", "AMZN"],
  picks: [
    {
      symbol: "NVDA",
      companyName: "NVIDIA",
      rationale: "5년 추세가 견조하고 최근 1개월 모멘텀이 강합니다.",
      confidence: "high",
      risk: "high",
      action: "변동성이 크므로 분할 매수를 고려하세요.",
      backtest: {
        symbol: "NVDA",
        strategy: "trend-momentum(sma50/200)",
        from: "2021-06-21",
        to: "2026-06-18",
        dataPoints: 1255,
        trades: 18,
        winRatePct: 38.89,
        avgTradeReturnPct: 6.2,
        cumulativeReturnPct: 142.3,
        benchmarkSymbol: "SPY",
        benchmarkReturnPct: 89.8,
        excessReturnPct: 52.5,
        maxDrawdownPct: -31.4,
      },
    },
    {
      symbol: "MSFT",
      companyName: "Microsoft",
      rationale: "200일선 위에서 안정적인 우상향 추세를 유지하고 있습니다.",
      confidence: "high",
      risk: "low",
      backtest: {
        symbol: "MSFT",
        strategy: "trend-momentum(sma50/200)",
        from: "2021-06-21",
        to: "2026-06-18",
        dataPoints: 1255,
        trades: 12,
        winRatePct: 50,
        avgTradeReturnPct: 4.1,
        cumulativeReturnPct: 61.2,
        benchmarkSymbol: "SPY",
        benchmarkReturnPct: 89.8,
        excessReturnPct: -28.6,
        maxDrawdownPct: -19.7,
      },
    },
    {
      symbol: "AAPL",
      companyName: "Apple",
      rationale: "최근 조정 후 반등 신호가 관찰됩니다.",
      confidence: "medium",
      risk: "medium",
      // No backtest attached → the panel shows the honest "결과 없음" state.
    },
  ],
};
