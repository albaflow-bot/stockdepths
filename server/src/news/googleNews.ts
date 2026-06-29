/**
 * 종목·시장 뉴스 — Google News RSS 검색을 신뢰 언론사 화이트리스트로 게이팅(SPEC §5.3
 * "출처 게이트: 공시·주요 언론사 RSS만, 찌라시 제외").
 *
 * Google News RSS(search) 는 키 없이 q 로 종목명·시장 키워드를 검색하고 item.source 에
 * 출처명을 준다. 통짜로 쓰면 찌라시가 섞이므로 TRUSTED_SOURCES 에 든 출처만 통과시킨다.
 * 본문은 긁지 않고(저작권) 헤드라인+출처+시각+링크만 — 앱은 링크를 외부 브라우저로 연다.
 */

import { XMLParser } from "fast-xml-parser";

export interface NewsArticle {
  title: string;
  source: string;
  /** ISO 8601. 파싱 실패 시 "". */
  publishedAt: string;
  link: string;
}

export interface FetchNewsParams {
  /** 검색어 — 종목명(예: "삼성전자") 또는 시장 키워드(예: "코스피 증시"). */
  q: string;
  market: "KR" | "US";
  limit?: number;
}

/** 신뢰 출처(소문자 부분일치). 공시/주요 언론사 화이트리스트 — 찌라시·블로그·커뮤니티 차단. */
const TRUSTED_SOURCES: string[] = [
  // KR
  "연합뉴스", "연합인포맥스", "한국경제", "한경", "매일경제", "매경", "서울경제", "머니투데이",
  "이데일리", "조선비즈", "파이낸셜뉴스", "헤럴드경제", "아시아경제", "뉴스1", "뉴시스",
  "한겨레", "중앙일보", "동아일보", "조선일보", "경향신문", "국민일보", "세계일보",
  "kbs", "mbc", "sbs", "ytn", "비즈워치", "더벨", "인포스탁", "뉴스핌", "데일리안",
  "글로벌이코노믹", "디지털타임스", "전자신문", "이투데이", "브릿지경제", "프라임경제",
  // US / global
  "reuters", "bloomberg", "cnbc", "wall street journal", "wsj", "marketwatch",
  "yahoo finance", "barron", "financial times", "forbes", "business insider",
  "associated press", "ap news", "investor's business", "seeking alpha", "motley fool",
  "benzinga", "thestreet", "the street", "zacks", "morningstar", "nasdaq",
  "investopedia", "axios", "fortune", "the new york times", "cnn business",
];

function isTrusted(source: string): boolean {
  const s = source.trim().toLowerCase();
  if (!s) return false;
  return TRUSTED_SOURCES.some((k) => s.includes(k));
}

/** Google News 제목 끝의 " - 출처" 접미사를 제거(중복 출처 표기 방지). */
function cleanTitle(title: string, source: string): string {
  const t = title.trim();
  if (source && t.endsWith(` - ${source}`)) return t.slice(0, -(source.length + 3)).trim();
  const dash = t.lastIndexOf(" - ");
  if (dash > 0 && t.length - dash < 40) return t.slice(0, dash).trim(); // 짧은 꼬리표만 제거
  return t;
}

/** RSS item.source 는 { '#text', '@_url' } 객체이거나 문자열일 수 있다. */
function sourceText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && "#text" in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function toIso(pubDate: unknown): string {
  if (!pubDate) return "";
  const d = new Date(String(pubDate));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

function localeFor(market: "KR" | "US"): { hl: string; gl: string; ceid: string } {
  return market === "KR"
    ? { hl: "ko", gl: "KR", ceid: "KR:ko" }
    : { hl: "en-US", gl: "US", ceid: "US:en" };
}

/** Google News RSS 검색 → 신뢰 출처만 → 상위 limit. 네트워크/파싱 실패는 throw(핸들러가 graceful 처리). */
export async function fetchNews(params: FetchNewsParams, fetchImpl?: FetchLike): Promise<NewsArticle[]> {
  const q = params.q.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(params.limit ?? 8, 20));
  const { hl, gl, ceid } = localeFor(params.market);
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

  const doFetch = (fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let xml: string;
  try {
    const res = await doFetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`google news HTTP ${res.status}`);
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as {
    rss?: { channel?: { item?: unknown } };
  };
  const rawItems = parsed?.rss?.channel?.item;
  const items: Array<Record<string, unknown>> = Array.isArray(rawItems)
    ? (rawItems as Array<Record<string, unknown>>)
    : rawItems
      ? [rawItems as Record<string, unknown>]
      : [];

  const out: NewsArticle[] = [];
  for (const it of items) {
    const source = sourceText(it["source"]);
    if (!isTrusted(source)) continue;
    const title = cleanTitle(String(it["title"] ?? ""), source);
    const link = String(it["link"] ?? "");
    if (!title || !link) continue;
    out.push({ title, source, publishedAt: toIso(it["pubDate"]), link });
    if (out.length >= limit) break;
  }
  return out;
}
