/**
 * Supabase-backed 종목 검색 (SPEC §3.2-Δ C). PostgREST 로 `security_search_v` 뷰를
 * 단일 호출 조회한다 — LIKE 부분일치·JOIN·거래대금 정렬을 모두 DB 가 수행하므로
 * 핸들러는 행을 응답 스키마로 매핑만 한다.
 *
 * 한글 검색: name_ko.ilike.*q* (PostgREST ilike = 대소문자 무시 LIKE). 영문명·코드도
 * 같은 or 절로 동시 매칭. delisted(관리/상폐) 기본 제외. turnover desc·nullslast 로
 * 거래대금 큰 순(스냅샷 없는 종목은 맨 뒤).
 */

import { deriveSignal, directionOf } from "../screener/signal.js";
import {
  marketsInGroup,
  type ExchangeMarket,
  type SecuritySearchItem,
  type SecuritySearchProvider,
  type SecuritySearchQuery,
} from "../screener/types.js";
import { type SupabaseConfig, type FetchLike, selectRows } from "./supabaseRest.js";

const VIEW = "security_search_v";

interface SearchRow {
  market: ExchangeMarket;
  code: string;
  name_ko: string | null;
  name_en: string | null;
  last: number | null;
  change_pct: number | null;
  rvol: number | null;
  rsi14: number | null;
  high_52w: number | null;
  weekly: number[] | null;
  is_etf: boolean | null;
  asof: string | null;
}

/** PostgREST 값에 들어갈 사용자 입력을 안전화: 와일드카드/구분자 문자를 제거. */
function sanitizeLike(q: string): string {
  // ',' '(' ')' '*' 는 PostgREST or 절/패턴 구문 문자 → 검색어에서 제거.
  return q.replace(/[,()*]/g, "").trim();
}

// is_etf 플래그가 일부 레버리지·ETN·ELW 에서 누락되므로 이름 기반 폴백으로 ETF성 상품을
// 강등한다. 대소문자 무시(키워드는 모두 대문자로 두고 name 을 toUpperCase 후 비교).
const ETF_NAME_KEYWORDS = [
  "ETF",
  "ETN",
  "KODEX",
  "TIGER",
  "KBSTAR",
  "ARIRANG",
  "RISE",
  "SOL",
  "ACE",
  "PLUS",
  "TIMEFOLIO",
  "레버리지",
  "인버스",
  "선물",
  "DIREXION",
  "PROSHARES",
  "ISHARES",
  "LEVERAGE SHARES",
  "GRANITESHARES",
  "2X",
  "3X",
  "BULL",
  "BEAR",
  "DAILY",
];

/** 이름(한/영)에 ETF성 키워드가 포함되면 true. 대소문자 무시. */
function nameLooksEtf(r: SearchRow): boolean {
  const haystack = `${r.name_ko ?? ""} ${r.name_en ?? ""}`.toUpperCase();
  return ETF_NAME_KEYWORDS.some((kw) => haystack.includes(kw));
}

/**
 * DB 가 준 순서(거래대금 desc nullslast)를 보존하면서 정확일치·비-ETF 를 상단으로 올리는
 * 안정 정렬. qUpper 는 대문자화된 검색어. 낮은 rank 가 위로 온다.
 */
function rankSearchRows(rows: SearchRow[], qUpper: string): SearchRow[] {
  const rankOf = (r: SearchRow): number => {
    const codeExact = r.code.toUpperCase() === qUpper;
    const nameExact =
      (r.name_ko != null && r.name_ko.toUpperCase() === qUpper) ||
      (r.name_en != null && r.name_en.toUpperCase() === qUpper);
    if (codeExact) return 0; // 정확일치는 키워드와 무관하게 최우선 유지
    if (nameExact) return 1;
    // is_etf 플래그가 누락돼도 이름 기반 폴백으로 ETF성 상품을 강등.
    const isEtf = r.is_etf === true || nameLooksEtf(r);
    if (!isEtf) return 2; // 비-ETF (null 포함) 가 ETF 보다 먼저
    return 3;
  };
  // index 를 최종 tiebreak 으로 사용 → DB 순서를 안정적으로 보존.
  return rows
    .map((row, index) => ({ row, index, rank: rankOf(row) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((e) => e.row);
}

export class SupabaseSecuritySearchStore implements SecuritySearchProvider {
  private readonly cfg: SupabaseConfig;
  private readonly fetchImpl?: FetchLike;

  constructor(cfg: SupabaseConfig, fetchImpl?: FetchLike) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  async search(query: SecuritySearchQuery): Promise<SecuritySearchItem[]> {
    const q = sanitizeLike(query.q);
    if (!q) return [];

    const pattern = `*${q}*`;
    const or = `or=(name_ko.ilike.${pattern},name_en.ilike.${pattern},code.ilike.${pattern})`;
    const markets = marketsInGroup(query.market);
    const marketFilter = `market=in.(${markets.join(",")})`;
    const limit = Math.max(1, Math.min(query.limit, 100));
    // JS 재정렬이 DB limit 이후라, 작은 limit 에서는 거래대금 하위인 정확일치/실종목이
    // DB 단계에서 잘려 못 올라온다. 넉넉히 받아 재정렬 후 slice 한다(PostgREST 최대 100 가드).
    const fetchLimit = Math.min(100, Math.max(limit, limit * 4));
    const qs = [
      "select=market,code,name_ko,name_en,last,change_pct,rvol,rsi14,high_52w,weekly,is_etf,asof",
      or,
      marketFilter,
      "delisted=eq.0",
      "order=turnover.desc.nullslast",
      `limit=${fetchLimit}`,
    ].join("&");

    let rows: SearchRow[];
    try {
      rows = await selectRows<SearchRow>(this.cfg, VIEW, qs, this.fetchImpl);
    } catch {
      return []; // graceful: 검색 실패는 빈 결과(에러로 막지 않음)
    }

    // DB 순서(거래대금 desc nullslast)를 tiebreak 으로 보존하는 안정 정렬.
    // 우선순위: 코드 정확일치 > 종목명 정확일치 > 비-ETF > 기존 순서.
    const qUpper = query.q.trim().toUpperCase();
    rows = rankSearchRows(rows, qUpper).slice(0, limit);

    return rows.map((r) => ({
      market: r.market,
      code: r.code,
      name_ko: r.name_ko,
      name_en: r.name_en,
      last: r.last,
      change_pct: r.change_pct,
      direction: directionOf(r.change_pct),
      weekly: Array.isArray(r.weekly) ? r.weekly : [],
      signal: deriveSignal({
        last: r.last,
        change_pct: r.change_pct,
        rvol: r.rvol,
        rsi14: r.rsi14,
        high_52w: r.high_52w,
      }),
      asof: r.asof ?? null,
    }));
  }
}
