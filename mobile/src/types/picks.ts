/**
 * Client-side mirror of the server's daily-picks contract (server Tasks 2–4).
 *
 * Kept as a thin local copy so the mobile package stays decoupled from the server
 * package's build. Shapes must match server `DailyPicksArtifact` / `Pick` /
 * `BacktestResult` on the wire.
 */

export type BadgeLevel = "low" | "medium" | "high";

/** 5-year automatic backtest snapshot attached to a pick (server Task 3). */
export interface BacktestResult {
  symbol: string;
  strategy: string;
  from: string;
  to: string;
  dataPoints: number;
  trades: number;
  winRatePct: number | null;
  avgTradeReturnPct: number | null;
  cumulativeReturnPct: number;
  benchmarkSymbol: string;
  benchmarkReturnPct: number;
  excessReturnPct: number;
  maxDrawdownPct: number;
}

/** A single recommended stock. */
export interface Pick {
  symbol: string;
  companyName?: string;
  rationale: string;
  confidence: BadgeLevel;
  risk: BadgeLevel;
  action?: string;
  backtest?: BacktestResult;
}

/** The shared public "today's picks" artifact. */
export interface DailyPicksArtifact {
  market: string;
  date: string;
  generatedAt: string;
  picks: Pick[];
  marketContext: string;
  provider: string;
  model: string;
  disclaimer: string;
  universe: string[];
}
