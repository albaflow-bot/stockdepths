/**
 * 종목 히스토리(일봉) 타입 — 서버 GET /api/history 응답과 1:1.
 *
 * 무료 데이터라 일봉만 제공(인트라데이 ✗). 구글 파이낸스 스타일 상세 화면의 차트·스탯
 * 그리드에 쓰인다. market 은 US|KR 그룹 단위(거래소가 아니라 그룹).
 */

/** 차트 기간 범위. 서버 기본 1M. */
export type HistoryRange = "5D" | "1M" | "3M" | "1Y" | "5Y";

/** 차트용 시장 그룹(거래소 아님). */
export type HistoryMarket = "US" | "KR";

/** 일봉 한 점 — 날짜(YYYY-MM-DD)와 종가. */
export interface HistoryPoint {
  date: string;
  close: number;
}

/** 상세 화면 스탯 그리드 데이터. 일부 필드는 데이터 부재 시 누락될 수 있다. */
export interface HistoryStats {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  prevClose: number | null;
  high52: number | null;
  low52: number | null;
  asOf: string | null;
}

/** 서버 /api/history 응답. */
export interface HistoryResponse {
  symbol: string;
  market: HistoryMarket;
  range: HistoryRange;
  points: HistoryPoint[];
  stats: HistoryStats;
}
