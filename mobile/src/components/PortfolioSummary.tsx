import { View, Text, StyleSheet } from "react-native";
import { tokens, cardShadow } from "../theme/tokens";
import { fmtMoney, fmtSignedMoney, fmtSignedPct, returnTone } from "../formatters";
import { badgeColors } from "../theme/tokens";
import type { PortfolioTotals } from "../portfolio/pnl";

export interface PortfolioSummaryProps {
  totals: PortfolioTotals;
}

/** Headline portfolio totals (invested / value / gain / return %). */
export function PortfolioSummary({ totals }: PortfolioSummaryProps) {
  if (totals.countedHoldings === 0) {
    return (
      <View style={styles.card} testID="portfolio-summary">
        <Text style={styles.empty}>보유 종목과 수량·시세가 있으면 평가손익이 표시됩니다.</Text>
      </View>
    );
  }
  const gainColor = badgeColors[returnTone(totals.totalGain)].fg;
  return (
    <View style={styles.card} testID="portfolio-summary">
      <View style={styles.topRow}>
        <Text style={styles.label}>총 평가손익</Text>
        <Text style={[styles.gain, { color: gainColor }]} testID="summary-gain">
          {fmtSignedMoney(totals.totalGain)} ({fmtSignedPct(totals.totalReturnPct)})
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.subLabel}>총 투자금</Text>
        <Text style={styles.subValue}>{fmtMoney(totals.totalCost)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.subLabel}>평가금액</Text>
        <Text style={styles.subValue}>{fmtMoney(totals.totalValue)}</Text>
      </View>
      {totals.uncountedHoldings > 0 ? (
        <Text style={styles.note}>* 수량 또는 시세가 없는 {totals.uncountedHoldings}개 종목은 합계에서 제외됨</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    marginBottom: tokens.space.lg,
    gap: tokens.space.xs,
    ...cardShadow,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: tokens.space.xs },
  label: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  gain: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold },
  row: { flexDirection: "row", justifyContent: "space-between" },
  subLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  subValue: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.medium },
  note: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: 2 },
  empty: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted },
});
