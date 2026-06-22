/**
 * 키 없는 일일 배치 — ANTHROPIC_API_KEY 대신 BinDesk 의 Claude(OAuth, claude.exe)를
 * LlmProvider 로 주입해 오늘의 추천을 생성한다. 2탄(서버 자동화)의 OAuth↔API키 불일치
 * 해소 증명. 시세는 무료 소스(Stooq/Yahoo). 산출물은 기본 disk store 에 저장 → API 가 그대로 서빙.
 */
import { spawn } from "node:child_process";
import { runDailyBatch } from "../pipeline/dailyBatch.js";
import { makePicksGenerator } from "../llm/generator.js";
import { resolveUsUniverse } from "../config/universe.js";
import { getMarketRegistry } from "../market/index.js";
import type { LlmProvider, LlmRequest, LlmCompletion } from "../llm/types.js";

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

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const universe = resolveUsUniverse();
  const adapter = getMarketRegistry().require("US");
  const generator = makePicksGenerator({ providers: [new ClaudeCliProvider()] });
  console.log(`[bindesk-batch] 키 없는 picks 생성 (BinDesk Claude) date=${date} universe=${universe.join(",")}`);
  const artifact = await runDailyBatch({
    market: "US",
    date,
    universe,
    adapter,
    generator,
    backtester: null, // 증명 단계 — 5년 백테스트(느린 네트워크) skip, picks 자체 검증에 집중.
    generatedAt: new Date().toISOString(),
  });
  console.log("\n=== 생성된 추천 아티팩트 ===");
  console.log(JSON.stringify(artifact, null, 2));
  console.log(`\n[ok] ${artifact.picks.length}개 추천 생성 · provider=${artifact.provider}`);
}

main().catch((e) => {
  console.error("[FAIL]", e instanceof Error ? e.message : e);
  process.exit(1);
});
