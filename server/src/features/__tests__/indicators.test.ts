import { describe, it, expect } from "vitest";
import {
  buildTickerFeatures,
  annualizedVolatility,
  maxDrawdown,
  sma,
} from "../indicators.js";
import type { Candle, HistoricalSeries } from "../../market/types.js";

/** Build a synthetic ascending series from a list of closes. */
function seriesFromCloses(closes: number[], symbol = "TEST"): HistoricalSeries {
  const candles: Candle[] = closes.map((c, i) => ({
    date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
    open: c,
    high: c,
    low: c,
    close: c,
    adjClose: c,
    volume: 1000,
  }));
  return {
    symbol,
    market: "US",
    candles,
    from: candles[0]!.date,
    to: candles[candles.length - 1]!.date,
    source: "test",
  };
}

describe("sma", () => {
  it("averages the last N closes", () => {
    expect(sma(seriesFromCloses([1, 2, 3, 4, 5]).candles, 5)).toBe(3);
    expect(sma(seriesFromCloses([10, 20, 30]).candles, 2)).toBe(25);
  });
  it("returns null when the series is shorter than the period", () => {
    expect(sma(seriesFromCloses([1, 2]).candles, 5)).toBeNull();
  });
});

describe("maxDrawdown", () => {
  it("computes the worst peak-to-trough decline as a negative percent", () => {
    // peak 100 → trough 50 = -50%
    const dd = maxDrawdown(seriesFromCloses([100, 120, 60, 80, 90]).candles);
    expect(dd).toBeCloseTo(-50, 5); // peak 120 → 60
  });
  it("is 0 for a monotonically rising series", () => {
    expect(maxDrawdown(seriesFromCloses([1, 2, 3, 4]).candles)).toBe(0);
  });
});

describe("annualizedVolatility", () => {
  it("is 0 for a flat series", () => {
    const closes = new Array(30).fill(100);
    expect(annualizedVolatility(seriesFromCloses(closes).candles)).toBeCloseTo(0, 6);
  });
  it("is positive for a fluctuating series", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const vol = annualizedVolatility(seriesFromCloses(closes).candles);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(0);
  });
});

describe("buildTickerFeatures", () => {
  it("computes trailing returns and flags trend vs SMA200", () => {
    // 260 ascending points → above SMA200, positive returns
    const closes = Array.from({ length: 260 }, (_, i) => 100 + i);
    const f = buildTickerFeatures(seriesFromCloses(closes, "UP"));
    expect(f.symbol).toBe("UP");
    expect(f.lastClose).toBe(359);
    expect(f.return5Y).toBeGreaterThan(0);
    expect(f.return1W).toBeGreaterThan(0);
    expect(f.aboveSma200).toBe(true);
    expect(f.priceVsSma200Pct).toBeGreaterThan(0);
    expect(f.dataPoints).toBe(260);
  });

  it("nulls out windows longer than the available history", () => {
    const f = buildTickerFeatures(seriesFromCloses([10, 11, 12], "SHORT"));
    expect(f.return1Y).toBeNull();
    expect(f.sma200).toBeNull();
    expect(f.aboveSma200).toBeNull();
    expect(f.return5Y).not.toBeNull(); // full-series return still computable
  });

  it("attaches up to 5 recent headlines", () => {
    const f = buildTickerFeatures(seriesFromCloses([1, 2, 3]), [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ]);
    expect(f.recentHeadlines).toHaveLength(5);
  });
});
