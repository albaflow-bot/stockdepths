/**
 * Price lookup helpers for entry-context recording and scorecard recomputation.
 * Dates are ISO YYYY-MM-DD, so lexicographic comparison is chronological.
 */

import type { Candle } from "../market/types.js";

export interface PricePoint {
  price: number;
  date: string;
}

/**
 * An indexed adjClose series supporting fast "price on or before a date" lookups
 * via binary search — used in the scorecard's per-date basket loop.
 */
export class SeriesIndex {
  private readonly dates: string[];
  private readonly closes: number[];

  constructor(candles: Candle[]) {
    this.dates = candles.map((c) => c.date);
    this.closes = candles.map((c) => c.adjClose);
  }

  get length(): number {
    return this.dates.length;
  }

  /** adjClose on the latest trading day ≤ target, or null if none exists. */
  priceOnOrBefore(target: string): PricePoint | null {
    let lo = 0;
    let hi = this.dates.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.dates[mid]! <= target) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx === -1) return null;
    return { price: this.closes[idx]!, date: this.dates[idx]! };
  }

  /** Trading dates within [from, to] inclusive, ascending. */
  datesBetween(from: string, to: string): string[] {
    return this.dates.filter((d) => d >= from && d <= to);
  }
}

/** Max peak-to-trough decline (%) of an equity value series — a negative number. */
export function maxDrawdownFromValues(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = ((v - peak) / peak) * 100;
      if (dd < worst) worst = dd;
    }
  }
  return worst;
}
