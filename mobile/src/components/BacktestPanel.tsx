import { View, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { Badge } from "./Badge";
import { fmtPct, fmtSignedPct, returnTone } from "../formatters";
import type { BacktestResult } from "../types/picks";

export interface BacktestPanelProps {
  backtest?: BacktestResult;
  testID?: string;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * The expandable "5년 백테스트 결과" body. Leads with benchmark-relative excess
 * return (the honest headline, SPEC §추천 성공 지표) and shows win rate, per-trade
 * average, and MDD. Degrades honestly when no backtest is attached.
 */
export function BacktestPanel({ backtest, testID }: BacktestPanelProps) {
  if (!backtest) {
    return (
      <View style={styles.panel} testID={testID}>
        <Text style={styles.empty}>5년 백테스트 결과가 아직 없습니다.</Text>
      </View>
    );
  }
  const b = backtest;
  return (
    <View style={styles.panel} testID={testID}>
      <View style={styles.headline}>
        <Text style={styles.headlineLabel}>벤치마크 대비 초과수익</Text>
        <Badge text={fmtSignedPct(b.excessReturnPct)} tone={returnTone(b.excessReturnPct)} testID="backtest-excess" />
      </View>
      <Row label="전략 누적수익" value={`${fmtSignedPct(b.cumulativeReturnPct)}  ·  ${b.benchmarkSymbol} ${fmtSignedPct(b.benchmarkReturnPct)}`} />
      <Row label="적중률 · 건당 평균" value={`${fmtPct(b.winRatePct)}  ·  ${fmtSignedPct(b.avgTradeReturnPct)}`} />
      <Row label="최대낙폭(MDD) · 거래" value={`${fmtPct(b.maxDrawdownPct)}  ·  ${b.trades}회`} />
      <Text style={styles.caption}>
        {b.strategy} · {b.from}~{b.to} ({b.dataPoints} 거래일)
      </Text>
      <Text style={styles.caption}>과거 성과가 미래 수익을 보장하지 않습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: tokens.space.md,
    padding: tokens.space.md,
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: tokens.space.xs,
  },
  headline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: tokens.space.xs },
  headlineLabel: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  rowLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  rowValue: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.medium },
  caption: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: 2 },
  empty: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted },
});
