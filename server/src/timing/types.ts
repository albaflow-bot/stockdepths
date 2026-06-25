/**
 * Timing-signal model + daily market brief (SPEC 피드백 라운드 3 §5.3–§5.4).
 *
 * This is the data foundation of the product's MAIN feature — 매수/매도 타이밍
 * (SPEC §5.0: "메인은 매수와 매도 타이밍을 알려주는 것"). Every stock surface
 * (오늘의 추천, TOP 종목, 관심·보유 탭) carries a `TimingSignal`; the daily batch
 * also emits one `DailyMarketBrief` per market+date for the 시장 브리핑 row.
 *
 * Wire contract: these shapes are mirrored 1:1 on the client in
 * `mobile/src/types/timing.ts`. Field names are camelCase to match the rest of the
 * codebase's JSON wire convention (DailyPicksArtifact, TrackRecordEntry, …), which
 * is the project's "serde↔TS 정합" boundary.
 *
 * Persistence: DailyBatch signals + the brief are written IMMUTABLY into the same
 * batch transaction as the append-only 추천 로그 (SPEC §5.6) — see
 * `server/supabase/schema.sql` (timing_signal, daily_market_brief). `confidence`
 * is NOT NULL so the §5 성적표 can later score hit-rate ("Buy 신호 후 실제 상승했나").
 */

import type { Market } from "../market/types.js";

/** 매수 / 매도 / 보유유지 / 관망 (SPEC §5.4 enum TimingAction). */
export type TimingAction = "buy" | "sell" | "hold" | "watch";

export const TIMING_ACTIONS: readonly TimingAction[] = ["buy", "sell", "hold", "watch"];

/**
 * Who produced the signal (SPEC §5.4 enum SignalSource).
 * - `dailyBatch`: 서버 하루 1회, 공용 — LLM 이 부여한 방향성 (장기×최근 2축).
 * - `onDeviceRule`: 단말 실시간, 개인 — 목표가/손절선 도달 등 결정론적 평가 (LLM 0).
 *
 * Conflict rule (SPEC §5.4): when both fire for one ticker, the on-device personal
 * rule wins on screen — the UI shows both but ranks the personal rule on top.
 */
export type SignalSource = "dailyBatch" | "onDeviceRule";

export const SIGNAL_SOURCES: readonly SignalSource[] = ["dailyBatch", "onDeviceRule"];

/**
 * A single timing badge attached to a ticker (SPEC §5.4 struct TimingSignal).
 * Always carries a one-line reason — 근거 없는 신호 ✗ (SPEC §5.4 배지 UI).
 */
export interface TimingSignal {
  ticker: string;
  action: TimingAction;
  /** 0.0~1.0. NOT NULL in storage — input to the §5 성적표 적중률. */
  confidence: number;
  /** 비전문가용 한 줄 근거 ("5년 추세 상단 + 최근 거래량 급증"). */
  oneLineReason: string;
  /**
   * NewsItem ids from `DailyMarketBrief.linkedTickers` for this ticker (SPEC §5.3).
   * Stored as a JSON string array — no FK, to stay consistent with the 무로그인·
   * 로컬 정합 policy. Empty when no linked news.
   */
  contextNewsIds: string[];
  /** UTC ISO 8601 timestamp the signal was evaluated. */
  evaluatedAt: string;
  source: SignalSource;
}

/** 강세/약세 섹터 한 줄 근거 (SPEC §5.3 sector_signals). */
export interface SectorSignal {
  /** 섹터명, e.g. "반도체". */
  sector: string;
  /** 강세 | 약세. */
  direction: "strong" | "weak";
  /** 한 줄 근거. */
  reason: string;
}

/**
 * The daily market brief — one per market+date, produced in the SAME LLM call as
 * the picks (SPEC §5.3: 별도 호출 ✗). Feeds the 관심·보유 탭 시장 브리핑 row.
 */
