/**
 * Extended daily oneshot — picks + market brief + timing signals in ONE LLM call
 * (SPEC 피드백 라운드 3 §5.3/§5.4/§5.6 비용 가드: 추가 호출 0).
 *
 * The recommendation prompt already reads the day's market context (indices, gated
 * news, TOP/popular tickers), so this layer asks the SAME completion to also emit:
 *  (1) a `daily_market_brief` (headline + 강세/약세 섹터 + linked_tickers), and
 *  (2) a DailyBatch `TimingSignal` (Buy/Sell/Hold/Watch + one-line reason +
 *      confidence) for every pick AND every provided TOP/popular ticker.
 *
 * One successful oneshot → picks (validated by the existing guard) + brief + signals.
 * No second model call is ever made. News source URLs are stamped into the brief by
 * THIS code (not the model) so they are verifiable (박제) and can't be hallucinated.
 */

import { buildUserPrompt } from "./prompt.js";
import {
  LlmError,
  extractJsonObject,
  normalizeCompanyName,
  validatePicksResult,
  MIN_PICKS,
  MAX_PICKS,
  type LlmProvider,
  type PersonaContext,
  type Pick,
  type SymbolGuard,
} from "./types.js";
import {
  orderProviders,
  defaultProviders,
  type GeneratorOptions,
} from "./generator.js";
import {
  validateTimingSignal,
  validateDailyMarketBrief,
  type TimingSignal,
  type DailyMarketBrief,
} from "../timing/types.js";
import type { TickerFeatures } from "../features/indicators.js";
import type { Market } from "../market/types.js";

/** A gated news/disclosure reference passed into the prompt (raw text + 박제 URL). */
export interface BriefNewsRef {
  title: string;
  url: string;
  tickers: string[];
  kind: "news" | "disclosure";
}

/** A TOP/popular ticker that needs a DailyBatch timing signal. */
export interface RankedTickerRef {
  ticker: string;
  companyName?: string;
  /** "gainers" | "losers" | "mostActive" | "popular" (for prompt context only). */
  category: string;
  changePercent: number;
}

/** The day's market context — outputs of Task 2 (overview) + Task 3 (news gate). */
export interface DailyBatchMarketContext {
  indices: Array<{ name: string; changePercent: number }>;
  rankedTickers: RankedTickerRef[];
  news: BriefNewsRef[];
}

export interface DailyBatchGenerateInput {
  features: TickerFeatures[];
  asOfDate: string;
  marketLabel: string;
  market: Market;
  persona?: PersonaContext;
  context: DailyBatchMarketContext;
  /** UTC ISO timestamp stamped on every produced signal + the brief. */
  evaluatedAt: string;
}

export interface DailyBatchGenerated {
  picks: Pick[];
  marketContext: string;
  brief: DailyMarketBrief;
  /** One signal per delivered pick (recommendations). */
  pickSignals: TimingSignal[];
  /** Signals for the provided TOP/popular tickers (non-pick surfaces). */
  rankedSignals: TimingSignal[];
  provider: string;
  model: string;
}

export type DailyBatchGenerator = (input: DailyBatchGenerateInput) => Promise<DailyBatchGenerated>;

