/**
 * 뉴스 클라이언트 (서버 GET /api/news). 종목·시장 뉴스를 받아온다.
 *
 * 뉴스는 *보조* 정보라 실패가 화면을 막으면 안 된다 — base 미설정/네트워크/비정상 응답은
 * 모두 빈 배열로 degrade(throw ✗). 호출부(NewsSection)는 빈 목록이면 한 줄 안내만 띄운다.
 */

import { apiBaseUrl } from "./config";
import type { NewsArticle, NewsMarket } from "../types/news";

export interface NewsParams {
  /** 검색어 — 종목명 또는 시장 키워드. */
  q: string;
  market: NewsMarket;
  limit?: number;
}

export type NewsLoader = (params: NewsParams) => Promise<NewsArticle[]>;

/** 응답 article 1건을 방어적으로 정규화 — title·link 가 있어야 통과. */
function normalize(raw: unknown): NewsArticle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r["title"] === "string" ? r["title"].trim() : "";
  const link = typeof r["link"] === "string" ? r["link"] : "";
  if (!title || !link) return null;
  return {
    title,
    source: typeof r["source"] === "string" ? r["source"] : "",
    publishedAt: typeof r["publishedAt"] === "string" ? r["publishedAt"] : "",
    link,
  };
}

/** 종목/시장 뉴스를 가져온다. 실패·미설정은 빈 배열(보조 정보 — 화면 안 막음). */
export const fetchNews: NewsLoader = async ({ q, market, limit = 8 }) => {
  const term = q.trim();
  if (!term) return [];
  const base = apiBaseUrl();
  if (!base) return [];

  const url = `${base}/api/news?q=${encodeURIComponent(term)}&market=${encodeURIComponent(
    market,
  )}&limit=${encodeURIComponent(String(limit))}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return [];
  }
  const arr = (data as { articles?: unknown })?.articles;
  if (!Array.isArray(arr)) return [];
  return arr.map(normalize).filter((a): a is NewsArticle => a != null);
};
