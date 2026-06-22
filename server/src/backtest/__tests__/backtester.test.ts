import { describe, it, expect, vi } from "vitest";
import { Backtester, makeSymbolBacktester } from "../backtester.js";
import { trendMomentumStrategy } from "../strategies.js";
import type { Candle, HistoricalSeries, MarketSourceAdapter } from "../../market/types.js";

function series(symbol: string, closes: number[]): HistoricalSeries {
  const candles: Candle[] = closes.map((c, i) => {
    const d = new Date(Date.UTC(2019, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    return { date: d, open: c, high: c, low: c, close: c, adjClose: c, volume: 1000 };
  });
  return {
    symbol,
    market: "US",
    candles,
    from: candles[0]!.date,
    to: candles[candles.length - 1]!.date,
    source: "test",
  };
}

function stubAdapter(map: Record<string, number[]>): MarketSourceAdapter {
  return {
    market: "US",
    getQuote: vi.fn(),
    getHistory: vi.fn(async (symbol: string) => {
      const closes = map[symbol.toUpperCase()];
      if (!closes) throw new Error(`no data for ${symbol}`);
      return series(symbol.toUpperCase(), closes);
    }),
    getNews: vi.fn(async () => []),
  };
}

const UP = Array.from({ length: 60 }, (_, i) => 100 + i);
const FLAT = new Array(60).fill(100);
const strat = trendMomentumStrategy({ shortWindow: 5, longWindow: 10 });

describe("Backtester", () => {
  it("fetches asset + benchmark and returns a four-metric result", async () => {
    const adapter = stubAdapter({ AAPL: UP, SPY: FLAT });
    const bt = new Backtester(adapter, { benchmarkSymbol: "SPY", strategy: strat });
    const r = await bt.backtestSymbol("AAPL");
    expect(r.symbol).toBe("AAPL");
    expect(r.benchmarkSymbol).toBe("SPY");
    expect(r.excessReturnPct).toBeGreaterThan(0);
    expect(r.winRatePct).toBe(100);
  });

  it("fetches the benchmark only once across multiple symbols", async () => {
    const adapter = stubAdapter({ AAPL: UP, MSFT: UP, SPY: FLAT });
    const bt = new Backtester(adapter, { benchmarkSymbol: "SPY", strategy: strat });
    await bt.backtestSymbol("AAPL");
    await bt.backtestSymbol("MSFT");
    const benchCalls = (adapter.getHistory as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]).toUpperCase() === "SPY",
    );
    expect(benchCalls).toHaveLength(1); // memoized benchmark
  });

  it("makeSymbolBacktester binds an adapter into a per-symbol function", async () => {
    const adapter = stubAdapter({ AAPL: UP, SPY: FLAT });
    const fn = makeSymbolBacktester(adapter, { benchmarkSymbol: "SPY", strategy: strat });
    const r = await fn("AAPL");
    expect(r.symbol).toBe("AAPL");
  });

  it("propagates a fetch error for an unknown symbol", async () => {
    const adapter = stubAdapter({ SPY: FLAT });
    const bt = new Backtester(adapter, { benchmarkSymbol: "SPY", strategy: strat });
    await expect(bt.backtestSymbol("NOPE")).rejects.toThrow(/no data/);
  });
});
