/**
 * Deterministic long-term + recent-trend feature extraction.
 *
 * Per SPEC §3.3 (Architect): per-stock math is done with simple deterministic
 * computation, NOT per-stock LLM calls. These compact numeric features are what
 * the single daily LLM oneshot reasons over — sending 5 years of raw candles per
 * ticker would blow the token budget (TOKEN/비용 효율 계약). The LLM synthesizes;
 * the indicators here do the measuring.
 *
 * Pure functions only — trivially unit-testable, and reused by the backtester
 * (Task 3) and scorecard (Task 4).
 */

import type { Candle, HistoricalSeries } from "../market/types.js";

/** Compact feature summary for one ticker, fed to the prompt. */
export interface TickerFeatures {
  symbol: string;
  companyName?: string;
  lastClose: number;
  asOf: string;
  /** Trailing returns in %, null when the window exceeds available history. */
  return1W: number | null;
  return1M: number | null;
  return3M: number | null;
  return1Y: number | null;
  return5Y: number | null;
  /** Annualized volatility of daily returns, in %. */
  annualizedVolatilityPct: number | null;
  /** Worst peak-to-trough decline over the series, in % (negative). */
  maxDrawdownPct: number | null;
  sma50: number | null;
  sma200: number | null;
  /** Latest close vs the 200-day SMA, in % (positive = above). */
  priceVsSma200Pct: number | null;
  aboveSma200: boolean | null;
  /** ~20 trading-day momentum, in %. */
  recentTrendPct: number | null;
  dataPoints: number;
  /** A few recent verified news/disclosure headlines, if available. */
  recentHeadlines?: string[];
}

const TRADING_DAYS_PER_YEAR = 252;
const WINDOWS = { week: 5, month: 21, quarter: 63, year: 252 } as const;

/** Use adjusted close for return math (handles splits/dividends). */
function adj(c: Candle): number {
  return c.adjClose;
}

/** Percent change between two prices, or null if `from` is non-positive. */
function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

/** Trailing return over `window` trading days from the end of the series. */
function trailingReturn(candles: Candle[], window: number): number | null {
  if (candles.length <= window) return null;
  const last = candles[candles.length - 1];
  const prior = candles[candles.length - 1 - window];
  if (!last || !prior) return null;
  return pctChange(adj(prior), adj(last));
}

function fullReturn(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) return null;
  return pctChange(adj(first), adj(last));
}

/** Annualized volatility (%) from daily simple returns. */
export function annualizedVolatility(candles: Candle[]): number | null {
  if (candles.length < 20) return null;
  const rets: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) continue;
    const p0 = adj(prev);
    if (p0 <= 0) continue;
    rets.push((adj(cur) - p0) / p0);
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/** Max peak-to-trough decline (%) over the series — a negative number (MDD). */
export function maxDrawdown(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  let peak = -Infinity;
  let worst = 0;
  for (const c of candles) {
    const v = adj(c);
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = ((v - peak) / peak) * 100;
      if (dd < worst) worst = dd;
    }
  }
  return worst;
}

/** Simple moving average of the last `period` closes, or null if too short. */
export function sma(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    if (!c) return null;
    sum += adj(c);
  }
  return sum / period;
}

/**
 * Compute the compact feature set for one symbol from its (ascending) history.
 * `headlines` are optional verified news/disclosure titles to enrich the prompt.
 */
export function buildTickerFeatures(
  series: HistoricalSeries,
  headlines?: string[],
): TickerFeatures {
  const candles = series.candles;
  const last = candles[candles.length - 1];
  const lastClose = last ? adj(last) : 0;
  const sma200 = sma(candles, 200);

  return {
    symbol: series.symbol,
    lastClose: round(lastClose, 4) ?? 0,
    asOf: series.to,
    return1W: round(trailingReturn(candles, WINDOWS.week)),
    return1M: round(trailingReturn(candles, WINDOWS.month)),
    return3M: round(trailingReturn(candles, WINDOWS.quarter)),
    return1Y: round(trailingReturn(candles, WINDOWS.year)),
    return5Y: round(fullReturn(candles)),
    annualizedVolatilityPct: round(annualizedVolatility(candles)),
    maxDrawdownPct: round(maxDrawdown(candles)),
    sma50: round(sma(candles, 50), 4),
    sma200: round(sma200, 4),
    priceVsSma200Pct: round(sma200 ? pctChange(sma200, lastClose) : null),
    aboveSma200: sma200 == null ? null : lastClose >= sma200,
    recentTrendPct: round(trailingReturn(candles, WINDOWS.month)),
    dataPoints: candles.length,
    recentHeadlines: headlines && headlines.length > 0 ? headlines.slice(0, 5) : undefined,
  };
}

function round(v: number | null, digits = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
