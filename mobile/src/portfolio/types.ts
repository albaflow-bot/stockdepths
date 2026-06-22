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
}

/** Raised on invalid watchlist/holding input — carries a Korean message for the UI. */
export class PortfolioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioValidationError";
  }
}