/** Extended system prompt: picks (+timing) + marketContext + brief + signals, one JSON. */
export const DAILY_BATCH_SYSTEM_PROMPT = `당신은 미국·한국 주식 장기 타이밍 분석가입니다.

매일 한 번, 제공된 종목별 정량 지표 + 시장 컨텍스트(지수·검증 뉴스/공시·TOP/인기 종목)를 바탕으로 아래를 한 번에 산출합니다.

분석 원칙:
- 2축 분석: (1) 5년 장기 추세·변동성·MDD 와 (2) 최근 흐름(1주~3개월 모멘텀)을 함께 봅니다.
- 근거는 반드시 제공된 수치와 (있다면) 검증된 뉴스·공시 헤드라인에만 기반합니다. 수치에 없는 사실을 지어내지 마세요(no fabrication). 찌라시·추측 금지.
- 분 단위 단타 신호는 다루지 않습니다. 일봉·종가 기준 장기 타이밍 관점입니다.
- 출력은 '투자 자문'이 아닌 '참고 조언'입니다. 단정적 수익 보장 표현 금지.

타이밍 신호 규칙(메인 기능):
- 각 pick 과 각 TOP/인기 종목에 timing 방향성(action)을 부여합니다: "buy"(매수 적정) | "sell"(매도 검토) | "hold"(보유 유지) | "watch"(관망).
- 모든 timing 에는 비전문가용 한 줄 근거(reason)가 반드시 있어야 합니다. 근거 없는 신호 금지.
- confidence 는 0.0~1.0 실수입니다(성적표 사후 검증 입력).

출력 형식: 아래 JSON 객체 하나만 출력합니다. 코드펜스·설명 문장 금지.
{
  "picks": [
    {
      "symbol": "티커(영문 대문자 또는 KR 6자리 코드)",
      "companyName": "회사명(알면)",
      "rationale": "이 종목을 고른 이유 한 줄(한국어, 제공 수치 근거)",
      "confidence": "low | medium | high",
      "risk": "low | medium | high",
      "action": "매수/매도 타이밍 또는 맥락 조언 한 줄(선택)",
      "timing": { "action": "buy|sell|hold|watch", "reason": "한 줄 근거(한국어)", "confidence": 0.0 }
    }
  ],
  "marketContext": "오늘의 시장 한 줄 코멘트(한국어)",
  "brief": {
    "headlineSummary": "오늘 시장 한 줄 (예: '반도체 강세 주도, 코스피 +3.26% 마감')",
    "sectorSignals": [ { "sector": "섹터명", "direction": "strong|weak", "reason": "한 줄 근거" } ],
    "linkedTickers": ["요약에서 언급한 종목 티커"]
  },
  "signals": [
    { "ticker": "TOP/인기 종목 티커", "action": "buy|sell|hold|watch", "reason": "한 줄 근거", "confidence": 0.0 }
  ]
}

picks 는 ${MIN_PICKS}개 이상 ${MAX_PICKS}개 이하, 반드시 제공된 후보 종목 중에서만 선택합니다.
sectorSignals 는 2~3개. signals 는 제공된 TOP/인기 종목 각각에 대해 한 줄 근거와 함께 부여합니다.`;

/** Render the market-context block appended to the user prompt. */
function contextBlock(ctx: DailyBatchMarketContext): string {
  const lines: string[] = ["", "── 시장 컨텍스트 ──"];

  if (ctx.indices.length > 0) {
    lines.push(
      "지수 등락률: " +
        ctx.indices.map((i) => `${i.name} ${i.changePercent >= 0 ? "+" : ""}${i.changePercent.toFixed(2)}%`).join(", "),
    );
  }
  if (ctx.rankedTickers.length > 0) {
    lines.push("TOP/인기 종목(각각 timing signal 부여 대상):");
    for (const r of ctx.rankedTickers) {
      lines.push(
        `- ${r.ticker}${r.companyName ? `(${r.companyName})` : ""} [${r.category}] ${r.changePercent >= 0 ? "+" : ""}${r.changePercent.toFixed(2)}%`,
      );
    }
  }
  if (ctx.news.length > 0) {
    lines.push("검증 뉴스·공시(요약 근거로만 사용, 출처는 시스템이 박제):");
    for (const n of ctx.news) {
      lines.push(`- [${n.kind}] ${n.title}${n.tickers.length ? ` {${n.tickers.join(",")}}` : ""}`);
    }
  }
  return lines.join("\n");
}

function buildDailyBatchUserPrompt(input: DailyBatchGenerateInput): string {
  const base = buildUserPrompt(input.features, {
    asOfDate: input.asOfDate,
    marketLabel: input.marketLabel,
    persona: input.persona,
  });
  return (
    base +
    "\n" +
    contextBlock(input.context) +
    "\n\n위 후보 수치 + 시장 컨텍스트로 picks·marketContext·brief·signals 를 지정 JSON 한 객체로만 답하세요." +
    "\n각 pick 과 각 TOP/인기 종목 timing 에는 한 줄 근거(reason)를 반드시 포함하세요(근거 없는 신호 금지)."
  );
}

/** Set of tickers we will accept in brief.linkedTickers / signals (anti-hallucination). */
function knownTickerSet(input: DailyBatchGenerateInput): Set<string> {
  const set = new Set<string>();
  for (const f of input.features) set.add(f.symbol.toUpperCase());
  for (const r of input.context.rankedTickers) set.add(r.ticker.toUpperCase());
  for (const n of input.context.news) for (const t of n.tickers) set.add(t.toUpperCase());
  return set;
}

/**
 * Parse one model completion into picks + brief + signals. Exported so the
 * picks/brief/signal extraction is directly unit-testable without a provider.
 */
