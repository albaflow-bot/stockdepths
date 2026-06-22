/**
 * Investment persona domain (SPEC §3.2: Conservative / Neutral / Aggressive, or a
 * custom target return % + stop-loss %). Stored locally; used to match pick
 * volatility and to seed alert thresholds.
 */

export type InvestorProfile = "conservative" | "neutral" | "aggressive";
export type PersonaMode = "preset" | "custom";

/** Default {target%, stop%} per preset (mirrors the server rule engine, SPEC §3.2). */
export const PRESET_THRESHOLDS: Record<InvestorProfile, { target: number; stop: number }> = {
  conservative: { target: 10, stop: 5 },
  neutral: { target: 20, stop: 10 },
  aggressive: { target: 40, stop: 20 },
};

/** The persisted persona configuration. */
export interface PersonaConfig {
  mode: PersonaMode;
  /** Present when mode === "preset". */
  profile?: InvestorProfile;
  /** Effective target gain %, resolved (preset default or custom input). */
  targetReturnPct: number;
  /** Effective stop-loss %, resolved (positive number). */
  stopLossPct: number;
  /** ISO timestamp the persona was set. */
  setAt: string;
}

export class PersonaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonaValidationError";
  }
}
