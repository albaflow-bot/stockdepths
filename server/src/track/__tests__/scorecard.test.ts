import { describe, it, expect, vi } from "vitest";
import { ScorecardService, periodStart } from "../scorecard.js";
import { TrackRecordStore } from "../store.js";
import type { Candle, HistoricalSeries, MarketSourceAdapter } from "../../market/types.js";
import type { TrackRecordEntry } from "../types.js";

function series(symbol: string, points: Array<[string, number]>): HistoricalSeries {
  const candles: Candle[] = points.map(([date, close]) => ({
    date,
    open: close,
    high: close,
    low: close,
    close,
    adjClose: close,
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

function stubAdapter(map: Record<string, Array<[string, number]>>): MarketSourceAdapter {
  return {
    market: "US",
    getQuote: vi.fn(),
    getHistory: vi.fn(async (symbol: string) => {
      const pts = map[symbol.toUpperCase()];
      if (!pts) throw new Error(`no data for ${symbol}`);
      return series(symbol.toUpperCase(), pts);
    }),
    getNews: vi.fn(async () => []),
  };
}

function entry(over: Partial<TrackRecordEntry> & Pick<TrackRecordEntry, "date" | "symbol" | "entryPrice" | "benchmarkEntryPrice">): TrackRecordEntry {
  return {
    id: `US:${over.date}:${over.symbol}`,
    market: "US",
    confidence: "medium",
    risk: "medium",
    rationale: "r",
    entryPriceDate: over.date,
    benchmarkSymbol: "SPY",
    benchmarkEntryDate: over.date,
    loggedAt: "t",
    ...over,
  };
}

// AAPL: 100 → 120 (+20%). MSFT: 200 → 180 (-10%). SPY: entry 400/380, asOf 440.
const PRICES: Record<string, Array<[string, number]>> = {
  AAPL: [["2024-06-03", 100], ["2024-06-10", 110], ["2024-06-21", 120]],
  MSFT: [
    ["2024-01-02", 200],
    ["2024-03-01", 220],
    ["2024-05-01", 170],
    ["2024-06-21", 180],
  ],
  SPY: [
    ["2024-01-02", 380],
    ["2024-03-01", 400],
    ["2024-05-01", 410],
    ["2024-06-03", 400],
    ["2024-06-21", 440],
  ],
};

const ASOF = "2024-06-21";

function buildStore(): TrackRecordStore {
  const store = new TrackRecordStore({ file: null });
  store.append([
    entry({ date: "2024-06-03", symbol: "AAPL", entryPrice: 100, benchmarkEntryPrice: 400 }),
    entry({ date: "2024-01-10", symbol: "MSFT", entryPrice: 200, benchmarkEntryPrice: 380, entryPriceDate: "2024-01-02" }),
  ]);
  return store;
}

describe("periodStart", () => {
  it("computes inclusive lower bounds relative to asOf", () => {
    expect(periodStart("2024-06-21", "1W")).toBe("2024-06-14");
    expect(periodStart("2024-06-21", "1M")).toBe("2024-05-21");
    expect(periodStart("2024-06-21", "3M")).toBe("2024-03-21");
    expect(periodStart("2024-06-21", "1Y")).toBe("2023-06-22"); // 최근 365일 trailing
    expect(periodStart("2024-06-21", "ALL")).toBe("0000-01-01");
  });
});

describe("ScorecardService", () => {
  it("derives realized returns, hit rate and benchmark-relative excess for ALL", async () => {
    const sc = await new ScorecardService(buildStore(), stubAdapter(PRICES)).compute(ASOF, ["ALL"]);
    const all = sc.periods[0]!;
    expect(sc.totalRecommendations).toBe(2);
    expect(all.evaluated).toBe(2);
    expect(all.winRatePct).toBe(50); // AAPL win, MSFT loss
    expect(all.avgTradeReturnPct).toBeCloseTo(5, 2); // mean(+20, -10)
    expect(all.benchmarkReturnPct).toBeCloseTo((10 + (440 / 380 - 1) * 100) / 2, 2);
    expect(all.excessReturnPct).toBeCloseTo(all.cumulativeReturnPct! - all.benchmarkReturnPct!, 2);
    expect(all.best).toEqual({ symbol: "AAPL", date: "2024-06-03", returnPct: 20 });
    expect(all.worst).toEqual({ symbol: "MSFT", date: "2024-01-10", returnPct: -10 });
    expect(all.maxDrawdownPct).not.toBeNull();
    expect(all.maxDrawdownPct!).toBeLessThan(0); // MSFT dip drags the basket down
  });

  it("filters recommendations by period (1M excludes the older entry)", async () => {
    const sc = await new ScorecardService(buildStore(), stubAdapter(PRICES)).compute(ASOF, ["1M"]);
    const m = sc.periods[0]!;
    expect(m.recommendations).toBe(1); // only AAPL (2024-06-03)
    expect(m.evaluated).toBe(1);
    expect(m.winRatePct).toBe(100);
    expect(m.avgTradeReturnPct).toBeCloseTo(20, 2);
    expect(m.excessReturnPct).toBeCloseTo(10, 2); // 20% asset − 10% benchmark
  });

  it("returns null metrics for a period with no recommendations", async () => {
    const sc = await new ScorecardService(buildStore(), stubAdapter(PRICES)).compute(ASOF, ["1W"]);
    const m = sc.periods[0]!;
    expect(m.recommendations).toBe(0);
    expect(m.winRatePct).toBeNull();
    expect(m.excessReturnPct).toBeNull();
  });

  it("leaves entries un-evaluated (not crashing) when a symbol's prices are unavailable", async () => {
    const noMsft: Record<string, Array<[string, number]>> = { AAPL: PRICES.AAPL!, SPY: PRICES.SPY! };
    const sc = await new ScorecardService(buildStore(), stubAdapter(noMsft)).compute(ASOF, ["ALL"]);
    const all = sc.periods[0]!;
    expect(all.recommendations).toBe(2);
    expect(all.evaluated).toBe(1); // MSFT unpriceable, AAPL still evaluated
    expect(all.winRatePct).toBe(100);
  });

  it("aggregates the logged 5Y backtest snapshots per period (realized 옆 비교)", async () => {
    const store = new TrackRecordStore({ file: null });
    const bt = (excess: number, win: number, avg: number, mdd: number) => ({
      symbol: "X",
      strategy: "trend-momentum",
      from: "2021-06-21",
      to: "2026-06-21",
      dataPoints: 1255,
      trades: 10,
      winRatePct: win,
      avgTradeReturnPct: avg,
      cumulativeReturnPct: 50,
      benchmarkSymbol: "SPY",
      benchmarkReturnPct: 40,
      excessReturnPct: excess,
      maxDrawdownPct: mdd,
    });
    store.append([
      entry({ date: "2024-06-03", symbol: "AAPL", entryPrice: 100, benchmarkEntryPrice: 400, backtest: bt(10, 40, 6, -20) }),
      entry({ date: "2024-06-04", symbol: "MSFT", entryPrice: 100, benchmarkEntryPrice: 400, backtest: bt(20, 60, 8, -30) }),
    ]);
    const prices: Record<string, Array<[string, number]>> = {
      ...PRICES,
      MSFT: [["2024-06-04", 100], ["2024-06-21", 110]],
    };
    const sc = await new ScorecardService(store, stubAdapter(prices)).compute(ASOF, ["ALL"]);
    const agg = sc.periods[0]!.backtest!;
    expect(agg.sampleSize).toBe(2);
    expect(agg.excessReturnPct).toBe(15); // mean(10, 20)
    expect(agg.winRatePct).toBe(50); // mean(40, 60)
    expect(agg.maxDrawdownPct).toBe(-25); // mean(-20, -30)
  });

  it("returns an empty-but-valid scorecard when the log is empty", async () => {
    const sc = await new ScorecardService(new TrackRecordStore({ file: null }), stubAdapter(PRICES)).compute(ASOF);
    expect(sc.totalRecommendations).toBe(0);
    expect(sc.periods.every((p) => p.evaluated === 0)).toBe(true);
  });
});
