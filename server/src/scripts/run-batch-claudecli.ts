/**
 * 키 없는 일일 배치 (US/KR · Supabase) — ANTHROPIC/GEMINI 키 대신 BinDesk 의
 * Claude(OAuth, claude.exe)를 LlmProvider 로 주입해 오늘의 추천을 생성·저장한다.
 *
 * 무료 Gemini 키가 free-tier limit:0 (소진 ✗ 미할당) 이라 batch:daily 가 막힐 때의
 * 대체 경로. run-batch-bindesk 의 ClaudeCliProvider 를 멀티마켓 + Supabase 스토어로
 * 확장했다(run-daily-batch 와 동일한 시장 와이어링·track-record recorder 사용).
 *
 * Usage: npm run batch:cli -- --market US
 *        npm run batch:cli -- --market KR 2026-06-24 --force
 */

import { spawn } from "node:child_process";
import { runDailyBatch } from "../pipeline/dailyBatch.js";
import { makePicksGenerator } from "../llm/generator.js";
import type { LlmProvider, LlmRequest, LlmCompletion } from "../llm/types.js";
import { LlmError } from "../llm/types.js";
import { resolveUsUniverse, US_UNIVERSE_NAMES } from "../config/universe.js";
import {
  resolveKrUniverse,
  KR_UNIVERSE_NAMES,
  KR_BENCHMARK_SYMBOL,
} from "../config/krUniverse.js";
import { getMarketRegistry, KrMarketAdapter } from "../market/index.js";
import type { Market, MarketSourceAdapter } from "../market/index.js";
import { makeArtifactRecorder } from "../track/recorder.js";
import { createArtifactStore, createTrackStore, storageMode } from "../storage/index.js";

const CLAUDE_EXE =
  "C:\\Users\\seo\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";

/** BinDesk 의 Claude(OAuth) 를 통한 키 없는 LLM provider. */
class ClaudeCliProvider implements LlmProvider {
  readonly name = "claude-cli";
  isAvailable(): boolean {
    return true;
  }
  complete(req: LlmRequest): Promise<LlmCompletion> {
    return new Promise((resolve, reject) => {
      const child = spawn(CLAUDE_EXE, ["-p", "--tools", "", "--output-format", "text"], {
        windowsHide: true,
      });
      let out = "";
      let err = "";
      const killer = setTimeout(() => {
        child.kill();
        reject(new Error("claude timeout (300s)"));
      }, 300000);
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(killer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(killer);
        if (code === 0 && out.trim()) resolve({ text: out, model: "claude-bindesk-oauth" });
        else reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 500)}`));
      });
      child.stdin.write(`${req.system}\n\n${req.user}`);
      child.stdin.end();
    });
  }
}

interface MarketConfig {
  adapter: MarketSourceAdapter;
  universe: string[];
  companyNames: Record<string, string>;
  marketLabel: string;
  benchmarkSymbol?: string;
}

function resolveMarketConfig(market: Market): MarketConfig {
  const registry = getMarketRegistry();
  if (market === "KR") {
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? todayUtc();
  const flagIdx = args.indexOf("--market");
  const marketArg =
    args.find((a) => /^--market=/i.test(a))?.split("=")[1] ??
    (flagIdx >= 0 ? args[flagIdx + 1] : undefined);
  const market: Market = (marketArg ?? process.env["MARKET"] ?? "US").toUpperCase() === "KR" ? "KR" : "US";

  const cfg = resolveMarketConfig(market);
  console.log(`[cli-batch] market=${market} date=${date} force=${force} storage=${storageMode()}`);
  console.log(`[cli-batch] universe (${cfg.universe.length}): ${cfg.universe.join(", ")}`);

  const generator = makePicksGenerator({ providers: [new ClaudeCliProvider()] });

  const artifactStore = createArtifactStore();
  const trackStore = createTrackStore();
  await artifactStore.hydrate(market, date);
  await trackStore.hydrate();

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
    backtester: null, // 키-없는 picks 생성에 집중; 느린 5년 백테스트는 batch:daily 에서.
    generatedAt: new Date().toISOString(),
  });

  await artifactStore.flush();
  await trackStore.flush();

  console.log(`\n=== ${market} 추천 (${artifact.date}) · ${artifact.provider}/${artifact.model} ===`);
  for (const p of artifact.picks) {
    console.log(`• ${p.symbol}${p.companyName ? ` (${p.companyName})` : ""} [신뢰:${p.confidence}·리스크:${p.risk}] ${p.rationale}`);
  }
}

main().catch((err) => {
  if (err instanceof LlmError) {
    console.error(`[cli-batch] LLM error: ${err.message}`);
    for (const c of err.causes) console.error("  cause:", c instanceof Error ? c.message : c);
  } else {
    console.error("[cli-batch] failed:", err);
  }
  process.exitCode = 1;
});