export interface DailyMarketBrief {
  market: Market;
  /** YYYY-MM-DD the brief is for. */
  date: string;
  /** 오늘 시장 한 줄 (예: "반도체 강세 주도, 코스피 +3.26% 마감"). */
  headlineSummary: string;
  /** 강세/약세 섹터 2~3개 + 한 줄 근거. */
  sectorSignals: SectorSignal[];
  /** 요약 안에서 언급된 종목 — 보유/관심 교집합 시 카드에 뉴스 배지. */
  linkedTickers: string[];
  /** 출처 URL 박제 — 검증 가능성 (SPEC §5.3 출처 게이트). */
  sourceUrls: string[];
  /** UTC ISO 8601 timestamp the brief was generated. */
  generatedAt: string;
}

const SECTOR_MIN = 2;
const SECTOR_MAX = 3;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s) out.push(s);
  }
  return out;
}

/** Clamp a model-supplied confidence to the [0, 1] contract; default 0.5 if absent/NaN. */
export function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function coerceAction(v: unknown): TimingAction {
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if ((TIMING_ACTIONS as readonly string[]).includes(t)) return t as TimingAction;
    // tolerate Korean / synonyms from the model
    if (/buy|매수|상승/.test(t)) return "buy";
    if (/sell|매도|하락/.test(t)) return "sell";
    if (/hold|보유|유지/.test(t)) return "hold";
  }
  return "watch";
}

/**
 * Validate + normalize a model-supplied object into a `TimingSignal`. Clamps
 * confidence to [0,1], enforces the action enum, and guarantees a one-line reason
 * (근거 없는 신호 ✗ — falls back to a neutral 관망 reason). `source` defaults to
 * `dailyBatch` (this normalizer is for the server batch path). Returns `undefined`
 * when there is no usable ticker — never fabricates one.
 */
export function validateTimingSignal(
  obj: unknown,
  evaluatedAt: string,
  source: SignalSource = "dailyBatch",
): TimingSignal | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const p = obj as Record<string, unknown>;
  const ticker = (str(p["ticker"]) ?? str(p["symbol"]))?.toUpperCase();
  if (!ticker) return undefined;
  return {
    ticker,
    action: coerceAction(p["action"]),
    confidence: clampConfidence(p["confidence"]),
    oneLineReason:
      str(p["oneLineReason"]) ?? str(p["one_line_reason"]) ?? str(p["reason"]) ?? "관망 — 추가 근거 대기",
    contextNewsIds: strArray(p["contextNewsIds"] ?? p["context_news_ids"]),
    evaluatedAt,
    source,
  };
}

/**
 * Validate + normalize a model-supplied object into a `DailyMarketBrief`. Clamps
 * sectorSignals to 2~3 (SPEC §5.3) and tolerates snake_case keys from the prompt.
 */
export function validateDailyMarketBrief(
  obj: unknown,
  market: Market,
  date: string,
  generatedAt: string,
): DailyMarketBrief {
  const root = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  const rawSectors = Array.isArray(root["sectorSignals"] ?? root["sector_signals"])
    ? ((root["sectorSignals"] ?? root["sector_signals"]) as unknown[])
    : [];

  const sectorSignals: SectorSignal[] = [];
  for (const rs of rawSectors) {
    if (!rs || typeof rs !== "object") continue;
    const s = rs as Record<string, unknown>;
    const sector = str(s["sector"]);
    const reason = str(s["reason"]);
    if (!sector || !reason) continue;
    const dir = str(s["direction"])?.toLowerCase();
    sectorSignals.push({
      sector,
      direction: dir === "weak" || /약/.test(dir ?? "") ? "weak" : "strong",
      reason,
    });
    if (sectorSignals.length >= SECTOR_MAX) break;
  }

  return {
    market,
    date,
    headlineSummary:
      str(root["headlineSummary"]) ?? str(root["headline_summary"]) ?? "오늘 시장 요약이 제공되지 않았습니다.",
    sectorSignals,
    linkedTickers: strArray(root["linkedTickers"] ?? root["linked_tickers"]).map((t) => t.toUpperCase()),
    sourceUrls: strArray(root["sourceUrls"] ?? root["source_urls"]),
    generatedAt,
  };
}

export { SECTOR_MIN, SECTOR_MAX };
