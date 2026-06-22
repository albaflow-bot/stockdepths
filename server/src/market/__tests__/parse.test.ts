import { describe, it, expect } from "vitest";
import {
  parseStooqDailyCsv,
  parseStooqQuoteCsv,
  parseYahooChart,
  parseFeed,
  newsId,
} from "../parse.js";
import {
  STOOQ_HISTORY_CSV,
  STOOQ_HISTORY_CSV_DIRTY,
  STOOQ_EMPTY_CSV,
  YAHOO_CHART_JSON,
  YAHOO_RSS,
  SEC_EDGAR_ATOM,
} from "./fixtures.js";

describe("parseStooqDailyCsv", () => {
  it("parses well-formed CSV ascending by date with adjClose mirroring close", () => {
    const c = parseStooqDailyCsv(STOOQ_HISTORY_CSV);
    expect(c).toHaveLength(5);
    expect(c[0]!.date).toBe("2024-06-17");
    expect(c[4]!.date).toBe("2024-06-21");
    expect(c[4]!.close).toBe(105.5);
    expect(c[4]!.adjClose).toBe(105.5);
    expect(c[0]!.volume).toBe(1000000);
  });

  it("skips malformed/junk rows instead of throwing", () => {
    const c = parseStooqDailyCsv(STOOQ_HISTORY_CSV_DIRTY);
    // 3 data lines, one missing close + one junk line dropped -> 2 valid.
    expect(c.map((x) => x.date)).toEqual(["2024-06-17", "2024-06-19"]);
  });

  it("returns [] for a header-only/empty payload", () => {
    expect(parseStooqDailyCsv(STOOQ_EMPTY_CSV)).toEqual([]);
    expect(parseStooqDailyCsv("")).toEqual([]);
  });
});

describe("parseStooqQuoteCsv", () => {
  it("parses the latest-quote row", () => {
    const csv = `Symbol,Date,Time,Open,High,Low,Close,Volume
AAPL.US,2024-06-21,22:00:00,104.0,106.0,103.5,105.5,1300000`;
    const q = parseStooqQuoteCsv(csv);
    expect(q?.symbol).toBe("AAPL.US");
    expect(q?.close).toBe(105.5);
    expect(q?.date).toBe("2024-06-21");
  });

  it("returns undefined for N/D rows", () => {
    const csv = `Symbol,Date,Time,Open,High,Low,Close,Volume
ZZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D`;
    expect(parseStooqQuoteCsv(csv)).toBeUndefined();
  });
});

describe("parseYahooChart", () => {
  it("parses chart JSON, dropping null rows and using adjclose", () => {
    const c = parseYahooChart(YAHOO_CHART_JSON);
    expect(c).toHaveLength(3);
    expect(c[0]!.adjClose).toBe(203.5);
    expect(c[2]!.close).toBe(206);
  });

  it("returns [] on invalid JSON", () => {
    expect(parseYahooChart("not json")).toEqual([]);
    expect(parseYahooChart("{}")).toEqual([]);
  });
});

describe("parseFeed", () => {
  it("parses RSS 2.0 items", () => {
    const items = parseFeed(YAHOO_RSS, { market: "US", symbol: "AAPL", source: "yahoo-rss", kind: "news" });
    expect(items).toHaveLength(2);
    expect(items[0]!.symbol).toBe("AAPL");
    expect(items[0]!.kind).toBe("news");
    expect(items[0]!.url).toContain("aapl-high-1");
    expect(items[0]!.publishedAt).toMatch(/^2024-06-21T13:00/);
  });

  it("parses Atom entries with link href", () => {
    const items = parseFeed(SEC_EDGAR_ATOM, { market: "US", symbol: "AAPL", source: "sec-edgar", kind: "disclosure" });
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("disclosure");
    expect(items[0]!.url).toContain("sec.gov");
  });

  it("returns [] on malformed XML", () => {
    expect(parseFeed("<<<", { market: "US", source: "x", kind: "news" })).toEqual([]);
  });
});

describe("newsId", () => {
  it("is stable and deterministic", () => {
    expect(newsId("u", "t")).toBe(newsId("u", "t"));
    expect(newsId("u", "t")).not.toBe(newsId("u", "t2"));
  });
});
