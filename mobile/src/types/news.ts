/**
 * 뉴스 타입 (서버 GET /api/news 와 1:1 — SPEC §5.3 보조 입력).
 * 본문은 받지 않고(저작권) 헤드라인+출처+시각+링크만. 탭하면 원문을 외부 브라우저로 연다.
 */

/** 뉴스 검색 시장 그룹. */
export type NewsMarket = "US" | "KR";

export interface NewsArticle {
  title: string;
  source: string;
  /** ISO 8601(서버). 없으면 "". */
  publishedAt: string;
  link: string;
}
