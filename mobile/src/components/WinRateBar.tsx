import { View, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { pctWidth, winRateFraction } from "../charts/proportion";
import { fmtPct } from "../formatters";

export interface WinRateBarProps {
  winRatePct: number | null;
}

/** A progress bar visualizing the win rate (0–100%). */
export function WinRateBar({ winRatePct }: WinRateBarProps) {
  return (
    <View style={styles.wrap} testID="win-rate-bar">
      <View style={styles.header}>
        <Text style={styles.label}>적중률</Text>
        <Text style={styles.value}>{fmtPct(winRatePct)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: pctWidth(winRateFraction(winRatePct)) }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.xs },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  value: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.bold },
  track: { height: 12, backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.pill, overflow: "hidden" },
  fill: { height: 12, borderRadius: tokens.radius.pill, minWidth: 2, backgroundColor: tokens.color.primary },
});
