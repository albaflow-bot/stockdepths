/**
 * Shared types for the daily recommendation pipeline's LLM layer.
 *
 * Per SPEC §3.2 (PM): the server runs a SINGLE Claude Sonnet 4.6 oneshot per day
 * (Gemini fallback on load), amortized as one shared public artifact. Picks carry
 * a one-line rationale + confidence/risk badges; the 'AI는 보장이 아닌 참고 조언'
 * disclaimer is attached to every artifact.
 *
 * The model returns prompt-enforced JSON (not a provider-specific structured-output
 * API), so the Anthropic and Gemini providers share one parse/validate contract and
 * the code is robust to SDK-version drift in the structured-output surface.
 */

import type { BacktestResult } from "../backtest/types.js";

/** Badge level for confidence and risk. UI maps these to Korean labels. */
export type BadgeLevel = "low" | "medium" | "high";

const BADGE_LEVELS: readonly BadgeLevel[] = ["low", "medium", "high"];

/** A single recommended stock with its rationale and badges. */
export interface Pick {
  symbol: string;
  /** Company display name, if the model supplied one. */
  companyName?: string;
  /** One-line rationale in Korean (SPEC: "이유 한 줄"). */
  rationale: string;
  /** Confidence the long-term + recent analysis support this pick. */
  confidence: BadgeLevel;
  /** Volatility/risk badge — clients match this to the user's 성향. */
  risk: BadgeLevel;
  /** Optional one-line buy/sell timing or context advice. */
  action?: string;
  /**
   * Automatic 5-year backtest attached before delivery (Task 3). Populated by the
   * pipeline, never by the LLM — feeds the recommendation card's '5년 백테스트
   * 결과' panel and the honest scorecard.
   */
  backtest?: BacktestResult;
}

/** The model's full output: 3–5 picks plus a one-line market context. */
export interface PicksResult {
  picks: Pick[];
  /** One-line market context for the daily digest (Korean). */
  marketContext: string;
}

/** Investment persona context passed into the prompt (SPEC §3.2). */
export interface PersonaContext {
  /** Conservative / Neutral / Aggressive. */
  profile: "conservative" | "neutral" | "aggressive";
  targetReturnPct?: number;
  stopLossPct?: number;
}

/** Raised when every LLM provider in the fallback chain failed. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly causes: unknown[] = [],
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * A provider that completes a single prompt and returns raw text. The pipeline
 * extracts + validates JSON from that text, so providers stay simple and uniform.
 */
export interface LlmProvider {
  readonly name: string;
  /** True when the provider is configured (API key present). */
  isAvailable(): boolean;
  complete(req: LlmRequest): Promise<LlmCompletion>;
}

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LlmCompletion {
  /** Raw model text (expected to contain a JSON object). */
  text: string;
  /** The concrete model id that produced this (e.g. "claude-sonnet-4-6"). */
  model: string;
}

const MIN_PICKS = 3;
const MAX_PICKS = 5;

/**
 * Extract the first balanced top-level JSON object from model text. Tolerates
 * markdown code fences and surrounding prose. Throws if none is found.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new LlmError("no JSON object found in model output");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch (err) {
          throw new LlmError("model output was not valid JSON", [err]);
        }
      }
    }
  }
  throw new LlmError("model output had an unbalanced JSON object");
}

function coerceBadge(v: unknown): BadgeLevel {
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if ((BADGE_LEVELS as readonly string[]).includes(t)) return t as BadgeLevel;
    // tolerate common synonyms / Korean
    if (/high|높|공격/.test(t)) return "high";
    if (/low|낮|안정|보수/.test(t)) return "low";
  }
  return "medium";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Normalize a company name for fuzzy matching: lowercase, drop common corporate
 * suffixes/qualifiers, and strip every non-alphanumeric. "Apple Inc.", "apple",
 * and "Apple" all collapse to "apple"; "Meta Platforms" and "Meta" to "meta".
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|co|ltd|plc|holdings|company|class\s+[a-c]|platforms)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Whitelist of symbols permitted in a run's output (its universe), plus an optional
 * companyName→symbol map used to recover a glitched/placeholder symbol back to a
 * real ticker. Out-of-universe symbols that can't be recovered are dropped — a stock
 * app must never surface a fabricated ticker.
 */
export interface SymbolGuard {
  /** Uppercase symbols allowed in the output. */
  allowed: Set<string>;
  /** Normalized companyName → canonical uppercase symbol, for recovery. */
  byName?: Map<string, string>;
}

/**
 * Validate + normalize the parsed model output into a PicksResult. Drops malformed
 * picks, clamps to at most {@link MAX_PICKS}, and enforces badge enums. When a
 * {@link SymbolGuard} is supplied, picks whose symbol is outside the universe are
 * recovered by company name when possible, else dropped. Throws if fewer than
 * {@link MIN_PICKS} valid picks remain (the SPEC requires 3–5).
 */
export function validatePicksResult(obj: unknown, guard?: SymbolGuard): PicksResult {
  if (!obj || typeof obj !== "object") {
    throw new LlmError("model output was not an object");
  }
  const root = obj as Record<string, unknown>;
  const rawPicks = Array.isArray(root["picks"]) ? (root["picks"] as unknown[]) : [];

  const picks: Pick[] = [];
  for (const rp of rawPicks) {
    if (!rp || typeof rp !== "object") continue;
    const p = rp as Record<string, unknown>;
    let symbol = str(p["symbol"])?.toUpperCase();
    const rationale = str(p["rationale"]);
    const companyName = str(p["companyName"]);
    if (!symbol || !rationale) continue;
    if (guard && !guard.allowed.has(symbol)) {
      // Out-of-universe symbol (often a model glitch like "AVAPL_PLACEHOLDER").
      // Recover by company name if we can; otherwise drop — never surface a
      // fabricated ticker to a stock app.
      const recovered = companyName
        ? guard.byName?.get(normalizeCompanyName(companyName))
        : undefined;
      if (!recovered) continue;
      symbol = recovered;
    }
    picks.push({
      symbol,
      companyName,
      rationale,
      confidence: coerceBadge(p["confidence"]),
      risk: coerceBadge(p["risk"]),
      action: str(p["action"]),
    });
    if (picks.length >= MAX_PICKS) break;
  }

  if (picks.length < MIN_PICKS) {
    throw new LlmError(
      `model returned ${picks.length} valid picks; need at least ${MIN_PICKS}`,
    );
  }

  return {
    picks,
    marketContext: str(root["marketContext"]) ?? "오늘의 시장 코멘트가 제공되지 않았습니다.",
  };
}

export { MIN_PICKS, MAX_PICKS, BADGE_LEVELS };
