import { describe, it, expect, vi } from "vitest";
import { route, type ApiDeps } from "../handlers.js";
import { ArtifactStore, type DailyPicksArtifact } from "../../pipeline/artifactStore.js";
import { ScorecardService } from "../../track/scorecard.js";
import { TrackRecordStore } from "../../track/store.js";
import type { Candle, HistoricalSeries, MarketSourceAdapter, Quote } from "../../market/types.js";

function quote(symbol: string, price: number): Quote {
  return {
    symbol,
    market: "US",
    price,
    previousClose: price - 1,
    change: 1,
    changePercent: 1.5,
    asOf: "2026-06-21",
    delayed: true,
    source: "test",
  };
}

function series(symbol: string): HistoricalSeries {
  const candles: Candle[] = [
    { date: "2026-03-20", open: 100, high: 100, low: 100, close: 100, adjClose: 100, volume: 1 },
    { date: "2026-06-21", open: 120, high: 120, low: 120, close: 120, adjClose: 120, volume: 1 },
  ];
  return { symbol, market: "US", candles, from: candles[0]!.date, to: candles[1]!.date, source: "test" };
}

function stubAdapter(goodQuotes: string[]): MarketSourceAdapter {
  return {
    market: "US",
    getQuote: vi.fn(async (s: string) => {
      if (!goodQuotes.includes(s.toUpperCase())) throw new Error("no quote");
      return quote(s.toUpperCase(), 200);
    }),
    getHistory: vi.fn(async (s: string) => series(s.toUpperCase())),
    getNews: vi.fn(async () => []),
  };
}

const ARTIFACT: DailyPicksArtifact = {
  market: "US",
  date: "2026-06-21",
  generatedAt: "2026-06-21T00:05:00Z",
  marketContext: "견조",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  disclaimer: "참고 조언",
  universe: ["AAPL"],
  picks: [{ symbol: "AAPL", rationale: "r", confidence: "high", risk: "low" }],
};

function makeDeps(over: Partial<ApiDeps> = {}): ApiDeps {
  const adapter = over.adapter ?? stubAdapter(["AAPL", "MSFT"]);
  const artifactStore = over.artifactStore ?? new ArtifactStore({ dir: null });
  return {
    adapter,
    artifactStore,
    scorecard: over.scorecard ?? new ScorecardService(new TrackRecordStore({ file: null }), adapter),
    today: over.today ?? (() => "2026-06-21"),
  };
}

describe("api route", () => {
  it("GET /api/picks/today returns the stored artifact", async () => {
    const store = new ArtifactStore({ dir: null });
    store.put(ARTIFACT);
    const res = await route("/api/picks/today", { market: "US" }, makeDeps({ artifactStore: store }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: "2026-06-21", picks: [{ symbol: "AAPL" }] });
  });

  it("GET /api/picks/today returns 404 when there is no artifact for the date", async () => {
    const res = await route("/api/picks/today", { market: "US", date: "2020-01-01" }, makeDeps());
    expect(res.status).toBe(404);
  });

  it("GET /api/quotes returns client-shaped quotes, skipping bad symbols", async () => {
    const res = await route("/api/quotes", { symbols: "AAPL,NOPE,MSFT" }, makeDeps());
    expect(res.status).toBe(200);
    const quotes = res.body as Array<{ symbol: string; price: number }>;
    expect(quotes.map((q) => q.symbol).sort()).toEqual(["AAPL", "MSFT"]); // NOPE skipped
    expect(quotes[0]).toHaveProperty("changePercent");
  });

  it("GET /api/quotes returns 400 without a symbols param", async () => {
    const res = await route("/api/quotes", {}, makeDeps());
    expect(res.status).toBe(400);
  });

  it("GET /api/scorecard returns a derived scorecard", async () => {
    const res = await route("/api/scorecard", { asOf: "2026-06-21" }, makeDeps());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ asOf: "2026-06-21", benchmarkSymbol: "SPY" });
    expect(Array.isArray((res.body as { periods: unknown[] }).periods)).toBe(true);
  });

  it("returns 200 health and 404 for unknown paths", async () => {
    expect((await route("/api/health", {}, makeDeps())).status).toBe(200);
    expect((await route("/api/nope", {}, makeDeps())).status).toBe(404);
  });
});
