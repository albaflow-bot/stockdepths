/**
 * 결정론적 타이밍 신호 도출 (SPEC §0-Δ: "LLM 은 한 줄을 얹을 뿐, 후보 선정의 원천은
 * 결정론적 시장 스캔"). 검색 결과 카드의 "한 줄 신호" 는 daily_screen 지표에서 바로
 * 계산한다 — 추가 LLM 호출 0, 근거 없는 신호는 만들지 않는다(null 반환).
 */

import type { DailyScreenRecord, Direction, SecuritySignal } from "./types.js";

/** change_pct 부호 → 방향 (클라 색상 분기의 단일 진실원천). */
export function directionOf(changePct: number | null | undefined): Direction {
  if (changePct == null || !Number.isFinite(changePct) || changePct === 0) return "flat";
  return changePct > 0 ? "up" : "down";
}

/** RVOL≥3 + 갭 ±5% 등 SPEC 임계값(§1-Δ, D-5 제안 default). */
const RVOL_SURGE = 3;
const GAP_PCT = 5;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const NEAR_HIGH = 0.99; // last ≥ 52주고 * 0.99 → 신고가 근접/돌파

function pct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : ""}${r}%`;
}

/**
 * 한 종목의 일별 스냅샷에서 "한 줄 행동 신호 + 근거" 를 결정론으로 도출.
 * 어떤 조건도 명확히 성립하지 않으면 null (근거 없는 신호 렌더 금지).
 * 우선순위: 과매도 반등 > 거래폭발 급등 > 신고가 돌파 > 과열 경계 > 추세 회복.
 */
export function deriveSignal(s: Pick<
  DailyScreenRecord,
  "last" | "change_pct" | "rvol" | "rsi14" | "high_52w"
> | null | undefined): SecuritySignal | null {
  if (!s) return null;
  const { rsi14, rvol, change_pct: chg, last, high_52w } = s;

  // 과매도 반등 후보: RSI<30 인데 당일 양봉 → 반등 주시.
  if (rsi14 != null && rsi14 < RSI_OVERSOLD && chg != null && chg > 0) {
    return { label: "과매도 반등 주시", reason: `RSI ${Math.round(rsi14)} · 반등 캔들 ${pct(chg)}` };
  }

  // 거래폭발 급등: RVOL≥3 + 갭 +5% → 강한 매수세 유입.
  if (rvol != null && rvol >= RVOL_SURGE && chg != null && chg >= GAP_PCT) {
    return { label: "거래 폭증 급등", reason: `RVOL ${rvol.toFixed(1)}배 · ${pct(chg)}` };
  }

  // 신고가 돌파: 52주 고가 근접/경신.
  if (last != null && high_52w != null && high_52w > 0 && last >= high_52w * NEAR_HIGH) {
    return { label: "신고가 돌파", reason: "52주 신고가 경신/근접" };
  }

  // 과열 경계: RSI>70 → 단기 차익 경계.
  if (rsi14 != null && rsi14 > RSI_OVERBOUGHT) {
    return { label: "단기 과열 경계", reason: `RSI ${Math.round(rsi14)} (과매수)` };
  }

  // 추세 회복: 거래 동반 상승(RVOL≥1.5 + 상승).
  if (rvol != null && rvol >= 1.5 && chg != null && chg > 0) {
    return { label: "거래 동반 상승", reason: `RVOL ${rvol.toFixed(1)}배 · ${pct(chg)}` };
  }

  return null;
}
