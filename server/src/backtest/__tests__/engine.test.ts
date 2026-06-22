import { describe, it, expect } from "vitest";
import { runBacktest } from "../engine.js";
import { rollingSma, trendMomentumStrategy } from "../strategies.js";
import { BacktestError } from "../types.js";
import type { Candle } from "../../market/types.js";

/** Build an ascending-date candle series from a list of closes (adjClose = close). */
function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => {
    const d = new Date(Date.UTC(2019, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    return { date: d, open: c, high: c, low: c, close: c, adjClose: c, volume: 1000 };
  });
}

const FLAT_BENCH = (n: number) => candles(new Array(n).fill(100));

describe("rollingSma", () => {
  it("is null before the window fills, then the trailing mean", () => {
    const s = rollingSma([1, 2, 3, 4, 5], 3);
    expect(s.slice(0, 2)).toEqual([null, null]);
    expect(s[2]).toBe(2); // (1+2+3)/3
    expect(s[4]).toBe(4); // (3+4+5)/3
  });
});

describe("runBacktest", () => {
  const strat = trendMomentumStrategy({ shortWindow: 5, longWindow: 10 });

  it("throws BacktestError on insufficient overlapping data", () => {
    expect(() =>
      runBacktest(candles([1, 2, 3]), FLAT_BENCH(3), {
        symbol: "X",
        benchmarkSymbol: "SPY",
        strategy: strat,
      }),
    ).toThrow(BacktestError);
  });

  it("a steady uptrend yields one winning trade and positive excess vs a flat benchmark", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i); // monotonic up
    const r = runBacktest(candles(closes), FLAT_BENCH(60), {
      symbol: "UP",
      benchmarkSymbol: "SPY",
      strategy: strat,
    });
    expect(r.symbol).toBe("UP");
    expect(r.trades).toBe(1); // enters after warmup, never exits
    expect(r.winRatePct).toBe(100);
    expect(r.cumulativeReturnPct).toBeGreaterThan(0);
    expect(r.avgTradeReturnPct).toBeGreaterThan(0);
    expect(r.benchmarkReturnPct).toBe(0); // flat benchmark
    expect(r.excessReturnPct).toBeCloseTo(r.cumulativeReturnPct, 5);
    expect(r.maxDrawdownPct).toBeLessThanOrEqual(0);
  });

  it("a persistent downtrend never enters: 0 trades, 0% strategy return, negative excess", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 200 - i); // monotonic down
    const r = runBacktest(candles(closes), FLAT_BENCH(60), {
      symbol: "DOWN",
      benchmarkSymbol: "SPY",
      strategy: strat,
    });
    expect(r.trades).toBe(0);
    expect(r.winRatePct).toBeNull();
    expect(r.avgTradeReturnPct).toBeNull();
    expect(r.cumulativeReturnPct).toBe(0); // stayed in cash → no loss
    expect(r.maxDrawdownPct).toBe(0);
  });

  it("computes benchmark-relative excess correctly when the benchmark rises", () => {
    // asset doubles over the window; benchmark rises 100% too → small/zero excess
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const benchCloses = Array.from({ length: 60 }, (_, i) => 100 + i);
    const r = runBacktest(candles(closes), candles(benchCloses), {
      symbol: "A",
      benchmarkSymbol: "SPY",
      strategy: strat,
    });
    expect(r.benchmarkReturnPct).toBeCloseTo((159 / 100 - 1) * 100, 2);
    expect(r.excessReturnPct).toBeCloseTo(r.cumulativeReturnPct - r.benchmarkReturnPct, 2);
  });

  it("aligns asset to benchmark dates (mismatched calendars are intersected)", () => {
    const asset = candles(Array.from({ length: 30 }, (_, i) => 100 + i));
    // benchmark missing the last 5 dates → window shrinks to 25 bars
    const bench = candles(new Array(25).fill(100));
    const r = runBacktest(asset, bench, {
      symbol: "A",
      benchmarkSymbol: "SPY",
      strategy: trendMomentumStrategy({ shortWindow: 3, longWindow: 5 }),
    });
    expect(r.dataPoints).toBe(25);
    expect(r.to).toBe(asset[24]!.date);
  });

  it("a choppy series produces multiple trades with a sane win rate", () => {
    // up-trend with periodic dips below the short SMA to force exits/re-entries
    const closes: number[] = [];
    for (let i = 0; i < 80; i++) {
      const base = 100 + i;
      closes.push(i % 12 === 0 && i > 0 ? base - 25 : base);
    }
    const r = runBacktest(candles(closes), FLAT_BENCH(80), {
      symbol: "CHOP",
      benchmarkSymbol: "SPY",
      strategy: trendMomentumStrategy({ shortWindow: 5, longWindow: 10 }),
    });
    expect(r.trades).toBeGreaterThan(1);
    expect(r.winRatePct).not.toBeNull();
    expect(r.winRatePct!).toBeGreaterThanOrEqual(0);
    expect(r.winRatePct!).toBeLessThanOrEqual(100);
  });
});
