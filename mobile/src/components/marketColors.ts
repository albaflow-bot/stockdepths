/**
 * 시장별 등락 색상 관례 (SPEC §3.2-Δ "색상 규약"):
 *  - KR(코스피/코스닥): 상승=빨강 · 하락=파랑   ← 한국 관례
 *  - US(나스닥/뉴욕):   상승=초록 · 하락=빨강
 *
 * ⚠ 빨강이 시장에 따라 반대 의미(KR 상승 / US 하락)이므로 **색만으로 구분 ✗** →
 * 반드시 ▲▼ 기호를 병기한다(접근성, SPEC 명시). changeArrow() 가 그 기호를 준다.
 *
 * 방향은 서버가 내려준 direction 을 신뢰하되, 없으면 changePct 부호로 보강한다.
 */

import { tokens } from "../theme/tokens";
import { isKrMarket, type Direction, type ExchangeMarket } from "../types/security";

/** changePct 부호 → 방향 (서버 direction 누락 시 폴백). */
export function directionOf(changePct: number | null | undefined): Direction {
  if (changePct == null || !Number.isFinite(changePct) || changePct === 0) return "flat";
  return changePct > 0 ? "up" : "down";
}

/** (시장, 방향) → 색상. flat 은 muted. */
export function marketDirectionColor(market: ExchangeMarket, direction: Direction): string {
  if (direction === "flat") return tokens.color.textMuted;
  if (isKrMarket(market)) {
    // KR: 상승=빨강 · 하락=파랑
    return direction === "up" ? tokens.color.negative : tokens.color.marketBlue;
  }
  // US: 상승=초록 · 하락=빨강
  return direction === "up" ? tokens.color.positive : tokens.color.negative;
}

/** 등락률 → 시장색 (편의 래퍼). */
export function marketChangeColor(market: ExchangeMarket, changePct: number | null | undefined): string {
  return marketDirectionColor(market, directionOf(changePct));
}

/** 방향 기호 — 색맹·흑백에서도 구분 가능하도록 병기 (▲ 상승 / ▼ 하락 / – 보합). */
export function changeArrow(direction: Direction): string {
  return direction === "up" ? "▲" : direction === "down" ? "▼" : "–";
}
