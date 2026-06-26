/**
 * PriceChart — 구글 파이낸스 스타일 일봉 차트(상세 화면용). react-native-svg 의존 없이
 * View 컬럼(영역 느낌) 막대로 렌더 → web/native/test 모두 동일 동작(Sparkline 동형).
 *
 * 종가 배열을 0..1 정규화해 세로 막대로 그린다(priceChartFractions). 색은 기간
 * 시작→끝 종가 방향 + 시장 관례색(marketDirectionColor). 빈/부족 데이터는 자리만 잡는다.
 * 디자인 토큰만 사용한다(하드코딩 색/사이즈 ✗).
 */

import { View, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { priceChartFractions, priceChartTrend } from "../charts/priceChart";
import { marketDirectionColor, directionOf } from "./marketColors";
import type { HistoryMarket } from "../types/history";
import type { ExchangeMarket } from "../types/security";

export interface PriceChartProps {
  closes: number[];
  /** 차트 색상 시장 그룹(US/KR). KR 상승=빨강/하락=파랑, US 상승=초록/하락=빨강. */
  market: HistoryMarket;
  /** 차트 높이(px). 기본 140. */
  height?: number;
  testID?: string;
}

/** 그룹(US/KR) → 색상 관례용 대표 거래소. marketDirectionColor 는 거래소 단위라 매핑한다. */
function representativeExchange(market: HistoryMarket): ExchangeMarket {
  return market === "KR" ? "KOSPI" : "NASDAQ";
}

export function PriceChart({ closes, market, height = 140, testID }: PriceChartProps) {
  const tid = testID ?? "price-chart";
  const fractions = priceChartFractions(closes);

  if (fractions.length < 2) {
    // 데이터 부족 — 빈 자리만 차지(레이아웃 흔들림 방지). throw 금지.
    return <View style={[styles.empty, { height }]} testID={`${tid}-empty`} />;
  }

  const trend = priceChartTrend(closes);
  const color = marketDirectionColor(representativeExchange(market), directionOf(trend));

  return (
    <View style={[styles.row, { height }]} testID={tid} accessibilityLabel="기간 가격 추이 차트">
      {fractions.map((f, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: Math.max(2, Math.round(f * (height - 4)) + 2), backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 1,
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: tokens.space.xs,
  },
  bar: { flex: 1, borderTopLeftRadius: 1, borderTopRightRadius: 1, minWidth: 1, opacity: 0.85 },
  empty: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.sm,
  },
});
