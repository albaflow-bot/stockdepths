/**
 * US 전종목 당일 스냅샷 ingest (무가입·무키) — KR 네이버(ingest:kr)의 US 대응.
 *
 * Nasdaq 공개 screener(`api.nasdaq.com/api/screener/stocks?download=true`)가 키 없이
 * 전종목의 종가·등락률·거래량·시총을 내려준다. 이걸 `daily_screen`(US)에 적재하면
 * 발굴(급등/급락/대금집중)이 candle 재수집 없이 US 전종목으로 동작한다.
 *
 * 거래소 매핑: screener `exchange` 필터로 정확히 — NASDAQ→NASDAQ, NYSE/AMEX→NYSE
 * (security_master ingest 가 otherlisted 를 전부 NYSE 로 접은 것과 정합).
 * turnover 는 종가×거래량 근사(별도 거래대금 컬럼 없음). RVOL/RSI/52주는 이력 필요 → null.
 *
 * Usage: npm run ingest:us:snapshot
 */

import { createScreenStore, storageMode } from "../storage/index.js";
import type { ExchangeMarket, DailyScreenRecord } from "../screener/types.js";

interface NasdaqRow {
  symbol?: string;
  lastsale?: string; // "$196.31"
  pctchange?: string; // "-1.352%"
  volume?: string; // "34,552,588"
  marketCap?: string; // "4,750,702,000,000"
}

/** screener exchange 필터 → 우리 ExchangeMarket. AMEX 는 마스터에서 NYSE 로 접었으므로 NYSE. */
const EXCHANGE_MAP: Array<{ q: string; market: ExchangeMarket }> = [
  { q: "NASDAQ", market: "NASDAQ" },
  { q: "NYSE", market: "NYSE" },
  { q: "AMEX", market: "NYSE" },
];

function numFrom(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchExchange(exchange: string): Promise<NasdaqRow[]> {
  const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true&exchange=${exchange}&limit=10000`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`nasdaq screener ${exchange} → HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { rows?: NasdaqRow[]; table?: { rows?: NasdaqRow[] } } };
  return json.data?.rows ?? json.data?.table?.rows ?? [];
}

async function main(): Promise<void> {
  console.log(`[ingest:us:snapshot] storage=${storageMode()}`);
  const asof = new Date().toISOString().slice(0, 10);
  const store = createScreenStore();
  const byKey = new Map<string, DailyScreenRecord>();

  for (const { q, market } of EXCHANGE_MAP) {
    const rows = await fetchExchange(q);
    let kept = 0;
    for (const r of rows) {
      const code = (r.symbol ?? "").trim().toUpperCase();
      if (!code) continue;
      const last = numFrom(r.lastsale);
      const volume = numFrom(r.volume);
      // PREOPEN/미체결(거래량 0/null)이면 빈 세션 행으로 직전 정상 EOD 를 덮지 않도록 건너뜀.
      if (volume == null || volume <= 0) continue;
      const key = `${market}:${code}`;
      if (byKey.has(key)) continue; // 거래소 우선순위(앞선 매핑 우선)
      byKey.set(key, {
        market,
        code,
        asof,
        last,
        change_pct: numFrom(r.pctchange),
        volume,
        turnover: last != null && volume != null ? last * volume : null,
        rvol: null,
        high_52w: null,
        low_52w: null,
        rsi14: null,
        market_cap: numFrom(r.marketCap),
      });
      kept++;
    }
    console.log(`[ingest:us:snapshot] ${q}→${market}: ${rows.length}행 · 적재 ${kept}`);
  }

  const screen = [...byKey.values()];
  const CHUNK = 500;
  for (let i = 0; i < screen.length; i += CHUNK) {
    await store.saveDailyScreen(screen.slice(i, i + CHUNK));
    console.log(`[ingest:us:snapshot] screen ${Math.min(i + CHUNK, screen.length)}/${screen.length}`);
  }
  console.log(`[ingest:us:snapshot] done — US 전종목 당일 스냅샷 ${screen.length} 적재`);
}

main().catch((err) => {
  console.error("[ingest:us:snapshot] failed:", err);
  process.exitCode = 1;
});
