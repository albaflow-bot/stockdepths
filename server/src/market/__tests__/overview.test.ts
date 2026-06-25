import { describe, it, expect } from "vitest";
import {
  MarketOverviewCollector,
  rankStocks,
  quoteFromCandles,
  popularSymbols,
  INDEX_DEFS,
  type RankedStock,
} from "../overview.js";
import { UsMarketAdapter } from "../adapters/us.js";
import { makeMockFetcher } from "./mockFetcher.js";
import { YAHOO_CHART_JSON } from "./fixtures.js";
import type { Candle } from "../types.js";

const FIXED_NOW = () => new Date("2024-06-21T22:00:00Z");

function candle(date: string, close: number, volume: number): Candle {
  return { date, open: close, high: close, low: close, close, adjClose: close, volume };
}

function row(symbol: string, changePercent: number, volume: number): RankedStock {
  return {
    symbol,
    market: "US",
    price: 100,
    previousClose: 100,
    change: 0,
    changePercent,
    volume,
    asOf: "2024-06-21",
    scope: "universe",
  };
}

describe("quoteFromCandles", () => {
  it("derives change from the last two candles", () => {
    const q = quoteFromCandles([candle("2024-06-20", 100, 10), candle("2024-06-21", 105, 20)]);
    expect(q).toEqual({
      price: 105,
      previousClose: 100,
      change: 5,
      changePercent: 5,
      volume: 20,
      asOf: "2024-06-21",
    });
  });
  it("returns undefined for an empty series", () => {
    expect(quoteFromCandles([])).toBeUndefined();
  });
  it("handles a single candle without dividing by zero", () => {
    const q = quoteFromCandles([candle("2024-06-21", 50, 5)]);
    expect(q?.change).toBe(0);
    expect(q?.changePercent).toBe(0);
  });
});

describe("rankStocks", () => {
  const rows = [
    row("AAA", 5, 100),
    row("BBB", -8, 500),
    row("CCC", 2, 900),
    row("DDD", -1, 50),
  ];
  it("orders gainers high→low and losers low→high by 등락률", () => {
    const r = rankStocks(rows, 2);
    expect(r.gainers.map((x) => x.symbol)).toEqual(["AAA", "CCC"]);
    expect(r.losers.map((x) => x.symbol)).toEqual(["BBB", "DDD"]);
  });
  it("orders mostActive by volume desc (거래상위)", () => {
    const r = rankStocks(rows, 2);
    expect(r.mostActive.map((x) => x.symbol)).toEqual(["CCC", "BBB"]);
  });
  it("orders popular by |등락률| (attention proxy)", () => {
    const r = rankStocks(rows, 2);
    expect(r.popular.map((x) => x.symbol)).toEqual(["BBB", "AAA"]);
  });
  it("truncates each list to topN", () => {
    const r = rankStocks(rows, 1);
    expect(r.gainers).toHaveLength(1);
    expect(r.mostActive).toHaveLength(1);
  });
});

describe("INDEX_DEFS", () => {
  it("covers KR 코스피/코스닥 and US 나스닥/S&P (SPEC §5.2-1)", () => {
    expect(INDEX_DEFS.KR.map((d) => d.symbol)).toEqual(["^KS11", "^KQ11"]);
    expect(INDEX_DEFS.US.map((d) => d.symbol)).toEqual(["^GSPC", "^IXIC"]);
  });
});

describe("MarketOverviewCollector.collect", () => {
  it("collects indices + universe-scoped rankings over free paths", async () => {
    // Yahoo chart fixture serves both index symbols and the universe history.
    const fetcher = makeMockFetcher([
      { match: "query1.finance.yahoo.com", body: YAHOO_CHART_JSON },
    ]);
    const adapter = new UsMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    const collector = new MarketOverviewCollector({ fetcher, now: FIXED_NOW, http: { retries: 0 } });

    const overview = await collector.collect({
      market: "US",
      adapter,
      universe: ["AAPL", "MSFT"],
      names: { AAPL: "Apple", MSFT: "Microsoft" },
      topN: 5,
    });

    expect(overview.market).toBe("US");
    expect(overview.indices.map((i) => i.symbol)).toEqual(["^GSPC", "^IXIC"]);
    expect(overview.indices[0]?.delayed).toBe(true);
    expect(overview.gainers.length).toBe(2);
    expect(overview.gainers.every((r) => r.scope === "universe")).toBe(true);
    // Honesty note about scope is always present.
    expect(overview.notes.some((n) => n.includes("거래소 전체 순위 아님"))).toBe(true);
  });

  it("stays resilient: skips failed indices/rows, still returns an overview", async () => {
    // Universe history works; indices 404 (no matching route).
    const fetcher = makeMockFetcher([
      { match: "chart/AAPL", body: YAHOO_CHART_JSON },
    ]);
    const adapter = new UsMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    const collector = new MarketOverviewCollector({ fetcher, now: FIXED_NOW, http: { retries: 0 } });

    const overview = await collector.collect({ market: "US", adapter, universe: ["AAPL", "ZZZZ"] });
    expect(overview.indices).toEqual([]);
    expect(overview.gainers.map((r) => r.symbol)).toEqual(["AAPL"]);
    expect(overview.notes.some((n) => n.includes("수집 실패"))).toBe(true);
  });
});

describe("popularSymbols", () => {
  it("returns de-duped uppercase symbols for the candidate-pool merge", () => {
    const overview = {
      market: "US" as const,
      date: "2024-06-21",
      indices: [],
      gainers: [],
      losers: [],
      mostActive: [],
      popular: [row("aapl", 5, 1), row("AAPL", 5, 1), row("msft", -2, 1)],
      generatedAt: "2024-06-21T22:00:00.000Z",
      notes: [],
    };
    expect(popularSymbols(overview)).toEqual(["AAPL", "MSFT"]);
  });
});
