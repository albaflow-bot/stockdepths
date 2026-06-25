/**
 * 종목 검색 응답 타입 (서버 GET /api/search 와 1:1 — SPEC 피드백 라운드 4 §3.2-Δ C).
 * 서버가 direction 을 결정론으로 확정해 내려주므로(등락률 부호) 클라는 색상만 분기한다.
 */

/** 거래소 단위 마켓 코드. */
export type ExchangeMarket = "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE";

/** 검색/필터 마켓 그룹. 'US'=NASDAQ+NYSE, 'KR'=KOSPI+KOSDAQ. */
export type MarketGroup = "ALL" | "US" | "KR";

/** 등락 방향 (서버 확정). */
export type Direction = "up" | "down" | "flat";

/** §0 타이밍 환원 — 한 줄 행동 신호 + 근거. 근거 없는 신호는 내려오지 않는다. */
export interface SecuritySignal {
  label: string;
  reason: string;
}

/** 검색 결과 한 종목. */
export interface SecuritySearchItem {
  market: ExchangeMarket;
  code: string;
  name_ko: string | null;
  name_en: string | null;
  last: number | null;
  change_pct: number | null;
  direction: Direction;
  /** 최근 7거래일 종가 (스파크라인). 없으면 빈 배열. */
  weekly: number[];
  /** 타이밍 한 줄 신호(있으면). 없으면 null. */
  signal: SecuritySignal | null;
}

/** 결과 정렬 기준 (클라 토글). */
export type SearchSort = "turnover" | "change";

/** KR 거래소 여부 — 색상 관례 분기에 사용. */
export function isKrMarket(market: ExchangeMarket): boolean {
  return market === "KOSPI" || market === "KOSDAQ";
}

/** 거래소 → 한국어 시장 라벨. */
export function marketLabel(market: ExchangeMarket): string {
  switch (market) {
    case "KOSPI":
      return "코스피";
    case "KOSDAQ":
      return "코스닥";
    case "NASDAQ":
      return "나스닥";
    case "NYSE":
      return "뉴욕";
  }
}

/** 표시용 이름 — 한글명 우선, 없으면 영문명, 둘 다 없으면 코드. */
export function displayName(item: Pick<SecuritySearchItem, "name_ko" | "name_en" | "code">): string {
  return item.name_ko?.trim() || item.name_en?.trim() || item.code;
}
