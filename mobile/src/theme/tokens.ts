/**
 * Design tokens for the client.
 *
 * No design.md was present when this screen was built, so these tokens ARE the
 * design system of record. If a design.md is later added, it governs and these
 * values should be reconciled to it (per CLAUDE.md: design.md, 있으면 따라야 함).
 *
 * Aesthetic: a calm, trust-first finance palette (deep navy primary, restrained
 * neutrals, semantic green/amber/red for badges) — deliberately not a generic
 * purple-gradient look. UI copy is Korean.
 */

export const tokens = {
  color: {
    bg: "#F4F6F8",
    surface: "#FFFFFF",
    surfaceAlt: "#F0F3F6",
    border: "#E2E8F0",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",

    primary: "#13314F", // deep navy
    primaryText: "#FFFFFF",

    positive: "#15803D",
    negative: "#B91C1C",
    warning: "#B45309",

    // Badge tone surfaces (soft bg + readable fg).
    positiveBg: "#DCFCE7",
    positiveFg: "#166534",
    negativeBg: "#FEE2E2",
    negativeFg: "#991B1B",
    warningBg: "#FEF3C7",
    warningFg: "#92400E",
    neutralBg: "#E0E7FF",
    neutralFg: "#3730A3",
    mutedBg: "#E2E8F0",
    mutedFg: "#475569",

    disclaimerBg: "#FEF9C3",
    disclaimerBorder: "#FDE047",
    disclaimerFg: "#713F12",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 14, pill: 999 },
  font: {
    size: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 },
    weight: { regular: "400", medium: "600", bold: "700" } as const,
  },
} as const;

/** Cross-platform soft elevation (web boxShadow / native shadow*). */
export const cardShadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export type BadgeTone = "positive" | "neutral" | "warning" | "negative" | "muted";

export const badgeColors: Record<BadgeTone, { bg: string; fg: string }> = {
  positive: { bg: tokens.color.positiveBg, fg: tokens.color.positiveFg },
  neutral: { bg: tokens.color.neutralBg, fg: tokens.color.neutralFg },
  warning: { bg: tokens.color.warningBg, fg: tokens.color.warningFg },
  negative: { bg: tokens.color.negativeBg, fg: tokens.color.negativeFg },
  muted: { bg: tokens.color.mutedBg, fg: tokens.color.mutedFg },
};
