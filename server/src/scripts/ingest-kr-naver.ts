/**
 * KR 전종목 ingest (무가입·무키) — SPEC §3.3-Δ "무료·필요시 크롤링" 방침에 따른 KR 소스.
 *
 * 토스/한투 Open API 는 계좌개설이 필요하고, pykrx·KRX OpenAPI 는 무료라도 KRX 로그인을
 * 요구한다. 네이버 증권 공개 JSON 은 키·가입 없이 KOSPI/KOSDAQ 전종목의 마스터(코드·이름)
 * 와 당일 스냅샷(종가·등락률·거래량·거래대금)을 페이지네이션으로 제공한다 → 이걸로
 * `security_master`(KR) + `daily_screen`(KR) 를 채워 KR 검색·발굴을 US 처럼 실동작시킨다.
 *
 * ⚠ 비공식 크롤링 — 스키마/차단 변동 시 깨질 수 있다(어댑터 인터페이스 뒤라 소스만 교체 가능).
 *   RVOL/RSI/52주(이력 기반)는 스냅샷만으론 null — 후속 이력 배치가 보강.
 *
 * Usage: npm run ingest:kr
 */

import { createScreenStore, storageMode } from "../storage/index.js";
import type { ExchangeMarket, SecurityMasterRecord, DailyScreenRecord } from "../screener/types.js";

const MARKETS: ExchangeMarket[] = ["KOSPI", "KOSDAQ"];
const PAGE_SIZE = 100;
const UA = "Mozilla/5.0";

export interface NaverStock {
  itemCode?: string;
  stockName?: string;
  stockEndType?: string; // 'stock' | 'etf' | ...
  closePrice?: string; // "358,500"
  fluctuationsRatio?: string; // "5.29" (부호 없음 — 방향은 compareToPreviousPrice)
  compareToPreviousPrice?: { text?: string }; // "상승" | "하락" | "보합"
  accumulatedTradingVolume?: string; // "34,552,588"
  accumulatedTradingValue?: string; // 백만원 단위 "12,381,294"
  marketValueRaw?: string; // 시가총액 KRW raw "1984811587416000"
  localTradedAt?: string; // "2026-06-25T16:10:20+09:00"
}

interface NaverPage {
  stocks?: NaverStock[];
  totalCount?: number;
}

/** "358,500" → 358500, 빈값/비정상 → null. */
function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** fluctuationsRatio(부호 없음) + 방향 텍스트 → 부호 있는 등락률. */
function signedPct(item: NaverStock): number | null {
  const mag = num(item.fluctuationsRatio);
  if (mag == null) return null;
  const dir = item.compareToPreviousPrice?.text ?? "";
  if (dir.includes("하락")) return -Math.abs(mag);
  if (dir.includes("보합")) return 0;
  return Math.abs(mag);
}

export interface ParsedNaverStock {
  master: SecurityMasterRecord;
  /** 거래대금 0/null(PREOPEN/미체결)이면 null → daily_screen 적재 스킵(마스터는 갱신). */
  screen: DailyScreenRecord | null;
}

/**
 * 네이버 marketValue stock 한 건 → { master, screen|null }. 순수 함수(테스트 가능).
 * itemCode 누락 → null 반환(스킵 신호).
 */
export function parseNaverStock(market: ExchangeMarket, s: NaverStock): ParsedNaverStock | null {
  const code = (s.itemCode ?? "").trim();
  if (!code) return null;
  const asof = (s.localTradedAt ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);

  const master: SecurityMasterRecord = {
    market,
    code,
    name_ko: s.stockName?.trim() || null,
    name_en: null,
    is_etf: s.stockEndType === "etf",
    delisted: false,
  };
  // 거래대금(백만원 단위 → KRW). PREOPEN/장중 미체결이면 null → 그 빈 세션 행으로
  // 직전 정상 EOD 를 덮어쓰지 않도록 daily_screen 적재를 건너뛴다(마스터는 갱신).
  const v = num(s.accumulatedTradingValue);
  const turnoverKrw = v == null ? null : v * 1_000_000;
  if (turnoverKrw == null || turnoverKrw <= 0) return { master, screen: null };

  return {
    master,
    screen: {
      market,
      code,
      asof,
      last: num(s.closePrice),
      change_pct: signedPct(s),
      volume: num(s.accumulatedTradingVolume),
      turnover: turnoverKrw,
      rvol: null,
      high_52w: null,
      low_52w: null,
      rsi14: null,
      market_cap: num(s.marketValueRaw),
    },
  };
}

async function fetchPage(market: ExchangeMarket, page: number): Promise<NaverPage> {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`naver ${market} page ${page} → HTTP ${res.status}`);
  return (await res.json()) as NaverPage;
}

interface MarketResult {
  master: SecurityMasterRecord[];
  screen: DailyScreenRecord[];
}

async function ingestMarket(market: ExchangeMarket): Promise<MarketResult> {
  const master: SecurityMasterRecord[] = [];
  const screen: DailyScreenRecord[] = [];
  const seen = new Set<string>();
  let page = 1;
  let total = Infinity;

  while (master.length < total) {
    const data = await fetchPage(market, page);
    if (typeof data.totalCount === "number") total = data.totalCount;
    const stocks = data.stocks ?? [];
    if (stocks.length === 0) break; // 더 없으면 종료(방어)

    for (const s of stocks) {
      const parsed = parseNaverStock(market, s);
      if (parsed == null || seen.has(parsed.master.code)) continue;
      seen.add(parsed.master.code);
      master.push(parsed.master);
      if (parsed.screen != null) screen.push(parsed.screen);
    }
    page += 1;
    if (page > 500) break; // 무한루프 방어
  }
  return { master, screen };
}

async function saveChunked<T>(rows: T[], save: (chunk: T[]) => Promise<void>, label: string): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await save(rows.slice(i, i + CHUNK));
    console.log(`[ingest:kr] ${label} ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
}

async function main(): Promise<void> {
  console.log(`[ingest:kr] storage=${storageMode()}`);
  const store = createScreenStore();

  for (const market of MARKETS) {
    const { master, screen } = await ingestMarket(market);
    const etf = master.filter((m) => m.is_etf).length;
    console.log(`[ingest:kr] ${market}: ${master.length}종목 (ETF ${etf}) · 스냅샷 ${screen.length}`);
    await saveChunked(master, (c) => store.saveMaster(c), `${market} master`);
    await saveChunked(screen, (c) => store.saveDailyScreen(c), `${market} screen`);
  }
  console.log(`[ingest:kr] done — KR 전종목 마스터 + 당일 스냅샷 적재 완료`);
}

// 직접 실행될 때만 ingest 수행(테스트가 파싱 함수만 import 할 때는 main() 미실행).
const isEntrypoint = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  const norm = arg.replace(/\\/g, "/");
  return import.meta.url.endsWith(norm) || import.meta.url.endsWith(norm.replace(/\.ts$/, ".js"));
})();
if (isEntrypoint) {
  main().catch((err) => {
    console.error("[ingest:kr] failed:", err);
    process.exitCode = 1;
  });
}
