/**
 * 카테고리 스크리닝 (SPEC §1-Δ 6 카테고리 + §3.3-Δ2 step 4·5). 결정론적 정렬·임계값만
 * 으로 카테고리별 후보 N개를 뽑는다 — LLM 호출 0. 후보 *선정* 의 원천이 바로 이 단계
 * (엣지). LLM 은 이후 한 줄 코멘트만 얹는다(§0-Δ).
 *
 * 대형주 배제 규칙(§1-Δ, 강제):
 *  - 모멘텀 카테고리(gainers/losers/volume_surge/breakout/oversold_bounce)에서 시총
 *    상위 X% 대형주를 *완전히 제외* 한다.
 *  - 대형주는 오직 unusual_value 에만, 그것도 *이례신호*(RVOL≥3 또는 갭 ±gapPct%)가
 *    있을 때만 노출 허용.
 */

import type { ScreenThresholds } from "./config.js";
import type { ScreenedSymbol } from "./screenMetrics.js";

/** 6 카테고리 키 (SPEC §1-Δ 표). */
export type ScreenCategory =
  | "gainers"
  | "losers"
  | "volume_surge"
  | "unusual_value"
  | "breakout"
  | "oversold_bounce"
  | "large_cap_movers";

/** 한국어 라벨 (SPEC §1-Δ 표). */
export const CATEGORY_LABELS: Record<ScreenCategory, string> = {
  gainers: "🚀 급등주",
  losers: "🔻 급락주",
  volume_surge: "🔥 거래폭발",
  unusual_value: "💰 대금집중",
  breakout: "📈 신고가/돌파",
  oversold_bounce: "↩️ 과매도 반등",
  large_cap_movers: "💎 대형주 무버",
};

/** 모멘텀 카테고리 = 대형주를 완전히 배제하는 카테고리. unusual_value 만 예외. */
export const MOMENTUM_CATEGORIES: ScreenCategory[] = [
  "gainers",
  "losers",
  "volume_surge",
  "breakout",
  "oversold_bounce",
];

/** SPEC §3.5-Δ #1 회귀 게이트가 직접 검사하는 카테고리(대형주 누수 0). */
export const LARGECAP_GUARDED_CATEGORIES: ScreenCategory[] = ["gainers", "breakout", "volume_surge"];

/** 한 카테고리에 선별된 후보. */
export interface ScreenCandidate {
  category: ScreenCategory;
  symbol: ScreenedSymbol;
}

/** 대형주의 이례신호 여부(§1-Δ 예외): RVOL≥surge 또는 갭 절댓값 ≥ gapPct. */
export function hasUnusualSignal(s: ScreenedSymbol, t: ScreenThresholds): boolean {
  const rvol = s.screen.rvol;
  const chg = s.screen.change_pct;
  return (rvol != null && rvol >= t.rvolSurge) || (chg != null && Math.abs(chg) >= t.gapPct);
}

/** 52주 신고가 경신/근접(99%) 여부. */
function isBreakout(s: ScreenedSymbol): boolean {
  const last = s.screen.last;
  const high = s.screen.high_52w;
  return last != null && high != null && high > 0 && last >= high * 0.99;
}

function num(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : v;
}

/**
 * 한 카테고리의 후보를 임계값·정렬로 추출한다. `pool` 은 노이즈 필터를 이미 통과한
 * 종목들. 대형주 배제는 카테고리별로 여기서 강제된다.
 */
export function selectCategory(
  category: ScreenCategory,
  pool: ScreenedSymbol[],
  t: ScreenThresholds,
): ScreenCandidate[] {
  // 모멘텀 카테고리는 대형주를 완전히 제외.
  const base = MOMENTUM_CATEGORIES.includes(category) ? pool.filter((s) => !s.isLargeCap) : pool;

  let qualified: ScreenedSymbol[];
  switch (category) {
    case "gainers":
      qualified = base
        .filter((s) => num(s.screen.change_pct) != null && s.screen.change_pct! > 0)
        .sort((a, b) => (b.screen.change_pct ?? 0) - (a.screen.change_pct ?? 0));
      break;
    case "losers":
      qualified = base
        .filter((s) => num(s.screen.change_pct) != null && s.screen.change_pct! < 0)
        .sort((a, b) => (a.screen.change_pct ?? 0) - (b.screen.change_pct ?? 0));
      break;
    case "volume_surge":
      qualified = base
        .filter((s) => num(s.screen.rvol) != null && s.screen.rvol! >= t.rvolSurge)
        .sort((a, b) => (b.screen.rvol ?? 0) - (a.screen.rvol ?? 0));
      break;
    case "unusual_value":
      // 대금집중 = 거래대금 상위. 대형주는 이례신호가 있을 때만 풀에 포함.
      qualified = pool
        .filter((s) => !s.isLargeCap || hasUnusualSignal(s, t))
        .filter((s) => num(s.screen.turnover) != null)
        .sort((a, b) => (b.screen.turnover ?? 0) - (a.screen.turnover ?? 0));
      break;
    case "breakout":
      qualified = base
        .filter(isBreakout)
        .sort((a, b) => (b.screen.change_pct ?? 0) - (a.screen.change_pct ?? 0));
      break;
    case "oversold_bounce":
      // RSI<30 이탈 후 반등 캔들(당일 양봉).
      qualified = base
        .filter(
          (s) =>
            num(s.screen.rsi14) != null &&
            s.screen.rsi14! < t.rsiOversold &&
            num(s.screen.change_pct) != null &&
            s.screen.change_pct! > 0,
        )
        .sort((a, b) => (a.screen.rsi14 ?? 0) - (b.screen.rsi14 ?? 0));
      break;
    case "large_cap_movers":
      // 대형주(시총 상위)는 모멘텀에서 빼되 *오늘 움직인 것*만 따로 모아 보여준다
      // (제외 ✗ → 분리). |등락률| 큰 순. 단순 시총 순위표가 되지 않게 변동 있는 것만.
      qualified = pool
        .filter((s) => s.isLargeCap && num(s.screen.change_pct) != null && s.screen.change_pct !== 0)
        .sort((a, b) => Math.abs(b.screen.change_pct ?? 0) - Math.abs(a.screen.change_pct ?? 0));
      break;
  }

  return qualified.slice(0, t.perCategory).map((symbol) => ({ category, symbol }));
}

/** 활성 카테고리 각각을 스크리닝해 카테고리→후보 맵을 만든다. */
export function screenCategories(
  pool: ScreenedSymbol[],
  t: ScreenThresholds,
  categories: ScreenCategory[] = [
    "gainers",
    "losers",
    "volume_surge",
    "unusual_value",
    "breakout",
    "oversold_bounce",
    "large_cap_movers",
  ],
): Record<ScreenCategory, ScreenCandidate[]> {
  const out = {} as Record<ScreenCategory, ScreenCandidate[]>;
  for (const c of categories) out[c] = selectCategory(c, pool, t);
  return out;
}
