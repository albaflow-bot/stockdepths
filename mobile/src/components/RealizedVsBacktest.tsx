import { View, Text, StyleSheet } from "react-native";
import { tokens, badgeColors } from "../theme/tokens";
import { fmtPct, fmtSignedPct, returnTone } from "../formatters";
import type { ScorecardMetrics } from "../types/scorecard";

export interface RealizedVsBacktestProps {
  metrics: ScorecardMetrics;
}

/**
 * Side-by-side comparison of REALIZED outcomes vs the 5-year automatic BACKTEST
 * aggregate (SPEC Task 9: outcomes "alongside automatic backtest results"). This
 * is the core trust device — "이 로직은 지난 5년이면 이랬다" next to what actually
 * happened.
 */
export function RealizedVsBacktest({ metrics }: RealizedVsBacktestProps) {
  const bt = metrics.backtest;

  const Row = ({ label, realized, realizedTone, backtest }: { label: string; realized: string; realizedTone?: boolean; backtest: string }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.cell, realizedTone ? { color: badgeColors[returnTone(metrics.excessReturnPct)].fg } : null]}>{realized}</Text>
      <Text style={styles.cellMuted}>{backtest}</Text>
    </View>
  );

  return (
    <View style={styles.card} testID="realized-vs-backtest">
      <Text style={styles.title}>실제 성과 vs 5년 백테스트</Text>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel} />
        <Text style={styles.headerCell}>실제</Text>
        <Text style={styles.headerCell}>백테스트</Text>
      </View>
      <Row
        label="초과수익"
        realized={fmtSignedPct(metrics.excessReturnPct)}
        realizedTone
        backtest={bt ? fmtSignedPct(bt.excessReturnPct) : "—"}
      />
      <Row label="적중률" realized={fmtPct(metrics.winRatePct)} backtest={bt ? fmtPct(bt.winRatePct) : "—"} />
      <Row label="건당 평균" realized={fmtSignedPct(metrics.avgTradeReturnPct)} backtest={bt ? fmtSignedPct(bt.avgTradeReturnPct) : "—"} />
      <Row label="최대낙폭(MDD)" realized={fmtPct(metrics.maxDrawdownPct)} backtest={bt ? fmtPct(bt.maxDrawdownPct) : "—"} />
      {!bt ? <Text style={styles.note}>5년 백테스트 집계가 아직 없습니다.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    marginTop: tokens.space.lg,
    gap: tokens.space.xs,
  },
  title: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, marginBottom: tokens.space.xs },
  headerRow: { flexDirection: "row", paddingBottom: tokens.space.xs, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  headerLabel: { flex: 1.4 },
  headerCell: { flex: 1, textAlign: "right", fontSize: tokens.font.size.xs, color: tokens.color.textMuted, fontWeight: tokens.font.weight.bold },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  rowLabel: { flex: 1.4, fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  cell: { flex: 1, textAlign: "right", fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  cellMuted: { flex: 1, textAlign: "right", fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  note: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: tokens.space.xs },
});
