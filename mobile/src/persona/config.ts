/**
 * Pure builders for a PersonaConfig (validation lives here, no I/O).
 */

import {
  PRESET_THRESHOLDS,
  PersonaValidationError,
  type InvestorProfile,
  type PersonaConfig,
} from "./types";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Build a preset persona from one of the three profiles. */
export function buildPresetConfig(profile: InvestorProfile, setAt: string): PersonaConfig {
  const t = PRESET_THRESHOLDS[profile];
  return { mode: "preset", profile, targetReturnPct: t.target, stopLossPct: t.stop, setAt };
}

/** Build a custom persona from user-entered target/stop (both must be > 0). */
export function buildCustomConfig(
  targetReturnPct: number,
  stopLossPct: number,
  setAt: string,
): PersonaConfig {
  if (!Number.isFinite(targetReturnPct) || targetReturnPct <= 0) {
    throw new PersonaValidationError("목표 수익률은 0보다 큰 숫자여야 합니다.");
  }
  if (!Number.isFinite(stopLossPct) || stopLossPct <= 0) {
    throw new PersonaValidationError("손절선은 0보다 큰 숫자여야 합니다.");
  }
  return {
    mode: "custom",
    targetReturnPct: round2(targetReturnPct),
    stopLossPct: round2(stopLossPct),
    setAt,
  };
}
