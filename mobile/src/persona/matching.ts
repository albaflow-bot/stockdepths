/**
 * Pure persona ↔ pick-volatility matching (SPEC §3.2: persona "determines stock
 * volatility matching"). No I/O — directly unit-testable.
 */

import type { BadgeLevel } from "../types/picks";
import type { InvestorProfile, PersonaConfig } from "./types";

export const PROFILE_LABEL: Record<InvestorProfile, string> = {
  conservative: "안정형",
  neutral: "중립형",
  aggressive: "공격형",
};

export interface PresetInfo {
  profile: InvestorProfile;
  label: string;
  summary: string;
}

export const PRESET_INFO: PresetInfo[] = [
  { profile: "conservative", label: "안정형", summary: "변동성이 낮고 추세가 견조한 종목 위주" },
  { profile: "neutral", label: "중립형", summary: "추세와 리스크의 균형" },
  { profile: "aggressive", label: "공격형", summary: "높은 변동성을 감수하고 강한 모멘텀 추구" },
];

/**
 * The profile a config behaves like for matching. Preset → its profile; custom →
 * derived from its stop-loss appetite (a tighter stop = more conservative).
 */
export function effectiveProfile(config: PersonaConfig): InvestorProfile {
  if (config.mode === "preset" && config.profile) return config.profile;
  if (config.stopLossPct <= 6) return "conservative";
  if (config.stopLossPct <= 12) return "neutral";
  return "aggressive";
}

/** Risk levels a persona is comfortable holding. */
export function acceptableRisks(config: PersonaConfig): BadgeLevel[] {
  switch (effectiveProfile(config)) {
    case "conservative":
      return ["low"];
    case "neutral":
      return ["low", "medium"];
    case "aggressive":
      return ["low", "medium", "high"];
  }
}

/** Whether a pick's risk badge fits the persona's volatility tolerance. */
export function pickMatchesPersona(risk: BadgeLevel, config: PersonaConfig): boolean {
  return acceptableRisks(config).includes(risk);
}

/** Short human label for the active persona. */
export function personaLabel(config: PersonaConfig): string {
  return config.mode === "custom" ? "직접 설정" : PROFILE_LABEL[config.profile ?? "neutral"];
}
