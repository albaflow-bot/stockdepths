/**
 * 가격 차트 기하 (순수 — 직접 단위테스트). 종가 배열을 0..1 높이 분수로 정규화.
 * react-native-svg 미사용 → View 컬럼/영역 차트의 입력으로 쓴다(Sparkline 과 동형).
 *
 * sparklineFractions 와 의도는 같지만 상세 차트는 더 많은 점(최대 수백)을 받으므로
 * 별도 모듈로 둔다(추후 다운샘플 등 확장 여지).
 */

/** closes → 각 점의 높이 분수(0..1). 모두 같으면 평평한 0.5. 빈/단일은 빈 배열. */
export function priceChartFractions(closes: number[]): number[] {
  const pts = closes.filter((c) => Number.isFinite(c));
  if (pts.length < 2) return [];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  if (max === min) return pts.map(() => 0.5);
  return pts.map((c) => (c - min) / (max - min));
}

/** 기간 시작→끝 종가 방향. >0 상승, <0 하락, 0/부족 데이터는 보합. */
export function priceChartTrend(closes: number[]): number {
  const pts = closes.filter((c) => Number.isFinite(c));
  if (pts.length < 2) return 0;
  return pts[pts.length - 1]! - pts[0]!;
}
