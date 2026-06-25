/**
 * US 전종목 마스터 ingest (SPEC §3.3-Δ step 1 — security_master 의 *전 상장종목* 소스).
 *
 * 무료 공개 소스: Nasdaq Trader Symbol Directory (파이프 구분 텍스트).
 *   - nasdaqlisted.txt : 나스닥 상장 (→ market=NASDAQ)
 *   - otherlisted.txt  : NYSE/AMEX/ARCA 등 (→ market=NYSE, 검색 US 그룹에 노출)
 *
 * 기존 12종목 하드코딩 유니버스(`config/universe.ts`)를 대체하는 *진짜* 검색 인덱스다.
 * daily_screen(시세/지표)는 별도 배치가 채우며, 마스터만으로도 코드리스 한글/영문 검색이
 * 전 종목으로 확장된다(가격·스파크라인은 daily_screen 적재 후 따라붙음).
 *
 * Usage: npm run ingest:master:us
 */

import { createScreenStore, storageMode } from "../storage/index.js";
import type { ExchangeMarket, SecurityMasterRecord } from "../screener/types.js";

const NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

async function fetchPsv(url: string): Promise<string[][]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("File Creation Time"))
    .map((l) => l.split("|"));
}

/** ETF 컬럼('Y'/'N') → boolean. */
function isEtf(v: string | undefined): boolean {
  return (v ?? "").trim().toUpperCase() === "Y";
}

function parseNasdaq(rows: string[][]): SecurityMasterRecord[] {
  // Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot|ETF|NextShares
  const out: SecurityMasterRecord[] = [];
  for (const r of rows.slice(1)) {
    const [symbol, name, , testIssue, , , etf] = r;
    if (!symbol || testIssue === "Y") continue;
    out.push({
      market: "NASDAQ",
      code: symbol.trim().toUpperCase(),
      name_ko: null,
      name_en: name?.trim() || null,
      is_etf: isEtf(etf),
      delisted: false,
    });
  }
  return out;
}

function parseOther(rows: string[][]): SecurityMasterRecord[] {
  // ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot|Test Issue|NASDAQ Symbol
  const out: SecurityMasterRecord[] = [];
  for (const r of rows.slice(1)) {
    const [actSymbol, name, , , etf, , testIssue] = r;
    if (!actSymbol || testIssue === "Y") continue;
    // ExchangeMarket 은 NASDAQ|NYSE 만 — NYSE/AMEX/ARCA 전부 NYSE 로 접어 US 그룹 검색에 노출.
    const market: ExchangeMarket = "NYSE";
    out.push({
      market,
      code: actSymbol.trim().toUpperCase(),
      name_ko: null,
      name_en: name?.trim() || null,
      is_etf: isEtf(etf),
      delisted: false,
    });
  }
  return out;
}

/** (market,code) 중복 제거 — 동일 키는 마지막 행 유지. */
function dedupe(records: SecurityMasterRecord[]): SecurityMasterRecord[] {
  const byKey = new Map<string, SecurityMasterRecord>();
  for (const r of records) byKey.set(`${r.market}:${r.code}`, r);
  return [...byKey.values()];
}

async function main(): Promise<void> {
  console.log(`[ingest:master:us] storage=${storageMode()}`);
  const [nq, ot] = await Promise.all([fetchPsv(NASDAQ_URL), fetchPsv(OTHER_URL)]);
  const records = dedupe([...parseNasdaq(nq), ...parseOther(ot)]);
  const nasdaq = records.filter((r) => r.market === "NASDAQ").length;
  console.log(`[ingest:master:us] parsed ${records.length} (NASDAQ ${nasdaq} · NYSE ${records.length - nasdaq})`);

  const store = createScreenStore();
  const CHUNK = 1000;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await store.saveMaster(chunk);
    console.log(`[ingest:master:us] upserted ${Math.min(i + CHUNK, records.length)}/${records.length}`);
  }
  console.log(`[ingest:master:us] done — security_master 전종목 적재 완료`);
}

main().catch((err) => {
  console.error("[ingest:master:us] failed:", err);
  process.exitCode = 1;
});
