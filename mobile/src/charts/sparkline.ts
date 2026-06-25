/**
 * 스파크라인 기하 (순수 — 직접 단위테스트). 최근 종가 배열을 0..1 높이 분수로 정규화.
 * SVG 의존성 없이 View 막대로 렌더하기 위한 입력을 만든다(react-native-svg 미사용).
 */

/** closes → 각 점의 높이 분수(0..1). 모두 같으면 평평한 0.5. 빈/단일은 빈 배열. */
export function sparklineFractions(closes: number[]): number[] {
  const pts = closes.filter((c) => Number.isFinite(c));
  if (pts.length < 2) return [];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  if (max === min) return pts.map(() => 0.5);
  return pts.map((c) => (c - min) / (max - min));
}

/** 추이 부호: 마지막 - 처음. >0 상승, <0 하락, 0 보합. null 데이터는 0. */
export function sparklineTrend(closes: number[]): number {
  const pts = closes.filter((c) => Number.isFinite(c));
  if (pts.length < 2) return 0;
  return pts[pts.length - 1]! - pts[0]!;
}
