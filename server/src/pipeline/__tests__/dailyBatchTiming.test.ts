import { describe, it, expect, vi } from "vitest";
import { runDailyBatch, buildMarketContext } from "../dailyBatch.js";
import { ArtifactStore } from "../artifactStore.js";
import { TimingSignalStore, MarketBriefStore } from "../../timing/store.js";
import { makeTimingRecorder } from "../../timing/recorder.js";
import { MarketDataError, type HistoricalSeries, type MarketSourceAdapter } from "../../market/types.js";
import type { DailyBatchGenerated, DailyBatchGenerator } from "../../llm/dailyBatch.js";
import type { MarketOverview } from "../../market/overview.js";
import type { NewsCollectResult } from "../../news/collector.js";

function ascendingSeries(symbol: string, n = 260): HistoricalSeries {
  const candles = Array.from({ length: n }, (_, i) => {
    const c = 100 + i;
    return { date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`, open: c, high: c, low: c, close: c, adjClose: c, volume: 1000 };
  });
  return { symbol, market: "US", candles, from: candles[0]!.date, to: candles[candles.length - 1]!.date, source: "test" };
}

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

const GENERATED: DailyBatchGenerated = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  marketContext: "기술주 강세",
  picks: [
    { symbol: "AAPL", rationale: "추세 상단", confidence: "high", risk: "low" },
    { symbol: "MSFT", rationale: "안정", confidence: "medium", risk: "medium" },
    { symbol: "NVDA", rationale: "고평가", confidence: "medium", risk: "high" },
  ],
  pickSignals: [
    { ticker: "AAPL", action: "buy", confidence: 0.8, oneLineReason: "추세 상단", contextNewsIds: [], evaluatedAt: "x", source: "dailyBatch" },
    { ticker: "MSFT", action: "hold", confidence: 0.6, oneLineReason: "박스권", contextNewsIds: [], evaluatedAt: "x", source: "dailyBatch" },
    { ticker: "NVDA", action: "watch", confidence: 0.5, oneLineReason: "고평가", contextNewsIds: [], evaluatedAt: "x", source: "dailyBatch" },
  ],
  rankedSignals: [
    { ticker: "AMD", action: "buy", confidence: 0.7, oneLineReason: "거래량 급증", contextNewsIds: [], evaluatedAt: "x", source: "dailyBatch" },
  ],
  brief: {
    market: "US",
    date: "2024-06-21",
    headlineSummary: "반도체 강세 주도",
    sectorSignals: [{ sector: "반도체", direction: "strong", reason: "순매수" }],
    linkedTickers: ["AAPL"],
    sourceUrls: ["https://finance.yahoo.com/n/1"],
    generatedAt: "2024-06-21T13:00:00.000Z",
  },
};

const overview = {
  market: "US",
  date: "2024-06-21",
  indices: [{ symbol: "^GSPC", name: "S&P 500", market: "US", price: 5000, previousClose: 4940, change: 60, changePercent: 1.2, asOf: "2024-06-21", delayed: true, source: "yahoo" }],
  gainers: [{ symbol: "AMD", companyName: "AMD", market: "US", price: 100, previousClose: 94, change: 6, changePercent: 6, volume: 1, asOf: "2024-06-21", scope: "universe" }],
  losers: [],
  mostActive: [],
  popular: [{ symbol: "AMD", companyName: "AMD", market: "US", price: 100, previousClose: 94, change: 6, changePercent: 6, volume: 1, asOf: "2024-06-21", scope: "universe" }],
  generatedAt: "2024-06-21T13:00:00.000Z",
  notes: [],
} as MarketOverview;

const news = {
  market: "US",
  items: [{ id: "1", url: "https://finance.yahoo.com/n/1", title: "Apple chip", market: "US", publishedAt: "2024-06-21T10:00:00Z", source: "yahoo-rss-us", kind: "news", tickers: ["AAPL"] }],
  usedSources: ["yahoo-rss-us"],
  notes: [],
} as NewsCollectResult;

const baseOpts = { market: "US" as const, date: "2024-06-21", generatedAt: "2024-06-21T13:00:00.000Z" };

describe("buildMarketContext", () => {
  it("maps overview + news into the generator context, de-duping ranked tickers", () => {
    const ctx = buildMarketContext(overview, news);
    expect(ctx.indices).toEqual([{ name: "S&P 500", changePercent: 1.2 }]);
    // AMD appears in gainers + popular → de-duped to one entry
    expect(ctx.rankedTickers.map((r) => r.ticker)).toEqual(["AMD"]);
    expect(ctx.news[0]!.url).toBe("https://finance.yahoo.com/n/1");
  });
});

describe("runDailyBatch — brief + signals path", () => {
  it("takes the extended path with ONE call and attaches brief + signals to the artifact", async () => {
    const dailyBatchGenerator: DailyBatchGenerator = vi.fn(async () => GENERATED);
    const artifact = await runDailyBatch({
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      dailyBatchGenerator,
      marketContext: buildMarketContext(overview, news),
      backtester: null,
      store: new ArtifactStore({ dir: null }),
    });

    expect(dailyBatchGenerator).toHaveBeenCalledOnce(); // 추가 호출 0
    expect(artifact.brief?.headlineSummary).toBe("반도체 강세 주도");
    expect(artifact.signals).toHaveLength(4); // 3 pick + 1 ranked
    expect(artifact.signals!.every((s) => s.source === "dailyBatch")).toBe(true);
  });

  it("immutably records signals + brief in the same transaction (Task 1 stores)", async () => {
    const signalStore = new TimingSignalStore({ file: null });
    const briefStore = new MarketBriefStore({ file: null });
    const opts = {
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      dailyBatchGenerator: vi.fn(async () => GENERATED) as DailyBatchGenerator,
      marketContext: buildMarketContext(overview, news),
      backtester: null,
      store: new ArtifactStore({ dir: null }),
      timingRecorder: makeTimingRecorder({ signalStore, briefStore }),
    };
    await runDailyBatch(opts);
    expect(signalStore.forDate("US", "2024-06-21")).toHaveLength(4);
    expect(briefStore.get("US", "2024-06-21")?.sourceUrls).toEqual(["https://finance.yahoo.com/n/1"]);

    // Re-run (force) is idempotent at the append-only store.
    await runDailyBatch({ ...opts, force: true });
    expect(signalStore.forDate("US", "2024-06-21")).toHaveLength(4);
  });

  it("falls back to the legacy picks-only path when no market context is given", async () => {
    const dailyBatchGenerator = vi.fn(async () => GENERATED) as DailyBatchGenerator;
    const legacyGenerator = vi.fn(async () => ({ provider: "anthropic", model: "m", marketContext: "x", picks: GENERATED.picks }));
    const artifact = await runDailyBatch({
      ...baseOpts,
      universe: ["AAPL", "MSFT", "NVDA"],
      adapter: stubAdapter(["AAPL", "MSFT", "NVDA"]),
      dailyBatchGenerator, // present but no marketContext → not used
      generator: legacyGenerator,
      backtester: null,
      store: new ArtifactStore({ dir: null }),
    });
    expect(legacyGenerator).toHaveBeenCalledOnce();
    expect(dailyBatchGenerator).not.toHaveBeenCalled();
    expect(artifact.brief).toBeUndefined();
    expect(artifact.signals).toBeUndefined();
  });
});
