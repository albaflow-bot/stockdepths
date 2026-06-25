/**
 * Watchlist & holdings domain types (SPEC §3.2: client-side portfolio, local only).
 */

export interface WatchlistItem {
  symbol: string;
  /** ISO timestamp added. */
  addedAt: string;
}

export interface Holding {
  /** Stable local id. */
  id: string;
  symbol: string;
  /** Average purchase price per share (user-entered). */
  costBasis: number;
  /** Optional share count; required for value/gain totals, not for return %. */
  quantity?: number;
  note?: string;
  createdAt: string;
  // --- OnDeviceRule thresholds (local; SPEC §5.4 OnDeviceRule input). All optional;
  // when absent the persona's target/stop % defaults apply. An absolute price
  // override takes precedence over the % form (mirrors the server rule engine).
  /** Absolute target price override. */
  targetPrice?: number;
  /** Absolute stop-loss price override. */
  stopLossPrice?: number;
  /** Target as a % gain over cost basis (e.g. 20 = +20%). */
  targetReturnPct?: number;
  /** Stop-loss as a % drop below cost basis (positive number, e.g. 10 = -10%). */
  stopLossPct?: number;
}

export interface Portfolio {
  watchlist: WatchlistItem[];
  holdings: Holding[];
}

export const EMPTY_PORTFOLIO: Portfolio = { watchlist: [], holdings: [] };

/** Input for adding a holding (id/createdAt are assigned by the repository). */
export interface HoldingInput {
  symbol: string;
  costBasis: number;
  quantity?: number;
  note?: string;
  /** Optional OnDeviceRule thresholds (local). See {@link Holding}. */
  targetPrice?: number;
  stopLossPrice?: number;
  targetReturnPct?: number;
  stopLossPct?: number;
}

/** Raised on invalid watchlist/holding input — carries a Korean message for the UI. */
export class PortfolioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioValidationError";
  }
}
