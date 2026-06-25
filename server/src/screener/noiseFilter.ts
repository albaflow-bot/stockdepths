/**
 * 노이즈 필터 (SPEC §1-Δ "노이즈 필터(강제, 동전주/유령거래 배제)" + §3.3-Δ2 step 3).
 * 동전주·유령거래·신규상장·관리종목/우선주를 후보 풀에서 제거한다. 순수 함수.
 *
 * 사용자 토글로 관리종목/우선주 포함 가능(SPEC) → includeManaged 옵션으로 노출.
 */

import type { ScreenThresholds } from "./config.js";
import type { ScreenedSymbol } from "./screenMetrics.js";

export interface NoiseFilterOptions {
  /** true 면 관리종목/거래정지/우선주도 통과 (사용자 토글). 기본 false. */
  includeManaged?: boolean;
}

/** 한 종목이 노이즈 필터를 통과하는지 + 탈락 사유(디버그/감사용). */
export interface NoiseVerdict {
  ok: boolean;
  reason?: "min_price" | "min_turnover" | "min_listed_days" | "managed" | "preferred" | "delisted";
}

export function passesNoiseFilter(
  s: ScreenedSymbol,
  t: ScreenThresholds,
  opts: NoiseFilterOptions = {},
): NoiseVerdict {
  if (s.master.delisted) return { ok: false, reason: "delisted" };
  if (!opts.includeManaged) {
    if (s.isManaged) return { ok: false, reason: "managed" };
    if (s.isPreferred) return { ok: false, reason: "preferred" };
  }
  const last = s.screen.last;
  if (last == null || last < t.minPrice) return { ok: false, reason: "min_price" };
  const turnover = s.screen.turnover;
  if (turnover == null || turnover < t.minTurnover) return { ok: false, reason: "min_turnover" };
  // 상장 경과일은 알 수 없으면(null) 통과시킨다(데이터 부재로 후보를 막지 않음 —
  // Sane default; 60일 미만이 *확인된* 경우에만 탈락).
  if (s.listedDays != null && s.listedDays < t.minListedDays) {
    return { ok: false, reason: "min_listed_days" };
  }
  return { ok: true };
}

/** 노이즈 필터를 통과한 종목만 남긴다. */
export function applyNoiseFilter(
  symbols: ScreenedSymbol[],
  t: ScreenThresholds,
  opts: NoiseFilterOptions = {},
): ScreenedSymbol[] {
  return symbols.filter((s) => passesNoiseFilter(s, t, opts).ok);
}
