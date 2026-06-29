import { describe, it, expect } from "vitest";
import { fetchNews } from "../googleNews.js";

function rss(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

function item(title: string, source: string, link = "https://news.google.com/x", pub = "Mon, 29 Jun 2026 01:00:00 GMT"): string {
  return `<item><title>${title}</title><link>${link}</link><pubDate>${pub}</pubDate><source url="http://x">${source}</source></item>`;
}

function fakeFetch(xml: string) {
  return async () => ({ ok: true, status: 200, text: async () => xml });
}

describe("fetchNews — 신뢰 출처 게이팅", () => {
  it("화이트리스트 출처만 통과, 찌라시/블로그는 제외", async () => {
    const xml = rss(
      item("삼성전자 신고가 - 연합뉴스", "연합뉴스") +
        item("삼성전자 떡상 각 - 주식까페", "어떤블로그") +
        item("Samsung beats estimates - Reuters", "Reuters"),
    );
    const out = await fetchNews({ q: "삼성전자", market: "KR", limit: 8 }, fakeFetch(xml));
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.source)).toEqual(["연합뉴스", "Reuters"]);
  });

  it("제목 끝 ' - 출처' 꼬리표 제거 + pubDate ISO 변환", async () => {
    const xml = rss(item("코스피 3000 돌파 - 한국경제", "한국경제"));
    const [a] = await fetchNews({ q: "코스피", market: "KR" }, fakeFetch(xml));
    expect(a!.title).toBe("코스피 3000 돌파");
    expect(a!.source).toBe("한국경제");
    expect(a!.publishedAt).toBe("2026-06-29T01:00:00.000Z");
    expect(a!.link).toBe("https://news.google.com/x");
  });

  it("limit 을 넘지 않는다", async () => {
    const xml = rss(Array.from({ length: 10 }, (_, i) => item(`기사${i} - 매일경제`, "매일경제")).join(""));
    const out = await fetchNews({ q: "증시", market: "KR", limit: 3 }, fakeFetch(xml));
    expect(out).toHaveLength(3);
  });

  it("빈 q 는 빈 배열(요청 안 보냄)", async () => {
    const out = await fetchNews({ q: "  ", market: "US" }, fakeFetch(rss("")));
    expect(out).toEqual([]);
  });

  it("item 이 단일(배열 아님)이어도 파싱", async () => {
    const xml = rss(item("Nvidia surges - CNBC", "CNBC"));
    const out = await fetchNews({ q: "NVDA", market: "US" }, fakeFetch(xml));
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("Nvidia surges");
  });
});
