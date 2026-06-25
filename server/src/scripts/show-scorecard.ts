/**
 * Print the honest scorecard derived from the append-only track record.
 *
 * Usage: npm run scorecard                # as of today (UTC)
 *        npm run scorecard -- 2026-06-21  # as of a specific date
 *
 * Reads only — never writes. The numbers are recomputed from the immutable log
 * against current prices, so they are reproducible and never regenerated.
 */

import { getMarketRegistry } from "../market/index.js";
import { createTrackStore } from "../storage/index.js";
import { ScorecardService } from "../track/scorecard.js";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(v: number | null, suffix = ""): string {
  return v == null ? "—" : `${v}${suffix}`;
}

async function main() {
  const asOf = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? todayUtc();
  const store = createTrackStore();
  await store.hydrate(); // load from Supabase when configured (no-op for disk)
  const total = store.readAll().length;
  if (total === 0) {
    console.log("track record is empty — run `npm run batch:daily` first to log recommendations.");
    return;
  }

  const service = new ScorecardService(store, getMarketRegistry().require("US"));
  const sc = await service.compute(asOf);

  console.log(`\n=== 추천 성적표 (as of ${sc.asOf}) · 벤치마크 ${sc.benchmarkSymbol} ===`);
  console.log(`총 기록된 추천: ${sc.totalRecommendations}건\n`);
  for (const m of sc.periods) {
    console.log(`[${m.period}]  (${m.periodStart} ~ ${m.asOf}) · 추천 ${m.recommendations}건 / 평가 ${m.evaluated}건`);
    if (m.evaluated === 0) {
      console.log("  해당 기간 평가 가능한 추천이 없습니다.\n");
      continue;
    }
    console.log(`  벤치마크 대비 초과수익(헤드라인): ${fmt(m.excessReturnPct, "%p")}`);
    console.log(`  적중률: ${fmt(m.winRatePct, "%")} · 건당 평균: ${fmt(m.avgTradeReturnPct, "%")}`);
    console.log(`  포트폴리오 ${fmt(m.cumulativeReturnPct, "%")} vs ${m.benchmarkSymbol} ${fmt(m.benchmarkReturnPct, "%")} · MDD ${fmt(m.maxDrawdownPct, "%")}`);
    if (m.best) console.log(`  최고: ${m.best.symbol} (${m.best.date}) ${m.best.returnPct}%`);
    if (m.worst) console.log(`  최저: ${m.worst.symbol} (${m.worst.date}) ${m.worst.returnPct}%`);
    console.log();
  }
}

main().catch((err) => {
  console.error("scorecard failed:", err);
  process.exitCode = 1;
});
