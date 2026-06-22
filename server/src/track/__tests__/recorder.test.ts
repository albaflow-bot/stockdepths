import { describe, it, expect, vi } from "vitest";
import { recordArtifact } from "../recorder.js";
import { TrackRecordStore } from "../store.js";
import type { Candle, HistoricalSeries, MarketSourceAdapter } from "../../market/types.js";
import type { DailyPicksArtifact } from "../../pipeline/artifactStore.js";

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

const ARTIFACT: DailyPicksArtifact = {
  market: "US",
  date: "2024-06-03",
  generatedAt: "2024-06-03T13:00:00.000Z",
  marketContext: "견조",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  disclaimer: "참고 조언",
  universe: ["AAPL", "MSFT"],
  picks: [
    { symbol: "AAPL", rationale: "추세 견조", confidence: "high", risk: "low" },
    { symbol: "MSFT", rationale: "모멘텀", confidence: "medium", risk: "medium" },
  ],
};

const PRICES: Record<string, Array<[string, number]>> = {
  AAPL: [["2024-06-01", 99], ["2024-06-03", 100]],
  MSFT: [["2024-06-03", 200]],
  SPY: [["2024-06-03", 400]],
};

describe("recordArtifact", () => {
  it("freezes entry + benchmark prices as immutable context", async () => {
    const store = new TrackRecordStore({ file: null });
    const appended = await recordArtifact(ARTIFACT, store, {
      adapter: stubAdapter(PRICES),
      loggedAt: "2024-06-03T13:05:00.000Z",
    });
    expect(appended).toHaveLength(2);
    const aapl = appended.find((e) => e.symbol === "AAPL")!;
    expect(aapl.id).toBe("US:2024-06-03:AAPL");
    expect(aapl.entryPrice).toBe(100); // close on the rec date
    expect(aapl.entryPriceDate).toBe("2024-06-03");
    expect(aapl.benchmarkSymbol).toBe("SPY");
    expect(aapl.benchmarkEntryPrice).toBe(400);
  });

  it("is idempotent — re-recording the same day appends nothing", async () => {
    const store = new TrackRecordStore({ file: null });
    const adapter = stubAdapter(PRICES);
    await recordArtifact(ARTIFACT, store, { adapter, loggedAt: "t1" });
    const second = await recordArtifact(ARTIFACT, store, { adapter, loggedAt: "t2" });
    expect(second).toHaveLength(0);
    expect(store.readAll()).toHaveLength(2);
  });

  it("skips a pick with no price on/before the rec date, logging the rest", async () => {
    const store = new TrackRecordStore({ file: null });
    // MSFT only has a price AFTER the rec date → unpriceable at entry, skipped.
    const prices = { ...PRICES, MSFT: [["2024-06-10", 200] as [string, number]] };
    const appended = await recordArtifact(ARTIFACT, store, {
      adapter: stubAdapter(prices),
      loggedAt: "t",
    });
    expect(appended.map((e) => e.symbol)).toEqual(["AAPL"]);
  });

  it("records nothing when the benchmark price is unavailable (can't compute excess)", async () => {
    const store = new TrackRecordStore({ file: null });
    const noBench: Record<string, Array<[string, number]>> = { AAPL: PRICES.AAPL!, MSFT: PRICES.MSFT! }; // no SPY
    const appended = await recordArtifact(ARTIFACT, store, {
      adapter: stubAdapter(noBench),
      loggedAt: "t",
    });
    expect(appended).toHaveLength(0);
  });
});
