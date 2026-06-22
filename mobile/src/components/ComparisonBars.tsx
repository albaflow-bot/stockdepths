import { View, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { barFraction, maxMagnitude, pctWidth } from "../charts/proportion";
import { fmtSignedPct } from "../formatters";

export interface ComparisonBarsProps {
  portfolioPct: number | null;
  benchmarkPct: number | null;
  benchmarkSymbol: string;
}

/**
 * Two horizontal bars comparing the portfolio's realized return to the benchmark
 * — the visual behind the headline excess return (infographic, not a text list).
 */
export function ComparisonBars({ portfolioPct, benchmarkPct, benchmarkSymbol }: ComparisonBarsProps) {
  const max = maxMagnitude(portfolioPct, benchmarkPct);

  const Bar = ({ label, value, color, testID }: { label: string; value: number | null; color: string; testID: string }) => (
    <View style={styles.barRow} testID={testID}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: pctWidth(barFraction(value, max)), backgroundColor: color }]} />
      </View>
      <Text style={styles.barValue}>{fmtSignedPct(value)}</Text>
    </View>
  );

  return (
    <View style={styles.wrap} testID="comparison-bars">
      <Bar label="내 추천" value={portfolioPct} color={tokens.color.primary} testID="bar-portfolio" />
      <Bar label={benchmarkSymbol} value={benchmarkPct} color={tokens.color.textMuted} testID="bar-benchmark" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.sm, marginTop: tokens.space.md },
  barRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  barLabel: { width: 64, fontSize: tokens.font.size.xs, color: tokens.color.textSecondary },
  track: { flex: 1, height: 14, backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.pill, overflow: "hidden" },
  fill: { height: 14, borderRadius: tokens.radius.pill, minWidth: 2 },
  barValue: { width: 64, textAlign: "right", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
});
