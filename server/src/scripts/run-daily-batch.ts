/**
 * Entry point for the once-a-day batch (cron/scheduler calls this).
 *
 * Usage: npm run batch:daily            # today (UTC), US market
 *        npm run batch:daily -- 2026-06-21 --force
 *        npm run batch:daily -- --market KR   # Korea (KOSPI/KOSDAQ); MARKET=KR env also works
 *
 * Requires at least one provider key. For a FREE setup, set GEMINI_API_KEY and
 * PICKS_PRIMARY=gemini. For quality, set ANTHROPIC_API_KEY (Sonnet 4.6, paid),
 * optionally with GEMINI_API_KEY as failover. With neither set, the run aborts
 * with a clear message rather than producing fabricated picks.
 */

import { runDailyBatch } from "../pipeline/dailyBatch.js";
import { resolveUsUniverse, US_UNIVERSE_NAMES } from "../config/universe.js";
import {
  resolveKrUniverse,
  KR_UNIVERSE_NAMES,
  KR_BENCHMARK_SYMBOL,
} from "../config/krUniverse.js";
import { LlmError } from "../llm/types.js";
import { makePicksGenerator } from "../llm/generator.js";
import { getMarketRegistry, KrMarketAdapter } from "../market/index.js";
import type { Market, MarketSourceAdapter } from "../market/index.js";
import { makeArtifactRecorder } from "../track/recorder.js";
import { createArtifactStore, createTrackStore, storageMode } from "../storage/index.js";

/**
 * Parse SERVER_LOAD (0..1) defensively: a non-numeric or out-of-range value (e.g.
 * SERVER_LOAD=high) must NOT silently disable the load-based provider policy.
 * NaN comparisons are always false, which would otherwise pin every run to
 * Anthropic and make the cost-shedding Gemini fallback unreachable. Fall back to 0
 * (Anthropic-first) on garbage, and clamp to [0,1].
 */
function parseServerLoad(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    if (raw != null && raw.trim() !== "") {
      console.warn(`[daily-batch] SERVER_LOAD="${raw}" is not a number; defaulting to 0.`);
    }
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}

/** Per-market wiring for the batch: adapter, candidate universe, names, label, benchmark. */
interface MarketConfig {
  adapter: MarketSourceAdapter;
  universe: string[];
  companyNames: Record<string, string>;
  marketLabel: string;
  /** Benchmark proxy for backtest/track-record excess returns (US: SPY default). */
  benchmarkSymbol?: string;
}

function resolveMarketConfig(market: Market): MarketConfig {
  const registry = getMarketRegistry();
  if (market === "KR") {
    // KR is intentionally absent from the default registry until used (SPEC
    // §우선순위 fast-follow); register the adapter here so it gets the shared cache.
    if (!registry.get("KR")) registry.register(new KrMarketAdapter());
    return {
      adapter: registry.require("KR"),
      universe: resolveKrUniverse(),
      companyNames: KR_UNIVERSE_NAMES,
      marketLabel: "한국(코스피/코스닥)",
      benchmarkSymbol: KR_BENCHMARK_SYMBOL,
    };
  }
  return {
    adapter: registry.require("US"),
    universe: resolveUsUniverse(),
    companyNames: US_UNIVERSE_NAMES,
    marketLabel: "미국(나스닥/S&P)",
  };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const date = dateArg ?? todayUtc();

  // Target market: --market KR|US (or MARKET env). Defaults to US (SPEC §우선순위:
  // launch US-first, Korea as the fast-follow once its free-data path is verified).
  const flagIdx = args.indexOf("--market");
  const marketArg =
    args.find((a) => /^--market=/i.test(a))?.split("=")[1] ??
    (flagIdx >= 0 ? args[flagIdx + 1] : undefined);
  const marketRaw = (marketArg ?? process.env["MARKET"] ?? "US").toUpperCase();
  const market: Market = marketRaw === "KR" ? "KR" : "US";

  // Server load 0..1 for the Anthropic↔Gemini selection policy (SPEC §3.2).
  const load = parseServerLoad(process.env["SERVER_LOAD"]);

  const cfg = resolveMarketConfig(market);

  console.log(`[daily-batch] market=${market} date=${date} force=${force} load=${load}`);
  console.log(`[daily-batch] universe (${cfg.universe.length}): ${cfg.universe.join(", ")}`);

  // Wire the parsed load into the generator so the cost-shedding policy actually
  // takes effect (without this, the load value was computed but never applied).
  // PICKS_PRIMARY=gemini forces the free-tier provider first (one call/day stays
  // within Gemini's free quota); Claude, if its key is set, remains a failover.
  const primaryRaw = (process.env["PICKS_PRIMARY"] ?? "").toLowerCase();
  const primary = primaryRaw === "gemini" ? "gemini" : primaryRaw === "anthropic" ? "anthropic" : undefined;
  if (primary) console.log(`[daily-batch] primary provider forced: ${primary}`);
  const generator = makePicksGenerator({ load, primary });

  // Storage: Supabase when configured (the deployed path), else disk (local).
  console.log(`[daily-batch] storage=${storageMode()}`);
  const artifactStore = createArtifactStore();
  const trackStore = createTrackStore();

  // Hydrate async (Supabase) stores so idempotency (skip-if-exists / dedupe) works
  // against already-persisted rows; a no-op for the disk backend.
  await artifactStore.hydrate(market, date);
  await trackStore.hydrate();

  // Append-only track-record recording (Task 4): log each delivered pick with its
  // frozen entry context so the honest scorecard can recompute returns later.
  const recorder = makeArtifactRecorder(trackStore, {
    adapter: cfg.adapter,
    loggedAt: new Date().toISOString(),
    benchmarkSymbol: cfg.benchmarkSymbol,
  });

  const artifact = await runDailyBatch({
    market,
    date,
    universe: cfg.universe,
    companyNames: cfg.companyNames,
    marketLabel: cfg.marketLabel,
    benchmarkSymbol: cfg.benchmarkSymbol,
    force,
    adapter: cfg.adapter,
    generator,
    store: artifactStore,
    recorder,
    generatedAt: new Date().toISOString(),
  });

  // Await queued async writes before this short-lived process exits (Supabase);
  // a no-op for disk where writes are synchronous.
  await artifactStore.flush();
  await trackStore.flush();

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
