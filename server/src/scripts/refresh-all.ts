/**
 * 전체 데이터 파이프라인 1회 실행 (수동/로컬 운영용 — GitHub Actions 결제 미사용 경로).
 *
 * GitHub Actions(daily-batch.yml)가 결제 문제로 안 돌 때, 동일 순서를 로컬에서 한 명령으로:
 *   1) US 마스터  2) US 스냅샷  3) KR 전종목(마스터+스냅샷)
 *   4) US 발굴(스냅샷)  5) KR 발굴(스냅샷)
 *   6) US 픽(Gemini)  7) KR 픽(Gemini)
 *
 * ingest/발굴은 critical(실패 시 종료코드 1). 픽은 비critical(LLM 일시 503 등은 무시하고
 * 진행 — 기존 픽 유지). Supabase 설정(SUPABASE_URL/KEY) 필요. Gemini 픽엔 GEMINI_API_KEY.
 *
 * Usage: npm run refresh
 */

import { spawnSync } from "node:child_process";

interface Step {
  label: string;
  script: string;
  args: string[];
  env?: Record<string, string>;
  /** false 면 실패해도 종료코드에 영향 없음(픽 등 일시 장애 허용). */
  critical: boolean;
}

const STEPS: Step[] = [
  { label: "US 마스터", script: "ingest-master-us.ts", args: [], critical: true },
  { label: "US 스냅샷", script: "ingest-us-nasdaq.ts", args: [], critical: true },
  { label: "KR 전종목", script: "ingest-kr-naver.ts", args: [], critical: true },
  { label: "US 발굴", script: "run-screen-batch.ts", args: ["--market", "US", "--from-snapshot"], critical: true },
  { label: "KR 발굴", script: "run-screen-batch.ts", args: ["--market", "KR", "--from-snapshot"], critical: true },
  { label: "US 픽", script: "run-daily-batch.ts", args: ["--market", "US", "--force"], env: { PICKS_PRIMARY: "gemini" }, critical: false },
  { label: "KR 픽", script: "run-daily-batch.ts", args: ["--market", "KR", "--force"], env: { PICKS_PRIMARY: "gemini" }, critical: false },
];

// npm run 으로 실행 시 node_modules/.bin 이 PATH 에 있어 `tsx` 가 해석된다(Windows 는 tsx.cmd).
const TSX = process.platform === "win32" ? "tsx.cmd" : "tsx";

function main(): void {
  const results: Array<{ label: string; ok: boolean; critical: boolean; code: number | null }> = [];
  for (const s of STEPS) {
    console.log(`\n=== [${s.label}] ${s.script} ${s.args.join(" ")} ===`);
    const r = spawnSync(TSX, [`src/scripts/${s.script}`, ...s.args], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...(s.env ?? {}) },
    });
    const ok = r.status === 0;
    results.push({ label: s.label, ok, critical: s.critical, code: r.status });
    if (!ok) {
      const tag = s.critical ? "CRITICAL 실패" : "비critical 실패(무시)";
      console.error(`[refresh] ${tag}: ${s.label} (exit ${r.status})`);
    }
  }

  console.log("\n=== 요약 ===");
  for (const r of results) {
    const mark = r.ok ? "OK  " : r.critical ? "FAIL" : "WARN";
    console.log(`  ${mark} ${r.label}${!r.ok && !r.critical ? " (비critical)" : ""}`);
  }
  process.exitCode = results.some((r) => !r.ok && r.critical) ? 1 : 0;
}

main();
