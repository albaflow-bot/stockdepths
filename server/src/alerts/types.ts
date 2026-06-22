/**
 * On-device alert rule engine — types (SPEC Task 5).
 *
 * SPEC §3.2: per-user holdings (cost basis) live in on-device storage only (no
 * login). So target-price / stop-loss alerts MUST be evaluated on-device — the
 * server never sees a user's portfolio. This module is therefore PURE, portable
 * TypeScript with ZERO Node/runtime dependencies, so the Expo/React Native client
 * imports it unchanged. Deterministic math only — no per-user LLM (SPEC Task 5).
 */

/** Investment persona (SPEC §3.2). Drives default target/stop thresholds. */
export type InvestorProfile = "conservative" | "neutral" | "aggressive";

/** A user holding kept on-device. cost basis is the only required field. */
export interface Holding {
  symbol: string;
  /** Average purchase price (per share). */
  costBasis: number;
  quantity?: number;
  /** Absolute target price override; takes precedence over targetReturnPct. */
  targetPrice?: number;
  /** Absolute stop-loss price override; takes precedence over stopLossPct. */
  stopLossPrice?: number;
  /** Target as a % gain over cost basis (e.g. 20 = +20%). */
  targetReturnPct?: number;
  /** Stop-loss as a % drop below cost basis (e.g. 10 = -10%, positive number). */
  stopLossPct?: number;
}

/** Minimal quote shape the engine needs — structurally compatible with market Quote. */
export interface QuoteLike {
  symbol: string;
  price: number;
  /** Today's % change, used to enrich the contextual note when present. */
  changePercent?: number;
  asOf?: string;
}

export type AlertKind =
  | "target_reached"
  | "stop_loss"
  | "approaching_target"
  | "approaching_stop";

/** `action` = a threshold was hit; `info` = approaching a threshold. */
export type AlertSeverity = "action" | "info";

/** A single emitted alert with a one-line Korean contextual note. */
export interface Alert {
  symbol: string;
  kind: AlertKind;
  severity: AlertSeverity;
  currentPrice: number;
  costBasis: number;
  /** Current return vs cost basis, in %. */
  returnPct: number;
  targetPrice: number;
  stopLossPrice: number;
  /** Distance to the relevant threshold in %, for `approaching_*` alerts. */
  distanceToThresholdPct?: number;
  /** One-line contextual buy/sell note (Korean, no LLM). */
  note: string;
  asOf?: string;
}

/** Engine configuration (defaults + persona). */
export interface RuleConfig {
  /** Persona supplying default thresholds when a holding has none. */
  profile?: InvestorProfile;
  /** Explicit default target % (overrides persona default). */
  defaultTargetReturnPct?: number;
  /** Explicit default stop-loss % (overrides persona default). */
  defaultStopLossPct?: number;
  /**
   * Emit an `approaching_*` alert when price is within this % of a not-yet-hit
   * threshold. Default 2. Set 0 to disable approaching alerts.
   */
  nearThresholdPct?: number;
}
