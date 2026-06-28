/**
 * 이력 지표 백필 — RVOL/RSI14/52주 고저를 거래대금 상위 N 종목에 채운다.
 *
 * 스냅샷 ingest(네이버/Nasdaq)는 last/등락률/거래량/거래대금/시총은 주지만 *이력 기반*
 * 지표(RVOL=거래량/20일평균, RSI14, 52주 고저)는 못 준다 → 거래폭발·돌파·과매도 카테고리가
 * 비어 있었다. 이 백필이 종목별 일봉(어댑터=Yahoo)을 받아 그 지표만 계산해 daily_screen 의
 * 해당 행을 PATCH 한다(last/거래대금/시총 등 스냅샷 값은 건드리지 않음).
 *
 * 전종목(1.7만)은 비현실적이라 **거래대금 상위 N(시장별)** 만 — 발굴에 의미 있는 유동 종목.
 * 계산은 기존 computeScreenedSymbol 재사용(스크리너와 동일 로직). 이후 발굴 재실행하면
 * 거래폭발/돌파/과매도가 채워진다.
 *
 * Usage: npm run backfill:history -- --market US --limit 300
 *        npm run backfill:history -- --market ALL --limit 400
 */

import { getMarketRegistry, KrMarketAdapter } from "../market/index.js";
import type { Market, MarketSourceAdapter } from "../market/index.js";
import { computeScreenedSymbol } from "../screener/screenMetrics.js";
import { marketsInGroup, type ExchangeMarket, type MarketGroup } from "../screener/types.js";
import { readSupabaseConfig, selectRows, type SupabaseConfig } from "../storage/supabaseRest.js";

interface ViewRow {
  market: ExchangeMarket;
  code: string;
  asof: string;
}

const CONCURRENCY = 6;

function resolveAdapter(group: MarketGroup): MarketSourceAdapter {
  const registry = getMarketRegistry();
  const m: Market = group === "KR" ? "KR" : "US";
  if (m === "KR" && !registry.get("KR")) registry.register(new KrMarketAdapter());
  return registry.require(m);
}

/** 거래대금 상위 N 행(시장 그룹별, 최신 스냅샷) — 백필 대상. */
async function topByTurnover(cfg: SupabaseConfig, group: MarketGroup, limit: number): Promise<ViewRow[]> {
  const markets = marketsInGroup(group).join(",");
  const q = [
    "select=market,code,asof",
    `market=in.(${markets})`,
    "turnover=not.is.null",
    "asof=not.is.null",
    "delisted=eq.0",
    "order=turnover.desc.nullslast",
    `limit=${limit}`,
  ].join("&");
  return selectRows<ViewRow>(cfg, "security_search_v", q);
}

/** daily_screen 의 (market,code,asof) 행에 이력 지표 4개만 PATCH(부분 갱신). */
async function patchMetrics(
  cfg: SupabaseConfig,
  row: ViewRow,
  m: { rvol: number | null; rsi14: number | null; high_52w: number | null; low_52w: number | null },
): Promise<void> {
  const enc = encodeURIComponent;
  const q = `market=eq.${enc(row.market)}&code=eq.${enc(row.code)}&asof=eq.${enc(row.asof)}`;
  const res = await fetch(`${cfg.url}/rest/v1/daily_screen?${q}`, {
    method: "PATCH",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ rvol: m.rvol, rsi14: m.rsi14, high_52w: m.high_52w, low_52w: m.low_52w }),
  });
  if (!res.ok) throw new Error(`patch ${row.code} → HTTP ${res.status}`);
}

/** 한 종목: 일봉 받아 지표 계산 → PATCH. 실패는 false(건너뜀, 전체 막지 않음). */
async function backfillOne(cfg: SupabaseConfig, adapter: MarketSourceAdapter, row: ViewRow): Promise<boolean> {
  try {
    const series = await adapter.getHistory(row.code, { years: 1 });
    if (series.candles.length < 15) return false; // RSI14/RVOL20 에 못 미치면 스킵
    const screened = computeScreenedSymbol(
      { master: { market: row.market, code: row.code, name_ko: null, name_en: null, is_etf: false, delisted: false }, series },
      row.asof,
    );
    const s = screened.screen;
    await patchMetrics(cfg, row, { rvol: s.rvol, rsi14: s.rsi14, high_52w: s.high_52w, low_52w: s.low_52w });
    return true;
  } catch {
    return false;
  }
}

/** 동시성 제한 풀 실행. */
async function runPool<T>(items: T[], worker: (t: T) => Promise<boolean>, onTick: (done: number) => void): Promise<number> {
  let idx = 0;
  let ok = 0;
  let done = 0;
  async function lane(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      if (await worker(items[i]!)) ok++;
      done++;
      if (done % 50 === 0) onTick(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => lane()));
  return ok;
}

async function backfillGroup(cfg: SupabaseConfig, group: MarketGroup, limit: number): Promise<void> {
  const adapter = resolveAdapter(group);
  const rows = await topByTurnover(cfg, group, limit);
  console.log(`[backfill:${group}] 대상 ${rows.length}종목(거래대금 상위) — 일봉 수집·지표 계산`);
  const ok = await runPool(
    rows,
    (r) => backfillOne(cfg, adapter, r),
    (done) => console.log(`[backfill:${group}] ${done}/${rows.length}`),
  );
  console.log(`[backfill:${group}] 완료 — ${ok}/${rows.length} 적재(RVOL/RSI14/52주)`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf("--market");
  const marketArg = (args.find((a) => /^--market=/i.test(a))?.split("=")[1] ?? (flagIdx >= 0 ? args[flagIdx + 1] : "US")) ?? "US";
  const group = (marketArg.toUpperCase() === "KR" ? "KR" : marketArg.toUpperCase() === "ALL" ? "ALL" : "US") as MarketGroup;
  const li = args.indexOf("--limit");
  const limitRaw = args.find((a) => /^--limit=/i.test(a))?.split("=")[1] ?? (li >= 0 ? args[li + 1] : undefined);
  const limit = Math.max(1, Math.min(2000, Number(limitRaw ?? 300) || 300));

  const cfg = readSupabaseConfig();
  if (!cfg) throw new Error("backfill 은 Supabase 설정(SUPABASE_URL/KEY)이 필요합니다.");

  const groups: MarketGroup[] = group === "ALL" ? ["US", "KR"] : [group];
  console.log(`[backfill] markets=${groups.join(",")} limit=${limit}/시장`);
  for (const g of groups) await backfillGroup(cfg, g, limit);
  console.log(`[backfill] done — 발굴 재실행(batch:screen --from-snapshot)하면 거래폭발/돌파/과매도가 채워짐`);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exitCode = 1;
});
