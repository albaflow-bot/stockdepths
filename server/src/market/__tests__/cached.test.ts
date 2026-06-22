import { describe, it, expect, vi } from "vitest";
import { TtlCache } from "../cache.js";
import { CachedMarketSource } from "../cached.js";
import { MarketRegistry } from "../registry.js";
import type { HistoricalSeries, MarketSourceAdapter, Quote } from "../types.js";

function fakeQuote(symbol: string, price: number): Quote {
  return {
    symbol,
    market: "US",
    price,
    previousClose: price - 1,
    change: 1,
    changePercent: 1,
    asOf: "2024-06-21",
    delayed: true,
    source: "fake",
  };
}

function fakeSeries(symbol: string): HistoricalSeries {
  return {
    symbol,
    market: "US",
    candles: [{ date: "2024-06-21", open: 1, high: 1, low: 1, close: 1, adjClose: 1, volume: 0 }],
    from: "2024-06-21",
    to: "2024-06-21",
    source: "fake",
  };
}

describe("CachedMarketSource", () => {
  it("memoizes getQuote so the inner adapter is called once", async () => {
    const inner: MarketSourceAdapter = {
      market: "US",
      getQuote: vi.fn(async (s: string) => fakeQuote(s, 100)),
      getHistory: vi.fn(async (s: string) => fakeSeries(s)),
      getNews: vi.fn(async () => []),
    };
    const cached = new CachedMarketSource(inner, new TtlCache({ dir: null }));
    await cached.getQuote("AAPL");
    await cached.getQuote("AAPL");
    expect(inner.getQuote).toHaveBeenCalledTimes(1);
  });

  it("keys history by symbol AND years", async () => {
    const inner: MarketSourceAdapter = {
      market: "US",
      getQuote: vi.fn(async (s: string) => fakeQuote(s, 1)),
      getHistory: vi.fn(async (s: string) => fakeSeries(s)),
      getNews: vi.fn(async () => []),
    };
    const cached = new CachedMarketSource(inner, new TtlCache({ dir: null }));
    await cached.getHistory("AAPL", { years: 5 });
    await cached.getHistory("AAPL", { years: 1 });
    await cached.getHistory("AAPL", { years: 5 });
    expect(inner.getHistory).toHaveBeenCalledTimes(2);
  });

  it("serves a stale cached value when the source later fails (stale-on-error)", async () => {
    let call = 0;
    const inner: MarketSourceAdapter = {
      market: "US",
      getQuote: vi.fn(async (s: string) => {
        call++;
        if (call === 1) return fakeQuote(s, 100);
        throw new Error("source down");
      }),
      getHistory: vi.fn(async (s: string) => fakeSeries(s)),
      getNews: vi.fn(async () => []),
    };
    // Tiny TTL so the second call misses the fresh cache and hits the source.
    const clk = { t: 0, now() { return this.t; } };
    const cache = new TtlCache({ dir: null, now: () => clk.now(), defaultTtlMs: 1 });
    const cached = new CachedMarketSource(inner, cache, { quoteMs: 1 });
    const first = await cached.getQuote("AAPL");
    expect(first.price).toBe(100);
    clk.t = 1000; // expire the fresh entry
    const second = await cached.getQuote("AAPL"); // source throws -> stale served
    expect(second.price).toBe(100);
  });
});

describe("MarketRegistry", () => {
  it("provides a cached US adapter and lists supported markets", () => {
    const reg = new MarketRegistry({ cache: { dir: null } });
    expect(reg.supported()).toContain("US");
    expect(reg.require("US").market).toBe("US");
    expect(reg.get("US")).toBeInstanceOf(CachedMarketSource);
  });

  it("throws a clear error for an unsupported market (KR not yet registered)", () => {
    const reg = new MarketRegistry({ cache: { dir: null } });
    expect(reg.get("KR")).toBeUndefined();
    expect(() => reg.require("KR")).toThrow(/No source adapter registered/);
  });

  it("lets a custom raw adapter be registered and wrapped in cache", async () => {
    const reg = new MarketRegistry({ cache: { dir: null } });
    const getQuote = vi.fn(async (s: string) => fakeQuote(s, 7));
    reg.register({
      market: "KR",
      getQuote,
      getHistory: async (s: string) => fakeSeries(s),
      getNews: async () => [],
    });
    const kr = reg.require("KR");
    await kr.getQuote("005930");
    await kr.getQuote("005930");
    expect(getQuote).toHaveBeenCalledTimes(1); // cache wrapper applied
  });
});
