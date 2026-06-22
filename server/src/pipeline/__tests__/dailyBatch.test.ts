import { describe, it, expect, vi } from "vitest";
import { runDailyBatch } from "../dailyBatch.js";
import { ArtifactStore } from "../artifactStore.js";
import { ADVICE_DISCLAIMER } from "../../llm/prompt.js";
import { MarketDataError, type HistoricalSeries, type MarketSourceAdapter } from "../../market/types.js";
import type { GeneratedPicks, GeneratePicksInput, PicksGenerator } from "../../llm/generator.js";
import type { BacktestResult } from "../../backtest/types.js";
import type { SymbolBacktester } from "../../backtest/backtester.js";

function ascendingSeries(symbol: string, n = 260): HistoricalSeries {
  const candles = Array.from({ length: n }, (_, i) => {
    const c = 100 + i;
    return {
      date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
      open: c,
      high: c,
      low: c,
      close: c,
      adjClose: c,
      volume: 1000,
    };
  });
  return {
    symbol,
    market: "US" as const,
    candles,
    from: candles[0]!.date,
    to: candles[candles.length - 1]!.date,
    source: "test",
  };
}

/** Adapter that serves history for listed symbols and fails for others. */
function stubAdapter(good: string[]): MarketSourceAdapter {
  return {
    market: "US",
    getQuote: vi.fn(),
    getHistory: vi.fn(async (symbol: string) => {
      if (good.includes(symbol.toUpperCase())) return ascendingSeries(symbol.toUpperCase());
      throw new MarketDataError("no data", symbol, []);
    }),
    getNews: vi.fn(async () => []),
  };
}

const GOOD_RESULT: GeneratedPicks = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  marketContext: "견조한 흐름",
  picks: [
    { symbol: "AAPL", rationale: "r1", confidence: "high", risk: "low" },
    { symbol: "MSFT", rationale: "r2", confidence: "medium", risk: "medium" },
    { symbol: "NVDA", rationale: "r3", confidence: "high", risk: "high" },
  ],
};

const baseOpts = {
  market: "US" as const,
  date: "2024-06-21",
  generatedAt: "2024-06-21T13:00:00.000Z",
};

describe("runDailyBatch", () => {
  it("gathers features, runs ONE oneshot, and builds a disclaimer-tagged artifact", async () => {
    const generator: PicksGenerator = vi.fn(async () => GOOD_RESULT);
    const store = new ArtifactStore({ dir: null });
    const artifact = await runDailyBatch({
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      generator,
      store,
    });

    expect(artifact.picks).toHaveLength(3);
    expect(artifact.provider).toBe("anthropic");
    expect(artifact.model).toBe("claude-sonnet-4-6");
    expect(artifact.disclaimer).toBe(ADVICE_DISCLAIMER);
    expect(artifact.universe).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(generator).toHaveBeenCalledOnce();
  });

  it("passes only successfully-gathered candidates to the generator (resilience)", async () => {
    const generator = vi.fn(async (_input: GeneratePicksInput) => GOOD_RESULT);
    await runDailyBatch({
      ...baseOpts,
      universe: ["AAPL", "BADSYM", "MSFT"],
      adapter: stubAdapter(["AAPL", "MSFT"]),
      generator,
      store: new ArtifactStore({ dir: null }),
    });
    const passed = generator.mock.calls[0]![0].features.map((f) => f.symbol);
    expect(passed).toEqual(["AAPL", "MSFT"]); // BADSYM skipped, not fatal
  });

  it("is idempotent per day — a cached artifact skips the oneshot", async () => {
    const generator = vi.fn(async () => GOOD_RESULT);
    const store = new ArtifactStore({ dir: null });
    const opts = {
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      generator,
      store,
    };
    await runDailyBatch(opts);
    await runDailyBatch(opts); // second call same day
    expect(generator).toHaveBeenCalledOnce(); // amortized: one shared artifact
  });

  it("re-runs when force is set", async () => {
    const generator = vi.fn(async () => GOOD_RESULT);
    const store = new ArtifactStore({ dir: null });
    const opts = {
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      generator,
      store,
    };
    await runDailyBatch(opts);
    await runDailyBatch({ ...opts, force: true });
    expect(generator).toHaveBeenCalledTimes(2);
  });

  it("attaches a 5Y backtest to each pick before delivery (Task 3)", async () => {
    const fakeBacktest = (symbol: string): BacktestResult => ({
      symbol,
      strategy: "trend-momentum",
      from: "2019-06-21",
      to: "2024-06-21",
      dataPoints: 1255,
      trades: 4,
      winRatePct: 75,
      avgTradeReturnPct: 8.5,
      cumulativeReturnPct: 60,
      benchmarkSymbol: "SPY",
      benchmarkReturnPct: 45,
      excessReturnPct: 15,
      maxDrawdownPct: -22,
    });
    const backtester: SymbolBacktester = vi.fn(async (s) => fakeBacktest(s));
    const artifact = await runDailyBatch({
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      generator: vi.fn(async () => GOOD_RESULT),
      backtester,
      store: new ArtifactStore({ dir: null }),
    });
    expect(backtester).toHaveBeenCalledTimes(3);
    for (const p of artifact.picks) {
      expect(p.backtest).toBeDefined();
      expect(p.backtest!.benchmarkSymbol).toBe("SPY");
      expect(p.backtest!.excessReturnPct).toBe(15);
    }
  });

  it("delivers a pick without a backtest panel when its backtest fails (resilience)", async () => {
    const backtester: SymbolBacktester = vi.fn(async (s) => {
      if (s === "MSFT") throw new Error("insufficient data");
      return {
        symbol: s,
        strategy: "trend-momentum",
        from: "2019-06-21",
        to: "2024-06-21",
        dataPoints: 1255,
        trades: 2,
        winRatePct: 100,
        avgTradeReturnPct: 10,
        cumulativeReturnPct: 50,
        benchmarkSymbol: "SPY",
        benchmarkReturnPct: 40,
        excessReturnPct: 10,
        maxDrawdownPct: -15,
      };
    });
    const artifact = await runDailyBatch({
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      generator: vi.fn(async () => GOOD_RESULT),
      backtester,
      store: new ArtifactStore({ dir: null }),
    });
    const msft = artifact.picks.find((p) => p.symbol === "MSFT")!;
    const aapl = artifact.picks.find((p) => p.symbol === "AAPL")!;
    expect(msft.backtest).toBeUndefined(); // failed → omitted, still delivered
    expect(aapl.backtest).toBeDefined();
    expect(artifact.picks).toHaveLength(3); // no pick dropped
  });

  it("skips backtesting entirely when backtester is null", async () => {
    const artifact = await runDailyBatch({
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      generator: vi.fn(async () => GOOD_RESULT),
      backtester: null,
      store: new ArtifactStore({ dir: null }),
    });
    expect(artifact.picks.every((p) => p.backtest === undefined)).toBe(true);
  });

  it("aborts (no fabricated picks) when no market data is available", async () => {
    const generator = vi.fn(async () => GOOD_RESULT);
    await expect(
      runDailyBatch({
        ...baseOpts,
        universe: ["BADSYM"],
        adapter: stubAdapter([]),
        generator,
        store: new ArtifactStore({ dir: null }),
      }),
    ).rejects.toThrow(/no market data/);
    expect(generator).not.toHaveBeenCalled();
  });
});
