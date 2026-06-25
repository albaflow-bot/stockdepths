import { describe, it, expect } from "vitest";
import { KrMarketAdapter, toStooqKrSymbol, toYahooKrSymbol } from "../adapters/kr.js";
import { MarketDataError } from "../types.js";
import { makeMockFetcher } from "./mockFetcher.js";
import { STOOQ_HISTORY_CSV, STOOQ_EMPTY_CSV, YAHOO_CHART_JSON, YAHOO_RSS } from "./fixtures.js";

// Fixed clock so date-range URLs are deterministic.
const FIXED_NOW = () => new Date("2024-06-21T22:00:00Z");

describe("toYahooKrSymbol", () => {
  it("defaults a bare 6-digit code to the KOSPI (.KS) board", () => {
    expect(toYahooKrSymbol("005930")).toBe("005930.KS");
  });
  it("keeps an explicit board suffix (e.g. KOSDAQ .KQ)", () => {
    expect(toYahooKrSymbol("247540.KQ")).toBe("247540.KQ");
    expect(toYahooKrSymbol("005930.ks")).toBe("005930.KS");
  });
});

describe("toStooqKrSymbol", () => {
  it("strips any board suffix and appends lowercase .kr", () => {
    expect(toStooqKrSymbol("005930")).toBe("005930.kr");
    expect(toStooqKrSymbol("247540.KQ")).toBe("247540.kr");
  });
});

describe("KrMarketAdapter.getHistory", () => {
  it("uses Yahoo as the primary source", async () => {
    const fetcher = makeMockFetcher([{ match: "query1.finance.yahoo.com", body: YAHOO_CHART_JSON }]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW });
    const hist = await kr.getHistory("005930");
    expect(hist.source).toBe("yahoo");
    expect(hist.candles).toHaveLength(3);
    expect(hist.symbol).toBe("005930");
    expect(hist.market).toBe("KR");
    // Yahoo is queried with the .KS board suffix.
    expect(fetcher.calls.some((c) => c.includes("005930.KS"))).toBe(true);
  });

  it("falls back to Stooq when Yahoo is empty", async () => {
    const fetcher = makeMockFetcher([
      { match: "query1.finance.yahoo.com", body: JSON.stringify({ chart: { result: [], error: null } }) },
      { match: "stooq.com/q/d/l", body: STOOQ_HISTORY_CSV },
    ]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW });
    const hist = await kr.getHistory("005930");
    expect(hist.source).toBe("stooq");
    expect(hist.candles).toHaveLength(5);
    // Stooq is queried with the lowercase .kr suffix.
    expect(fetcher.calls.some((c) => c.includes("005930.kr"))).toBe(true);
  });

  it("falls back to Stooq when Yahoo throws (network error)", async () => {
    const fetcher = makeMockFetcher([
      { match: "query1.finance.yahoo.com", throws: true },
      { match: "stooq.com/q/d/l", body: STOOQ_HISTORY_CSV },
    ]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    const hist = await kr.getHistory("005930");
    expect(hist.source).toBe("stooq");
  });

  it("throws MarketDataError aggregating causes when all sources fail", async () => {
    const fetcher = makeMockFetcher([
      { match: "query1.finance.yahoo.com", throws: true },
      { match: "stooq.com/q/d/l", body: STOOQ_EMPTY_CSV },
    ]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    await expect(kr.getHistory("005930")).rejects.toBeInstanceOf(MarketDataError);
  });
});

describe("KrMarketAdapter.getQuote", () => {
  it("derives price + previousClose from the last two candles", async () => {
    const fetcher = makeMockFetcher([{ match: "query1.finance.yahoo.com", body: YAHOO_CHART_JSON }]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW });
    const q = await kr.getQuote("005930");
    expect(q.price).toBe(206);
    expect(q.previousClose).toBe(205);
    expect(q.change).toBeCloseTo(1, 5);
    expect(q.changePercent).toBeCloseTo((1 / 205) * 100, 5);
    expect(q.delayed).toBe(true);
    expect(q.market).toBe("KR");
  });
});

describe("KrMarketAdapter.getNews", () => {
  it("fetches per-symbol Yahoo RSS on the KR region feed", async () => {
    const fetcher = makeMockFetcher([{ match: "feeds.finance.yahoo.com", body: YAHOO_RSS }]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW });
    const news = await kr.getNews("005930");
    expect(news.length).toBe(2);
    expect(news.every((n) => n.market === "KR")).toBe(true);
    expect(fetcher.calls.some((c) => c.includes("region=KR"))).toBe(true);
  });

  it("fetches the KOSPI market-wide feed (^KS11) when no symbol is given", async () => {
    const fetcher = makeMockFetcher([{ match: "feeds.finance.yahoo.com", body: YAHOO_RSS }]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW });
    const news = await kr.getNews();
    expect(news.length).toBeGreaterThan(0);
    expect(news[0]!.symbol).toBeUndefined();
    expect(fetcher.calls.some((c) => c.includes("%5EKS11"))).toBe(true);
  });

  it("does not crash when the news feed is unavailable (best-effort)", async () => {
    const fetcher = makeMockFetcher([{ match: "feeds.finance.yahoo.com", throws: true }]);
    const kr = new KrMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    await expect(kr.getNews("005930")).rejects.toBeInstanceOf(MarketDataError);
  });
});
