/**
 * Pure geometry helpers for the infographic charts (bar widths, win-rate fill).
 * No React — directly unit-testable.
 */

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Fraction (0..1) of |value| relative to a max magnitude. */
export function barFraction(value: number | null | undefined, maxAbs: number): number {
  if (value == null || !Number.isFinite(value) || maxAbs <= 0) return 0;
  return clamp01(Math.abs(value) / maxAbs);
}

/** A CSS-style percentage width string for a 0..1 fraction. */
export function pctWidth(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

/** Win-rate (0..100) → fill fraction (0..1). */
export function winRateFraction(winRatePct: number | null | undefined): number {
  if (winRatePct == null || !Number.isFinite(winRatePct)) return 0;
  return clamp01(winRatePct / 100);
}

/** Max magnitude across a set of values (for normalizing comparison bars). */
export function maxMagnitude(...values: Array<number | null | undefined>): number {
  let m = 0;
  for (const v of values) {
    if (v != null && Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  }
  return m;
}
