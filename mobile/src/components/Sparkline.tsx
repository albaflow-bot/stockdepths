/**
 * Sparkline — 최근 7거래일 종가 미니 추이 (SPEC §3.2-Δ "최근 1주 추이 미니 스파크라인").
 * react-native-svg 의존 없이 View 막대로 렌더 → web/native/test 모두 동일 동작.
 * 색상은 추이 부호 + 시장 관례색(KR 상승=빨강/하락=파랑, US 상승=초록/하락=빨강).
 */

import { View, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { sparklineFractions, sparklineTrend } from "../charts/sparkline";
import { marketDirectionColor, directionOf } from "./marketColors";
import type { ExchangeMarket } from "../types/security";

export interface SparklineProps {
  closes: number[];
  market: ExchangeMarket;
  /** 차트 높이(px). 기본 28. */
  height?: number;
  testID?: string;
}

export function Sparkline({ closes, market, height = 28, testID }: SparklineProps) {
  const fractions = sparklineFractions(closes);
  const tid = testID ?? "sparkline";
  if (fractions.length < 2) {
    // 데이터 부족 — 빈 자리만 차지(레이아웃 흔들림 방지).
    return <View style={[styles.empty, { height }]} testID={`${tid}-empty`} />;
  }
  const trend = sparklineTrend(closes);
  const color = marketDirectionColor(market, directionOf(trend));

  return (
    <View style={[styles.row, { height }]} testID={tid} accessibilityLabel="최근 7일 추이">
      {fractions.map((f, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: Math.max(2, Math.round(f * (height - 2)) + 2), backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 2, minWidth: 56 },
  bar: { flex: 1, borderRadius: 1, minWidth: 3, opacity: 0.85 },
  empty: { minWidth: 56 },
});
