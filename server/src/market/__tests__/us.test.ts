import { describe, it, expect } from "vitest";
import { UsMarketAdapter, toStooqSymbol, dedupeAndSort, yahooRange } from "../adapters/us.js";
import { MarketDataError, type NewsItem } from "../types.js";
import { makeMockFetcher } from "./mockFetcher.js";
import {
  STOOQ_HISTORY_CSV,
  STOOQ_EMPTY_CSV,
  YAHOO_CHART_JSON,
  YAHOO_RSS,
  SEC_EDGAR_ATOM,
} from "./fixtures.js";

// Fixed clock so date-range URLs are deterministic.
const FIXED_NOW = () => new Date("2024-06-21T22:00:00Z");

describe("toStooqSymbol", () => {
  it("lowercases, appends .us, and converts dots in the root to dashes", () => {
    expect(toStooqSymbol("AAPL")).toBe("aapl.us");
    expect(toStooqSymbol("BRK.B")).toBe("brk-b.us");
  });
});

describe("yahooRange", () => {
  it("maps a fractional quote window to a valid token, not a fractional year", () => {
    expect(yahooRange(20 / 365)).toBe("1mo");
    expect(yahooRange(5)).toBe("5y");
    expect(yahooRange(0.01)).toBe("5d");
    expect(yahooRange(50)).toBe("max");
  });
});

describe("UsMarketAdapter.getHistory", () => {
  it("uses Stooq when it returns rows", async () => {
    const fetcher = makeMockFetcher([{ match: "stooq.com/q/d/l", body: STOOQ_HISTORY_CSV }]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW });
    const hist = await us.getHistory("AAPL");
    expect(hist.source).toBe("stooq");
    expect(hist.candles).toHaveLength(5);
    expect(hist.from).toBe("2024-06-17");
    expect(hist.to).toBe("2024-06-21");
    expect(hist.symbol).toBe("AAPL");
  });

  it("falls back to Yahoo when Stooq is empty", async () => {
    const fetcher = makeMockFetcher([
      { match: "stooq.com/q/d/l", body: STOOQ_EMPTY_CSV },
      { match: "query1.finance.yahoo.com", body: YAHOO_CHART_JSON },
    ]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW });
    const hist = await us.getHistory("AAPL");
    expect(hist.source).toBe("yahoo");
    expect(hist.candles).toHaveLength(3);
  });

  it("falls back to Yahoo when Stooq throws (network error)", async () => {
    const fetcher = makeMockFetcher([
      { match: "stooq.com/q/d/l", throws: true },
      { match: "query1.finance.yahoo.com", body: YAHOO_CHART_JSON },
    ]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    const hist = await us.getHistory("AAPL");
    expect(hist.source).toBe("yahoo");
  });

  it("throws MarketDataError aggregating causes when all sources fail", async () => {
    const fetcher = makeMockFetcher([
      { match: "stooq.com/q/d/l", throws: true },
      { match: "query1.finance.yahoo.com", throws: true },
    ]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    await expect(us.getHistory("AAPL")).rejects.toBeInstanceOf(MarketDataError);
  });

  it("requests a ~5y date window by default", async () => {
    const fetcher = makeMockFetcher([{ match: "stooq.com/q/d/l", body: STOOQ_HISTORY_CSV }]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW });
    await us.getHistory("AAPL");
    const url = fetcher.calls.find((c) => c.includes("stooq"))!;
    expect(url).toContain("d2=20240621");
    expect(url).toContain("d1=2019"); // 5 years earlier
  });
});

describe("UsMarketAdapter.getQuote", () => {
  it("derives price + previousClose from the last two candles", async () => {
    const fetcher = makeMockFetcher([{ match: "stooq.com/q/d/l", body: STOOQ_HISTORY_CSV }]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW });
    const q = await us.getQuote("AAPL");
    expect(q.price).toBe(105.5);
    expect(q.previousClose).toBe(104.0);
    expect(q.change).toBeCloseTo(1.5, 5);
    expect(q.changePercent).toBeCloseTo((1.5 / 104.0) * 100, 5);
    expect(q.delayed).toBe(true);
    expect(q.asOf).toBe("2024-06-21");
  });
});

describe("UsMarketAdapter.getNews", () => {
  it("merges Yahoo RSS news + SEC EDGAR disclosures, newest first", async () => {
    const fetcher = makeMockFetcher([
      { match: "feeds.finance.yahoo.com", body: YAHOO_RSS },
      { match: "sec.gov/cgi-bin/browse-edgar", body: SEC_EDGAR_ATOM },
    ]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW });
    const news = await us.getNews("AAPL");
    expect(news.length).toBe(3);
    // Newest (2024-06-21 Yahoo) first; oldest (EDGAR 06-19) last.
    expect(news[0]!.publishedAt > news[news.length - 1]!.publishedAt).toBe(true);
    expect(news.some((n) => n.kind === "disclosure")).toBe(true);
    expect(news.some((n) => n.source === "yahoo-rss")).toBe(true);
  });

  it("still returns Yahoo news when EDGAR fails", async () => {
    const fetcher = makeMockFetcher([
      { match: "feeds.finance.yahoo.com", body: YAHOO_RSS },
      { match: "sec.gov/cgi-bin/browse-edgar", throws: true },
    ]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    const news = await us.getNews("AAPL");
    expect(news.length).toBe(2);
    expect(news.every((n) => n.source === "yahoo-rss")).toBe(true);
  });

  it("respects the limit option", async () => {
    const fetcher = makeMockFetcher([
      { match: "feeds.finance.yahoo.com", body: YAHOO_RSS },
      { match: "sec.gov/cgi-bin/browse-edgar", body: SEC_EDGAR_ATOM },
    ]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW });
    const news = await us.getNews("AAPL", { limit: 1 });
    expect(news).toHaveLength(1);
  });

  it("fetches market-wide news when no symbol is given", async () => {
    const fetcher = makeMockFetcher([{ match: "feeds.finance.yahoo.com", body: YAHOO_RSS }]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW });
    const news = await us.getNews();
    expect(news.length).toBeGreaterThan(0);
    expect(news[0]!.symbol).toBeUndefined();
    // Should hit the ^GSPC market feed, not a per-ticker one.
    expect(fetcher.calls.some((c) => c.includes("%5EGSPC"))).toBe(true);
  });

  it("throws MarketDataError when every news source fails", async () => {
    const fetcher = makeMockFetcher([
      { match: "feeds.finance.yahoo.com", throws: true },
      { match: "sec.gov/cgi-bin/browse-edgar", throws: true },
    ]);
    const us = new UsMarketAdapter({ fetcher, now: FIXED_NOW, http: { retries: 0 } });
    await expect(us.getNews("AAPL")).rejects.toBeInstanceOf(MarketDataError);
  });
});

describe("dedupeAndSort", () => {
  it("removes duplicate ids and sorts newest first", () => {
    const items: NewsItem[] = [
      { id: "a", market: "US", title: "t1", url: "u1", publishedAt: "2024-01-01T00:00:00Z", source: "s", kind: "news" },
      { id: "a", market: "US", title: "t1", url: "u1", publishedAt: "2024-01-01T00:00:00Z", source: "s", kind: "news" },
      { id: "b", market: "US", title: "t2", url: "u2", publishedAt: "2024-02-01T00:00:00Z", source: "s", kind: "news" },
    ];
    const out = dedupeAndSort(items);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe("b");
  });
});
