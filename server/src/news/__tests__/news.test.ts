import { describe, it, expect } from "vitest";
import { isWhitelistedUrl, hostOf, gateItems } from "../gate.js";
import { makeTickerTagger } from "../tag.js";
import { NewsCollector, taggedTickers } from "../collector.js";
import { WHITELISTED_DOMAINS, sourcesForMarket } from "../../config/newsSources.js";
import { makeMockFetcher } from "../../market/__tests__/mockFetcher.js";
import type { NewsItem } from "../../market/types.js";

describe("source gate", () => {
  it("accepts whitelisted domains + subdomains", () => {
    expect(isWhitelistedUrl("https://finance.yahoo.com/news/x")).toBe(true);
    expect(isWhitelistedUrl("https://www.sec.gov/cgi-bin/x")).toBe(true);
    expect(isWhitelistedUrl("https://dart.fss.or.kr/x")).toBe(true);
  });
  it("rejects non-whitelisted / spoofed hosts", () => {
    expect(isWhitelistedUrl("https://chiraisi-rumors.example.com/x")).toBe(false);
    // dot-anchored suffix: spoof host must not pass for sec.gov
    expect(isWhitelistedUrl("https://evil-sec.gov.attacker.com/x")).toBe(false);
    expect(isWhitelistedUrl("not a url")).toBe(false);
  });
  it("hostOf parses or returns undefined", () => {
    expect(hostOf("https://A.Finance.Yahoo.com/p")).toBe("a.finance.yahoo.com");
    expect(hostOf("###")).toBeUndefined();
  });
  it("gateItems drops untrusted items", () => {
    const items = [
      { id: "1", url: "https://finance.yahoo.com/a", title: "ok", market: "US", publishedAt: "", source: "x", kind: "news" },
      { id: "2", url: "https://spam.example.com/b", title: "bad", market: "US", publishedAt: "", source: "x", kind: "news" },
    ] as NewsItem[];
    expect(gateItems(items).map((i) => i.id)).toEqual(["1"]);
  });
  it("WHITELISTED_DOMAINS is the union of source domains", () => {
    expect(WHITELISTED_DOMAINS).toContain("sec.gov");
    expect(WHITELISTED_DOMAINS).toContain("finance.yahoo.com");
    expect(WHITELISTED_DOMAINS).toContain("dart.fss.or.kr");
  });
});

describe("ticker tagger", () => {
  const tagger = makeTickerTagger(["AAPL", "V", "005930"], { "005930": "삼성전자" });
  it("matches uppercase ticker with word boundary", () => {
    expect(tagger.detect("AAPL hits new high")).toEqual(["AAPL"]);
  });
  it("does not match a ticker inside a lowercase word", () => {
    // "V" must not match the 'v' in "value"
    expect(tagger.detect("value investing wins")).toEqual([]);
  });
  it("matches a KR name when the code is absent from the headline", () => {
    expect(tagger.detect("삼성전자 4분기 실적 발표")).toEqual(["005930"]);
  });
  it("returns [] for empty text", () => {
    expect(tagger.detect("")).toEqual([]);
  });
});

describe("sourcesForMarket", () => {
  it("returns US press + EDGAR for US", () => {
    expect(sourcesForMarket("US").map((s) => s.id).sort()).toEqual(["sec-edgar", "yahoo-rss-us"]);
  });
  it("returns KR press + DART for KR", () => {
    expect(sourcesForMarket("KR").map((s) => s.id).sort()).toEqual(["dart", "yahoo-rss-kr"]);
  });
});

const YAHOO_RSS_AAPL = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>AAPL surges on strong demand</title>
    <link>https://finance.yahoo.com/news/aapl-1</link>
    <pubDate>Fri, 21 Jun 2024 13:00:00 GMT</pubDate>
    <guid>https://finance.yahoo.com/news/aapl-1</guid>
  </item>
</channel></rss>`;

const SEC_ATOM_AAPL = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - Apple Inc material event</title>
    <link href="https://www.sec.gov/filing/aapl-8k"/>
    <updated>2024-06-20T10:00:00Z</updated>
  </entry>
</feed>`;

describe("NewsCollector", () => {
  it("collects only whitelisted sources, tags tickers, keeps original URLs", async () => {
    const fetcher = makeMockFetcher([
      { match: "feeds.finance.yahoo.com", body: YAHOO_RSS_AAPL },
      { match: "sec.gov", body: SEC_ATOM_AAPL },
    ]);
    const collector = new NewsCollector({ fetcher, http: { retries: 0 } });

    const result = await collector.collect({
      market: "US",
      universe: ["AAPL"],
      names: { AAPL: "Apple" },
    });

    expect(result.items.length).toBeGreaterThan(0);
    // every surviving item is from a trusted host
    expect(result.items.every((i) => i.url.includes("yahoo.com") || i.url.includes("sec.gov"))).toBe(true);
    // disclosure tagged via company name; both reference AAPL
    expect(taggedTickers(result)).toContain("AAPL");
    // both source kinds contributed
    expect(result.usedSources).toContain("yahoo-rss-us");
    expect(result.usedSources).toContain("sec-edgar");
  });

  it("skips the key-gated DART source gracefully and notes it", async () => {
    const fetcher = makeMockFetcher([{ match: "feeds.finance.yahoo.com", body: YAHOO_RSS_AAPL }]);
    const collector = new NewsCollector({ fetcher, http: { retries: 0 } });
    const result = await collector.collect({ market: "KR", universe: ["005930"], names: { "005930": "삼성전자" } });
    expect(result.notes.some((n) => n.startsWith("dart:"))).toBe(true);
    // it did not throw, and yahoo KR still worked
    expect(result.usedSources).toContain("yahoo-rss-kr");
  });

  it("is resilient: a total fetch failure yields an empty result, not a throw", async () => {
    const fetcher = makeMockFetcher([]); // everything 404s
    const collector = new NewsCollector({ fetcher, http: { retries: 0 } });
    const result = await collector.collect({ market: "US", universe: ["AAPL"] });
    expect(result.items).toEqual([]);
    expect(result.notes.some((n) => n.includes("수집된 항목이 없습니다"))).toBe(true);
  });
});
