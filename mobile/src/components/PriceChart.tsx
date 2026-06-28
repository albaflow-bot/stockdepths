/**
 * PriceChart — 구글 파이낸스 스타일 일봉 차트(상세 화면용). react-native-svg 의존 없이
 * View 컬럼(영역 느낌) 막대로 렌더 → web/native/test 모두 동일 동작(Sparkline 동형).
 *
 * 종가 배열을 0..1 정규화해 세로 막대로 그린다(priceChartFractions). 색은 기간
 * 시작→끝 종가 방향 + 시장 관례색(marketDirectionColor). 빈/부족 데이터는 자리만 잡는다.
 *
 * dates+formatValue 가 주어지면 **터치 스크러버**가 켜진다: 막대를 짚으면(드래그 포함)
 * 그 날짜·가격이 위 툴팁에 뜨고 해당 막대가 강조된다. 디자인 토큰만 사용한다.
 */

import { useState } from "react";
import { View, Text, StyleSheet, type LayoutChangeEvent, type GestureResponderEvent } from "react-native";
import { tokens } from "../theme/tokens";
import { priceChartFractions, priceChartTrend, scrubIndex } from "../charts/priceChart";
import { marketDirectionColor, directionOf } from "./marketColors";
import type { HistoryMarket } from "../types/history";
import type { ExchangeMarket } from "../types/security";

export interface PriceChartProps {
  closes: number[];
  /** 차트 색상 시장 그룹(US/KR). KR 상승=빨강/하락=파랑, US 상승=초록/하락=빨강. */
  market: HistoryMarket;
  /** 차트 높이(px). 기본 140. */
  height?: number;
  /** 막대 터치 툴팁용 — closes 와 같은 길이의 날짜 배열(YYYY-MM-DD). */
  dates?: string[];
  /** 종가 → 표시 문자열(시장별 통화 포맷). dates 와 함께 주면 스크러버 활성. */
  formatValue?: (v: number) => string;
  testID?: string;
}

/** 그룹(US/KR) → 색상 관례용 대표 거래소. marketDirectionColor 는 거래소 단위라 매핑한다. */
function representativeExchange(market: HistoryMarket): ExchangeMarket {
  return market === "KR" ? "KOSPI" : "NASDAQ";
}

/** "2026-06-25" → "6월 25일". 형식이 다르면 원본 반환. */
function formatDateKo(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : iso;
}

export function PriceChart({ closes, market, height = 140, dates, formatValue, testID }: PriceChartProps) {
  const tid = testID ?? "price-chart";
  const fractions = priceChartFractions(closes);
  const [sel, setSel] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  if (fractions.length < 2) {
    // 데이터 부족 — 빈 자리만 차지(레이아웃 흔들림 방지). throw 금지.
    return <View style={[styles.empty, { height }]} testID={`${tid}-empty`} />;
  }

  const trend = priceChartTrend(closes);
  const color = marketDirectionColor(representativeExchange(market), directionOf(trend));
  const n = fractions.length;
  const interactive = !!dates && !!formatValue && dates.length === closes.length;

  const pick = (e: GestureResponderEvent) => {
    if (!interactive || width <= 0) return;
    setSel(scrubIndex(e.nativeEvent.locationX, width, n));
  };

  return (
    <View testID={`${tid}-wrap`}>
      {/* 터치 툴팁: 짚은 날짜·가격. 미선택이면 안내 한 줄. */}
      {interactive ? (
        <View style={styles.tooltip} testID={`${tid}-tooltip`}>
          {sel != null ? (
            <>
              <Text style={styles.tipDate}>{formatDateKo(dates![sel]!)}</Text>
              <Text style={styles.tipVal}>{formatValue!(closes[sel]!)}</Text>
            </>
          ) : (
            <Text style={styles.tipHint}>막대를 짚으면 날짜·가격이 표시돼요</Text>
          )}
        </View>
      ) : null}

      <View
        style={[styles.row, { height }]}
        testID={tid}
        accessibilityLabel="기간 가격 추이 차트"
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => interactive}
        onMoveShouldSetResponder={() => interactive}
        onResponderGrant={pick}
        onResponderMove={pick}
      >
        {fractions.map((f, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: Math.max(2, Math.round(f * (height - 4)) + 2),
                backgroundColor: color,
                opacity: sel === i ? 1 : 0.85,
              },
              sel === i ? styles.barSelected : null,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: tokens.space.sm,
    minHeight: 22,
    marginBottom: tokens.space.xs,
  },
  tipDate: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  tipVal: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.bold },
  tipHint: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
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
  barSelected: { backgroundColor: tokens.color.primary },
  empty: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.sm,
  },
});
