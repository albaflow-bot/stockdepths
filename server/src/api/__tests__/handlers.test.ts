import { describe, it, expect, vi } from "vitest";
import { route, type ApiDeps } from "../handlers.js";
import { ArtifactStore, type DailyPicksArtifact } from "../../pipeline/artifactStore.js";
import { ScorecardService } from "../../track/scorecard.js";
import { TrackRecordStore } from "../../track/store.js";
import { TimingAccuracyService } from "../../track/timingAccuracy.js";
import { TimingSignalStore } from "../../timing/store.js";
import { InMemorySecuritySearchStore } from "../../screener/searchStore.js";
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
    timingAccuracy:
      over.timingAccuracy ?? new TimingAccuracyService(new TimingSignalStore({ file: null }), adapter),
    today: over.today ?? (() => "2026-06-21"),
    searchStore: over.searchStore,
    screenStore: over.screenStore,
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

  it("GET /api/search returns name-matched results with last/direction/weekly/signal", async () => {
    const searchStore = new InMemorySecuritySearchStore({
      dir: null,
      seed: {
        master: [
          { market: "KOSPI", code: "005930", name_ko: "삼성전자", name_en: "Samsung Electronics", is_etf: false, delisted: false },
          { market: "KOSPI", code: "006400", name_ko: "삼성SDI", name_en: "Samsung SDI", is_etf: false, delisted: false },
        ],
        screen: [
          { market: "KOSPI", code: "005930", asof: "2026-06-21", last: 78400, change_pct: 1.6, volume: 1e7, turnover: 9e11, rvol: 1.2, high_52w: 88000, low_52w: 60000, rsi14: 55 },
        ],
        weekly: [{ market: "KOSPI", code: "005930", closes: [76000, 77000, 77500, 78000, 78100, 78300, 78400] }],
      },
    });
    const res = await route("/api/search", { q: "삼성", market: "ALL", limit: "30" }, makeDeps({ searchStore }));
    expect(res.status).toBe(200);
    const items = res.body as Array<{ code: string; last: number | null; direction: string; weekly: number[]; signal: unknown }>;
    const codes = items.map((i) => i.code);
    expect(codes).toContain("005930");
    const samsung = items.find((i) => i.code === "005930")!;
    expect(samsung.last).toBe(78400);
    expect(samsung.direction).toBe("up");
    expect(samsung.weekly).toHaveLength(7);
    expect(samsung).toHaveProperty("signal");
  });

  it("GET /api/search returns [] for an empty query (no error)", async () => {
    const res = await route("/api/search", { q: "  " }, makeDeps());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("GET /api/discover returns the latest category artifact, 404 when none", async () => {
    const artifact = {
      market: "US" as const,
      asof: "2026-06-21",
      generatedAt: "2026-06-21T21:00:00Z",
      provider: "deterministic",
      categories: { gainers: [{ category: "gainers", code: "MID", market: "NASDAQ" }] },
      stats: { scanned: 3, afterNoiseFilter: 2, largeCapsExcluded: 1, candidates: 1 },
    };
    const screenStore = {
      saveMaster: async () => {},
      saveDailyScreen: async () => {},
      saveWeekly: async () => {},
      saveArtifact: async () => {},
      getLatestArtifact: async (m: string) => (m === "US" ? (artifact as never) : null),
      listMasterCodes: async () => [],
    };
    const ok = await route("/api/discover", { market: "US" }, makeDeps({ screenStore }));
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ asof: "2026-06-21", market: "US" });

    const none = await route("/api/discover", { market: "KR" }, makeDeps({ screenStore }));
    expect(none.status).toBe(404);
  });

  it("returns 200 health and 404 for unknown paths", async () => {
    expect((await route("/api/health", {}, makeDeps())).status).toBe(200);
    expect((await route("/api/nope", {}, makeDeps())).status).toBe(404);
  });
});
