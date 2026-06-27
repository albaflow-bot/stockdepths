/**
 * 종목 검색 / 발굴 스크리너 도메인 타입 (SPEC 피드백 라운드 4 §3.2-Δ B/C, §3.3-Δ).
 *
 * 검색·스크리닝의 원천은 세 테이블(security_master / daily_screen / weekly_series)이고,
 * 후보 *선정* 은 결정론적 시장 스캔이다(§0-Δ). 여기 선언된 모델만 downstream(검색
 * API·스크리너)이 의존하며, 구체 저장소(Supabase vs 디스크)는 뒤에 숨는다.
 */

/** 거래소 단위 마켓 코드 (security_master.market). */
export type ExchangeMarket = "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE";

/** 검색/필터에서 쓰는 마켓 그룹. 'US'=NASDAQ+NYSE, 'KR'=KOSPI+KOSDAQ. */
export type MarketGroup = "ALL" | "US" | "KR";

/** 등락 방향 — change_pct 부호로 서버에서 결정론 산출(클라 색상 분기의 단일 진실원천). */
export type Direction = "up" | "down" | "flat";

/** 전종목 마스터 한 행 (검색 인덱스). */
export interface SecurityMasterRecord {
  market: ExchangeMarket;
  code: string;
  name_ko: string | null;
  name_en: string | null;
  is_etf: boolean;
  delisted: boolean;
}

/** 일별 스크리닝 스냅샷 한 행 (스크리너 입력). */
export interface DailyScreenRecord {
  market: ExchangeMarket;
  code: string;
  asof: string; // YYYY-MM-DD
  last: number | null;
  change_pct: number | null;
  volume: number | null;
  turnover: number | null;
  rvol: number | null;
  high_52w: number | null;
  low_52w: number | null;
  rsi14: number | null;
  /** 시가총액(원/달러) — 대형주 식별·분리용. 무료 소스에 있으면 채움, 없으면 null/생략. */
  market_cap?: number | null;
}

/** 주간 추이 한 행 (스파크라인). closes = 최근 7거래일 종가. */
export interface WeeklySeriesRecord {
  market: ExchangeMarket;
  code: string;
  closes: number[];
}

/**
 * §0 타이밍 환원 — "한 줄 행동 신호 + 근거". 근거 없는 신호는 만들지 않는다
 * (learnings: "근거 없는 신호는 렌더 금지"). 추가 LLM 호출 0 — daily_screen 지표에서
 * 결정론으로 도출한다.
 */
export interface SecuritySignal {
  label: string;
  reason: string;
}

/** GET /api/search 한 항목의 응답 스키마. */
export interface SecuritySearchItem {
  market: ExchangeMarket;
  code: string;
  name_ko: string | null;
  name_en: string | null;
  /** 당일 종가/현재가 (스냅샷 없으면 null). */
  last: number | null;
  /** 전일대비 등락률(%). */
  change_pct: number | null;
  /** change_pct 부호로 결정론 산출. */
  direction: Direction;
  /** 최근 7거래일 종가 배열 (스파크라인). 없으면 빈 배열. */
  weekly: number[];
  /** 타이밍 한 줄 신호(있으면) — 없으면 null. */
  signal: SecuritySignal | null;
}

/** 정규화된 검색 질의. */
export interface SecuritySearchQuery {
  q: string;
  market: MarketGroup;
  limit: number;
}

/** 검색 제공자 — Supabase(운영) / 인메모리(로컬·테스트) 양쪽이 구현. */
export interface SecuritySearchProvider {
  search(query: SecuritySearchQuery): Promise<SecuritySearchItem[]>;
  /** 비동기 백엔드(Supabase)가 라우팅 전에 미리 적재할 훅. 디스크는 no-op. */
  hydrate?(): Promise<void>;
}

/** 'US'|'KR'|'ALL' → 포함할 거래소 마켓 목록. */
export function marketsInGroup(group: MarketGroup): ExchangeMarket[] {
  if (group === "US") return ["NASDAQ", "NYSE"];
  if (group === "KR") return ["KOSPI", "KOSDAQ"];
  return ["KOSPI", "KOSDAQ", "NASDAQ", "NYSE"];
}
