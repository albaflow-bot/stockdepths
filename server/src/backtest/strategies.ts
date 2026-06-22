/**
 * Backtest strategies — deterministic, explainable rules that stand in for the
 * LLM's selection signal so the 5-year backtest is reproducible.
 *
 * The default mirrors the app's two-axis thesis (SPEC §장기 추세 × 최근 동향):
 * hold only while the long-term trend is up (price ≥ 200-day SMA) AND recent
 * strength holds (price ≥ 50-day SMA); otherwise sit in cash. This is a classic
 * long-only trend filter — easy to explain on the recommendation card.
 */

import type { Candle } from "../market/types.js";
import type { Strategy } from "./types.js";

/** Rolling simple moving average; entries are null until `period` bars exist. */
export function rollingSma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export interface TrendMomentumParams {
  shortWindow?: number;
  longWindow?: number;
}

/**
 * Long-only trend/momentum strategy: position 1 when close ≥ SMA(long) and
 * close ≥ SMA(short), else 0. Defaults: short 50, long 200.
 */
export function trendMomentumStrategy(params: TrendMomentumParams = {}): Strategy {
  const shortWindow = params.shortWindow ?? 50;
  const longWindow = params.longWindow ?? 200;
  return {
    name: `trend-momentum(sma${shortWindow}/${longWindow})`,
    minBars: longWindow,
    signals(candles: Candle[]): number[] {
      const closes = candles.map((c) => c.adjClose);
      const smaShort = rollingSma(closes, shortWindow);
      const smaLong = rollingSma(closes, longWindow);
      return closes.map((close, i) => {
        const s = smaShort[i];
        const l = smaLong[i];
        if (s == null || l == null) return 0;
        return close >= l && close >= s ? 1 : 0;
      });
    },
  };
}

/** The strategy used unless a caller overrides it. */
export const DEFAULT_STRATEGY = trendMomentumStrategy();
