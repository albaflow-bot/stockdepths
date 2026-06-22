/**
 * Entry point for the once-a-day batch (cron/scheduler calls this).
 *
 * Usage: npm run batch:daily            # today (UTC), US market
 *        npm run batch:daily -- 2026-06-21 --force
 *
 * Requires ANTHROPIC_API_KEY (Sonnet 4.6 primary). GEMINI_API_KEY enables the
 * cost-scaling fallback. With neither set, the run aborts with a clear message
 * rather than producing fabricated picks.
 */

import { runDailyBatch } from "../pipeline/dailyBatch.js";
import { resolveUsUniverse } from "../config/universe.js";
import { LlmError } from "../llm/types.js";
import { getMarketRegistry } from "../market/index.js";
import { TrackRecordStore } from "../track/store.js";
import { makeArtifactRecorder } from "../track/recorder.js";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const date = dateArg ?? todayUtc();

  // Server load 0..1 for the Anthropic↔Gemini selection policy (SPEC §3.2).
  const load = Number(process.env["SERVER_LOAD"] ?? "0");

  console.log(`[daily-batch] market=US date=${date} force=${force} load=${load}`);
  const universe = resolveUsUniverse();
  console.log(`[daily-batch] universe (${universe.length}): ${universe.join(", ")}`);

  // Append-only track-record recording (Task 4): log each delivered pick with its
  // frozen entry context so the honest scorecard can recompute returns later.
  const adapter = getMarketRegistry().require("US");
  const trackStore = new TrackRecordStore();
  const recorder = makeArtifactRecorder(trackStore, {
    adapter,
    loggedAt: new Date().toISOString(),
  });

  const artifact = await runDailyBatch({
    market: "US",
    date,
    universe,
    force,
    adapter,
    recorder,
    generatedAt: new Date().toISOString(),
  });

  console.log(`\n=== 오늘의 추천 (${artifact.date}) · ${artifact.provider}/${artifact.model} ===`);
  console.log(`시장: ${artifact.marketContext}`);
  for (const p of artifact.picks) {
    const name = p.companyName ? ` (${p.companyName})` : "";
    console.log(`\n• ${p.symbol}${name}  [신뢰도:${p.confidence} · 리스크:${p.risk}]`);
    console.log(`  ${p.rationale}`);
    if (p.action) console.log(`  → ${p.action}`);
    if (p.backtest) {
      const b = p.backtest;
      console.log(
        `  📊 5년 백테스트(${b.strategy}): 초과수익 ${b.excessReturnPct}%p ` +
          `(전략 ${b.cumulativeReturnPct}% vs ${b.benchmarkSymbol} ${b.benchmarkReturnPct}%) · ` +
          `적중률 ${b.winRatePct ?? "-"}% · 건당 ${b.avgTradeReturnPct ?? "-"}% · MDD ${b.maxDrawdownPct}% · 거래 ${b.trades}회`,
      );
    }
  }
  console.log(`\n${artifact.disclaimer}`);
}

main().catch((err) => {
  if (err instanceof LlmError) {
    console.error(`[daily-batch] LLM error: ${err.message}`);
    for (const c of err.causes) console.error("  cause:", c instanceof Error ? c.message : c);
  } else {
    console.error("[daily-batch] failed:", err);
  }
  process.exitCode = 1;
});
