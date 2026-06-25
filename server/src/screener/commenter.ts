/**
 * 후보 풀 LLM 코멘트 (SPEC §3.3-Δ2 step 6). 후보 *선정* 은 결정론적 스캔(step 5)이
 * 이미 끝냈고, 여기 LLM 은 후보 풀 전체에 대해 "왜 지금·무엇을(매수/매도/관망)" 한 줄
 * 신호 + 근거만 부여한다 — **호출 1회(oneshot)**, 후보당 호출 ✗ (비용 불변, §0-Δ).
 *
 * Sane default + override: LLM 제공자가 없거나 호출이 실패해도 파이프라인을 막지 않고,
 * 결정론 deriveSignal() 로 graceful 폴백한다(근거 없는 신호는 만들지 않음).
 */

import { extractJsonObject, LlmError, type LlmProvider } from "../llm/types.js";
import { orderProviders, defaultProviders } from "../llm/generator.js";
import { CATEGORY_LABELS, type ScreenCandidate } from "./categories.js";
import { deriveSignal } from "./signal.js";
import type { SecuritySignal } from "./types.js";

/** 후보 1건의 코멘트 입력(결정론 지표 + 카테고리). */
export interface CommentCandidate {
  key: string; // "market:code"
  market: string;
  code: string;
  name: string;
  category: string;
  last: number | null;
  change_pct: number | null;
  rvol: number | null;
  rsi14: number | null;
  high_52w: number | null;
}

/** code 키 → 한 줄 신호 맵을 만든다. */
export type ScreenCommenter = (input: {
  asOfDate: string;
  candidates: CommentCandidate[];
}) => Promise<Map<string, SecuritySignal>>;

const SYSTEM = [
  "당신은 한국 개인투자자를 돕는 베테랑 트레이더입니다.",
  "후보 종목은 이미 결정론적 시장 스캔으로 *선정* 되었습니다. 당신의 역할은 각 종목에",
  "'지금 무엇을(매수/매도/관망) 왜' 라는 **한 줄 신호 + 한 줄 근거** 만 부여하는 것입니다.",
  "근거 없는 신호는 만들지 마세요. 과장·보장 표현 금지(참고 조언).",
  '반드시 JSON 객체만 출력: {"items":[{"key":"MARKET:CODE","label":"...","reason":"..."}]}',
  "label 은 8자 내외 행동 신호(예: '매수 적정', '반등 주시', '단기 관망'), reason 은 20자 내외 근거.",
].join(" ");

function buildUser(asOfDate: string, candidates: CommentCandidate[]): string {
  const lines = candidates.map((c) => {
    const parts = [
      `key=${c.key}`,
      `name=${c.name}`,
      `cat=${CATEGORY_LABELS[c.category as keyof typeof CATEGORY_LABELS] ?? c.category}`,
      c.change_pct != null ? `등락=${c.change_pct}%` : "",
      c.rvol != null ? `RVOL=${c.rvol}` : "",
      c.rsi14 != null ? `RSI=${c.rsi14}` : "",
    ].filter(Boolean);
    return `- ${parts.join(" ")}`;
  });
  return [`기준일: ${asOfDate}`, "후보:", ...lines].join("\n");
}

/** 결정론 폴백: 지표에서 직접 신호 도출(없으면 카테고리 라벨을 관망 신호로). */
function fallbackSignals(candidates: CommentCandidate[]): Map<string, SecuritySignal> {
  const out = new Map<string, SecuritySignal>();
  for (const c of candidates) {
    const sig = deriveSignal({
      last: c.last,
      change_pct: c.change_pct,
      rvol: c.rvol,
      rsi14: c.rsi14,
      high_52w: c.high_52w,
    });
    if (sig) out.set(c.key, sig);
  }
  return out;
}

interface CommentItem {
  key?: unknown;
  label?: unknown;
  reason?: unknown;
}

function parseItems(text: string, allowed: Set<string>): Map<string, SecuritySignal> {
  const obj = extractJsonObject(text) as { items?: unknown };
  const items = Array.isArray(obj.items) ? (obj.items as CommentItem[]) : [];
  const out = new Map<string, SecuritySignal>();
  for (const it of items) {
    const key = typeof it.key === "string" ? it.key.trim() : "";
    const label = typeof it.label === "string" ? it.label.trim() : "";
    const reason = typeof it.reason === "string" ? it.reason.trim() : "";
    if (key && label && reason && allowed.has(key)) out.set(key, { label, reason });
  }
  return out;
}

export interface CommenterOptions {
  providers?: LlmProvider[];
  load?: number;
  loadThreshold?: number;
  primary?: "anthropic" | "gemini";
  maxTokens?: number;
}

/**
 * 기본 코멘터: 제공자 체인을 한 번 호출해 JSON 신호를 파싱하고, LLM 이 빠뜨린 종목은
 * 결정론 폴백으로 채운다. 제공자가 전혀 없거나 모두 실패하면 전량 결정론 폴백.
 */
export function makeScreenCommenter(opts: CommenterOptions = {}): ScreenCommenter {
  const providers = opts.providers ?? defaultProviders();
  return async ({ asOfDate, candidates }) => {
    if (candidates.length === 0) return new Map();
    const fallback = fallbackSignals(candidates);
    const ordered = orderProviders(providers, opts.load ?? 0, opts.loadThreshold ?? 0.8, opts.primary);
    if (ordered.length === 0) return fallback; // LLM 없음 → 결정론만

    const allowed = new Set(candidates.map((c) => c.key));
    const causes: unknown[] = [];
    for (const provider of ordered) {
      try {
        const completion = await provider.complete({
          system: SYSTEM,
          user: buildUser(asOfDate, candidates),
          maxTokens: opts.maxTokens ?? 2048,
        });
        const llm = parseItems(completion.text, allowed);
        // LLM 결과를 우선, 누락분은 결정론 폴백으로 보강.
        const merged = new Map(fallback);
        for (const [k, v] of llm) merged.set(k, v);
        return merged;
      } catch (err) {
        causes.push(err);
      }
    }
    // 모든 제공자 실패 → 막지 않고 결정론 폴백 반환 (실패 원인은 던지지 않음).
    void new LlmError("screen commenter providers failed; using deterministic signals", causes);
    return fallback;
  };
}
