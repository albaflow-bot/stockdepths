import { describe, it, expect, vi } from "vitest";
import { TimingAccuracyService } from "../timingAccuracy.js";
import { TimingSignalStore } from "../../timing/store.js";
import type { Candle, HistoricalSeries, MarketSourceAdapter } from "../../market/types.js";
import type { TimingSignal } from "../../timing/types.js";

function candle(date: string, close: number): Candle {
  return { date, open: close, high: close, low: close, close, adjClose: close, volume: 1 };
}

/** Adapter serving a fixed per-symbol series; UP rises after entry, DOWN falls. */
function adapterFor(seriesBySymbol: Record<string, Candle[]>): MarketSourceAdapter {
  return {
    market: "US",
    getQuote: vi.fn(),
    getHistory: vi.fn(async (symbol: string): Promise<HistoricalSeries> => {
      const candles = seriesBySymbol[symbol.toUpperCase()];
      if (!candles) throw new Error("no data");
      return { symbol: symbol.toUpperCase(), market: "US", candles, from: candles[0]!.date, to: candles[candles.length - 1]!.date, source: "test" };
    }),
    getNews: vi.fn(async () => []),
  };
}

function sig(ticker: string, action: TimingSignal["action"], date: string): TimingSignal {
  return { ticker, action, confidence: 0.7, oneLineReason: "근거", contextNewsIds: [], evaluatedAt: `${date}T00:00:00Z`, source: "dailyBatch" };
}

function storeWith(entries: Array<{ s: TimingSignal; date: string }>): TimingSignalStore {
  const store = new TimingSignalStore({ file: null });
  for (const { s, date } of entries) store.record("US", date, [s]);
  return store;
}

const ASOF = "2026-06-30";

describe("TimingAccuracyService", () => {
  it("scores Buy→상승 적중 and Sell→하락 회피 against later prices", async () => {
    // UP rises 100→110 a week after the signal; DOWN falls 100→90.
    const adapter = adapterFor({
      UP: [candle("2026-06-01", 100), candle("2026-06-08", 110)],
      DOWN: [candle("2026-06-01", 100), candle("2026-06-08", 90)],
    });
    const store = storeWith([
      { s: sig("UP", "buy", "2026-06-01"), date: "2026-06-01" }, // buy then rose → hit
      { s: sig("DOWN", "sell", "2026-06-01"), date: "2026-06-01" }, // sell then fell → hit (avoided loss)
    ]);
    const svc = new TimingAccuracyService(store, adapter, { horizonDays: 7, minSample: 1 });
    const acc = await svc.compute(ASOF);
    const all = acc.periods.find((p) => p.period === "ALL")!;
    expect(all.buy).toMatchObject({ total: 1, evaluated: 1, hits: 1, hitRatePct: 100 });
    expect(all.sell).toMatchObject({ total: 1, evaluated: 1, hits: 1, hitRatePct: 100 });
    expect(all.overall.hitRatePct).toBe(100);
    expect(all.lowSample).toBe(false);
  });

  it("counts a wrong-direction signal as a miss", async () => {
    const adapter = adapterFor({ UP: [candle("2026-06-01", 100), candle("2026-06-08", 110)] });
    const store = storeWith([{ s: sig("UP", "sell", "2026-06-01"), date: "2026-06-01" }]); // sell but it rose → miss
    const svc = new TimingAccuracyService(store, adapter, { horizonDays: 7, minSample: 1 });
    const all = (await svc.compute(ASOF)).periods.find((p) => p.period === "ALL")!;
    expect(all.sell).toMatchObject({ total: 1, evaluated: 1, hits: 0, hitRatePct: 0 });
  });

  it("excludes hold/watch from directional accuracy", async () => {
    const adapter = adapterFor({ FLAT: [candle("2026-06-01", 100), candle("2026-06-08", 100)] });
    const store = storeWith([
      { s: sig("FLAT", "hold", "2026-06-01"), date: "2026-06-01" },
      { s: sig("FLAT", "watch", "2026-06-01"), date: "2026-06-01" },
    ]);
    const all = (await new TimingAccuracyService(store, adapter, { minSample: 1 }).compute(ASOF)).periods.find((p) => p.period === "ALL")!;
    expect(all.overall.total).toBe(0); // nothing directional
    expect(all.overall.hitRatePct).toBeNull();
  });

  it("leaves a signal unevaluated when the horizon hasn't elapsed (pending, not a miss)", async () => {
    // Signal on the asOf day; the +7d window is in the future → pending.
    const adapter = adapterFor({ UP: [candle("2026-06-25", 100), candle("2026-06-30", 105)] });
    const store = storeWith([{ s: sig("UP", "buy", ASOF), date: ASOF }]);
    const all = (await new TimingAccuracyService(store, adapter, { horizonDays: 7, minSample: 1 }).compute(ASOF)).periods.find((p) => p.period === "ALL")!;
    expect(all.buy).toMatchObject({ total: 1, evaluated: 0, hits: 0, hitRatePct: null });
  });

  it("flags lowSample when evaluated directional signals are below minSample (과장 방지)", async () => {
    const adapter = adapterFor({ UP: [candle("2026-06-01", 100), candle("2026-06-08", 110)] });
    const store = storeWith([{ s: sig("UP", "buy", "2026-06-01"), date: "2026-06-01" }]);
    const all = (await new TimingAccuracyService(store, adapter, { minSample: 5 }).compute(ASOF)).periods.find((p) => p.period === "ALL")!;
    expect(all.overall.evaluated).toBe(1);
    expect(all.lowSample).toBe(true); // 1 < 5
  });

  it("exposes an explicit, surfaced hit criterion and never mutates the log", async () => {
    const adapter = adapterFor({ UP: [candle("2026-06-01", 100), candle("2026-06-08", 110)] });
    const store = storeWith([{ s: sig("UP", "buy", "2026-06-01"), date: "2026-06-01" }]);
    const before = store.readAll().length;
    const acc = await new TimingAccuracyService(store, adapter, { horizonDays: 7 }).compute(ASOF);
    expect(acc.criterion).toContain("7일 후");
    expect(acc.horizonDays).toBe(7);
    expect(store.readAll().length).toBe(before); // read-only over the immutable log
  });

  it("only scores DailyBatch signals (ignores OnDeviceRule)", async () => {
    const adapter = adapterFor({ UP: [candle("2026-06-01", 100), candle("2026-06-08", 110)] });
    const store = new TimingSignalStore({ file: null });
    store.record("US", "2026-06-01", [{ ...sig("UP", "buy", "2026-06-01"), source: "onDeviceRule" }]);
    const all = (await new TimingAccuracyService(store, adapter, { minSample: 1 }).compute(ASOF)).periods.find((p) => p.period === "ALL")!;
    expect(all.overall.total).toBe(0);
  });
});