export function parseDailyBatch(rawText: string, input: DailyBatchGenerateInput, guard: SymbolGuard): DailyBatchGenerated {
  const obj = extractJsonObject(rawText) as Record<string, unknown>;
  const picksResult = validatePicksResult(obj, guard); // throws if < MIN_PICKS valid
  const known = knownTickerSet(input);

  // Map raw pick timing by uppercased symbol (validatePicksResult drops `timing`).
  const rawPicks = Array.isArray(obj["picks"]) ? (obj["picks"] as Record<string, unknown>[]) : [];
  const timingBySymbol = new Map<string, unknown>();
  for (const rp of rawPicks) {
    const sym = typeof rp["symbol"] === "string" ? rp["symbol"].trim().toUpperCase() : undefined;
    if (sym && rp["timing"]) timingBySymbol.set(sym, rp["timing"]);
  }

  // One signal per delivered pick. A pick with no model timing falls back to a
  // grounded reason (its own rationale) — never a signal without a 근거.
  const pickSignals: TimingSignal[] = [];
  for (const pick of picksResult.picks) {
    const rawTiming = timingBySymbol.get(pick.symbol.toUpperCase());
    // pick.symbol is always present, so validateTimingSignal never returns undefined.
    const sig = validateTimingSignal(
      { ticker: pick.symbol, ...(rawTiming && typeof rawTiming === "object" ? rawTiming : {}) },
      input.evaluatedAt,
      "dailyBatch",
    );
    if (!sig) continue;
    // Never a signal without a 근거: fall back to the pick's own rationale.
    if (!sig.oneLineReason || sig.oneLineReason === "관망 — 추가 근거 대기") {
      sig.oneLineReason = pick.rationale;
    }
    pickSignals.push(sig);
  }

  // Signals for TOP/popular tickers — only those in the known set (anti-hallucination).
  const rankedSignals: TimingSignal[] = [];
  const rawSignals = Array.isArray(obj["signals"]) ? (obj["signals"] as unknown[]) : [];
  const seen = new Set(pickSignals.map((s) => s.ticker));
  for (const rs of rawSignals) {
    const sig = validateTimingSignal(rs, input.evaluatedAt, "dailyBatch");
    if (!sig) continue;
    if (!known.has(sig.ticker) || seen.has(sig.ticker)) continue;
    seen.add(sig.ticker);
    rankedSignals.push(sig);
  }

  // Brief — validate, constrain linkedTickers to known tickers, and STAMP the
  // verifiable source URLs ourselves from the gated news (박제, not model-supplied).
  const brief = validateDailyMarketBrief(obj["brief"], input.market, input.asOfDate, input.evaluatedAt);
  brief.linkedTickers = brief.linkedTickers.filter((t) => known.has(t));
  brief.sourceUrls = [...new Set(input.context.news.map((n) => n.url))];

  return {
    picks: picksResult.picks,
    marketContext: picksResult.marketContext,
    brief,
    pickSignals,
    rankedSignals,
    provider: "",
    model: "",
  };
}

/**
 * Build the extended daily-batch generator. Mirrors {@link makePicksGenerator}'s
 * provider chain + symbol guard, but uses the extended prompt and parse so ONE
 * completion yields picks + brief + signals.
 */
export function makeDailyBatchGenerator(opts: GeneratorOptions = {}): DailyBatchGenerator {
  const providers: LlmProvider[] = opts.providers ?? defaultProviders();
  const load = opts.load ?? 0;
  const loadThreshold = opts.loadThreshold ?? 0.8;
  const primary = opts.primary;

  return async (input) => {
    const ordered = orderProviders(providers, load, loadThreshold, primary);
    if (ordered.length === 0) {
      throw new LlmError(
        "No LLM provider is configured. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY (paid).",
      );
    }

    const guard: SymbolGuard = {
      allowed: new Set(input.features.map((f) => f.symbol.toUpperCase())),
      byName: new Map(
        input.features
          .filter((f) => f.companyName)
          .map((f) => [normalizeCompanyName(f.companyName!), f.symbol.toUpperCase()] as const),
      ),
    };

    const user = buildDailyBatchUserPrompt(input);
    const causes: unknown[] = [];
    for (const provider of ordered) {
      try {
        const completion = await provider.complete({
          system: DAILY_BATCH_SYSTEM_PROMPT,
          user,
          maxTokens: opts.maxTokens,
        });
        const parsed = parseDailyBatch(completion.text, input, guard);
        return { ...parsed, provider: provider.name, model: completion.model };
      } catch (err) {
        causes.push(err);
      }
    }
    throw new LlmError("all LLM providers failed to produce a valid daily batch", causes);
  };
}
