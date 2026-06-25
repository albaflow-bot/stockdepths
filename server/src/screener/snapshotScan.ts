/**
 * 스냅샷 기반 스캔 소스 (SPEC §3.3-Δ2 "스크리너는 daily_screen 테이블의 정렬·필터만 수행").
 *
 * 기존 {@link makeAdapterScanSource} 는 종목별 일봉을 *재수집*해 지표를 계산한다(전종목엔
 * 비현실적). 이 소스는 이미 적재된 `security_master` + `daily_screen`(ingest 배치가 채움)
 * 을 합친 뷰 `security_search_v` 를 읽어 {@link ScreenedSymbol} 을 *직접* 구성한다 →
 * candle 재수집 0회로 전종목 발굴(급등/급락/대금집중)이 즉시 동작.
 *
 * 이력 기반 지표(rvol/rsi14/52주)는 스냅샷에 없으면 null → 해당 카테고리(거래폭발/돌파/
 * 과매도)만 비고, 등락률·거래대금 카테고리는 정상 동작. Supabase 전용(운영 경로).
 */

import type { SupabaseConfig, FetchLike } from "../storage/supabaseRest.js";
import { selectRows } from "../storage/supabaseRest.js";
import { marketsInGroup, type ExchangeMarket, type MarketGroup, type SecurityMasterRecord } from "./types.js";
import type { ScreenedSymbol } from "./screenMetrics.js";

const VIEW = "security_search_v";
const PAGE = 1000; // PostgREST 기본 상한

interface SearchView {
  market: ExchangeMarket;
  code: string;
  name_ko: string | null;
  name_en: string | null;
  is_etf: number | boolean | null;
  delisted: number | boolean | null;
  asof: string | null;
  last: number | null;
  change_pct: number | null;
  volume: number | null;
  turnover: number | null;
  rvol: number | null;
  high_52w: number | null;
  low_52w: number | null;
  rsi14: number | null;
  weekly: number[] | null;
}

function truthy(v: number | boolean | null): boolean {
  return v === true || v === 1;
}

/** KR 우선주(코드가 0 이외로 끝남: 005935 삼성전자우)·관리종목 휴리스틱. */
function isKrPreferred(market: ExchangeMarket, code: string): boolean {
  return (market === "KOSPI" || market === "KOSDAQ") && !/0$/.test(code);
}

function toScreened(r: SearchView, fallbackAsof: string): ScreenedSymbol {
  const master: SecurityMasterRecord = {
    market: r.market,
    code: r.code,
    name_ko: r.name_ko,
    name_en: r.name_en,
    is_etf: truthy(r.is_etf),
    delisted: truthy(r.delisted),
  };
  return {
    master,
    screen: {
      market: r.market,
      code: r.code,
      asof: r.asof ?? fallbackAsof,
      last: r.last,
      change_pct: r.change_pct,
      volume: r.volume,
      turnover: r.turnover,
      rvol: r.rvol,
      high_52w: r.high_52w,
      low_52w: r.low_52w,
      rsi14: r.rsi14,
    },
    weeklyCloses: Array.isArray(r.weekly) ? r.weekly.filter((n) => typeof n === "number") : [],
    marketCap: null, // 무료 스냅샷엔 시총 없음 — 대형주 배제는 그 종목에 비활성(adapterScan 과 동일 한계).
    listedDays: null,
    isManaged: false,
    isPreferred: isKrPreferred(r.market, r.code),
    isLargeCap: false,
  };
}

export interface SnapshotScanOptions {
  cfg: SupabaseConfig;
  group: MarketGroup;
  asof: string;
  fetchImpl?: FetchLike;
}

/**
 * 그룹(US/KR/ALL)의 전종목 스냅샷을 `security_search_v` 에서 페이지네이션으로 읽어
 * ScreenedSymbol[] 로 반환. runScreenBatch 의 `screenedSource` 로 넘긴다.
 */
export function makeSnapshotScanSource(opts: SnapshotScanOptions): () => Promise<ScreenedSymbol[]> {
  const markets = marketsInGroup(opts.group);
  const marketFilter = `market=in.(${markets.join(",")})`;
  const select =
    "select=market,code,name_ko,name_en,is_etf,delisted,asof,last,change_pct,volume,turnover,rvol,high_52w,low_52w,rsi14,weekly";

  return async () => {
    const out: ScreenedSymbol[] = [];
    let offset = 0;
    for (;;) {
      const query = [select, marketFilter, "delisted=eq.0", `limit=${PAGE}`, `offset=${offset}`].join("&");
      const rows = await selectRows<SearchView>(opts.cfg, VIEW, query, opts.fetchImpl);
      for (const r of rows) {
        if (!r.code) continue;
        out.push(toScreened(r, opts.asof));
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    return out;
  };
}
