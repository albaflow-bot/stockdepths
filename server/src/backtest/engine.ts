/**
 * Backtest engine — pure simulation of a long-only strategy vs an S&P 500
 * benchmark over a shared date window.
 *
 * No lookahead: the position applied to bar t's return is the signal computed at
 * bar t-1 (you act on the prior close). Cash days contribute a 1.0 equity factor.
 * Asset and benchmark are aligned on common calendar dates (same exchange
 * calendar) so the excess return compares like-for-like windows.
 */

import type { Candle } from "../market/types.js";
import { BacktestError, type BacktestResult, type Strategy } from "./types.js";
import { DEFAULT_STRATEGY } from "./strategies.js";

export interface RunBacktestOptions {
  symbol: string;
  benchmarkSymbol: string;
  strategy?: Strategy;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Align asset candles to dates also present in the benchmark, preserving order. */
function alignByDate(
  asset: Candle[],
  benchmark: Candle[],
): { asset: Candle[]; benchClose: number[] } {
  const benchMap = new Map<string, number>();
  for (const c of benchmark) benchMap.set(c.date, c.adjClose);
  const alignedAsset: Candle[] = [];
  const benchClose: number[] = [];
  for (const c of asset) {
    const b = benchMap.get(c.date);
    if (b != null) {
      alignedAsset.push(c);
      benchClose.push(b);
    }
  }
  return { asset: alignedAsset, benchClose };
}

/**
 * Run the backtest. Throws {@link BacktestError} when there is too little
 * overlapping data for the strategy to warm up.
 */
export function runBacktest(
  assetCandles: Candle[],
  benchmarkCandles: Candle[],
  opts: RunBacktestOptions,
): BacktestResult {
  const strategy = opts.strategy ?? DEFAULT_STRATEGY;
  const { asset, benchClose } = alignByDate(assetCandles, benchmarkCandles);
  const n = asset.length;

  if (n < strategy.minBars + 2) {
    throw new BacktestError(
      `insufficient overlapping data for ${opts.symbol}: ${n} bars, need ${strategy.minBars + 2}`,
    );
  }

  const closes = asset.map((c) => c.adjClose);
  const signals = strategy.signals(asset);

  // positions[t] = signals[t-1] (no lookahead); positions[0] = 0.
  // dailyRet[t] = asset return on bar t; strategyRet[t] = positions[t] * dailyRet[t].
  const dailyRet: number[] = new Array(n).fill(0);
  const positions: number[] = new Array(n).fill(0);
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (let t = 1; t < n; t++) {
    const prev = closes[t - 1]!;
    dailyRet[t] = prev > 0 ? closes[t]! / prev - 1 : 0;
    positions[t] = signals[t - 1]!;
    equity *= 1 + positions[t]! * dailyRet[t]!;
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  // Extract completed trades as maximal holding runs; trade return compounds the
  // daily returns inside the run (consistent with the equity curve).
  const tradeReturns: number[] = [];
  let t = 1;
  while (t < n) {
    if (positions[t] === 1) {
      let factor = 1;
      while (t < n && positions[t] === 1) {
        factor *= 1 + dailyRet[t]!;
        t++;
      }
      tradeReturns.push(factor - 1);
    } else {
      t++;
    }
  }

  const cumulativeReturnPct = (equity - 1) * 100;
  const wins = tradeReturns.filter((r) => r > 0).length;
  const winRatePct = tradeReturns.length > 0 ? (wins / tradeReturns.length) * 100 : null;
  const avgTradeReturnPct =
    tradeReturns.length > 0
      ? (tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length) * 100
      : null;

  const benchFirst = benchClose[0]!;
  const benchLast = benchClose[n - 1]!;
  const benchmarkReturnPct = benchFirst > 0 ? (benchLast / benchFirst - 1) * 100 : 0;

  return {
    symbol: opts.symbol.toUpperCase(),
    strategy: strategy.name,
    from: asset[0]!.date,
    to: asset[n - 1]!.date,
    dataPoints: n,
    trades: tradeReturns.length,
    winRatePct: winRatePct == null ? null : round2(winRatePct),
    avgTradeReturnPct: avgTradeReturnPct == null ? null : round2(avgTradeReturnPct),
    cumulativeReturnPct: round2(cumulativeReturnPct),
    benchmarkSymbol: opts.benchmarkSymbol.toUpperCase(),
    benchmarkReturnPct: round2(benchmarkReturnPct),
    excessReturnPct: round2(cumulativeReturnPct - benchmarkReturnPct),
    maxDrawdownPct: round2(maxDrawdown * 100),
  };
}
