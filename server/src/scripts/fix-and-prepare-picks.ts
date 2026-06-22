/**
 * Run the symbol guard over an already-stored picks artifact and rewrite it with
 * corrected symbols. Deterministic (no LLM call) — proves the guard recovers a
 * glitched/placeholder symbol (e.g. "AVAPL_PLACEHOLDER" → "AAPL") on real data,
 * and produces the clean artifact that gets hosted for the app.
 *
 *   tsx src/scripts/fix-and-prepare-picks.ts [path-to-artifact.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { validatePicksResult, normalizeCompanyName, type SymbolGuard } from "../llm/types.js";
import { US_UNIVERSE_NAMES } from "../config/universe.js";

const path = process.argv[2] ?? "./.bindesk/artifacts/us-2026-06-22.json";
const artifact = JSON.parse(readFileSync(path, "utf8")) as {
  universe: string[];
  picks: Array<{ symbol: string; companyName?: string }>;
  marketContext: string;
};

const guard: SymbolGuard = {
  allowed: new Set((artifact.universe ?? []).map((s) => s.toUpperCase())),
  byName: new Map(
    Object.entries(US_UNIVERSE_NAMES).map(([sym, name]) => [normalizeCompanyName(name), sym]),
  ),
};

const before = artifact.picks.map((p) => p.symbol);
const fixed = validatePicksResult({ picks: artifact.picks, marketContext: artifact.marketContext }, guard);
const after = fixed.picks.map((p) => p.symbol);

const out = { ...artifact, picks: fixed.picks };
writeFileSync(path, JSON.stringify(out, null, 2));

console.log("[fix-picks] before:", before.join(", "));
console.log("[fix-picks] after :", after.join(", "));
const changed = before.filter((s, i) => s !== after[i]);
console.log(changed.length ? `[fix-picks] 교정됨: ${changed.join(", ")} → 화이트리스트 복구` : "[fix-picks] 변경 없음");
