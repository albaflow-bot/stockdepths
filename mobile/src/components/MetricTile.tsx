import { View, Text, StyleSheet } from "react-native";
import { tokens, badgeColors, type BadgeTone } from "../theme/tokens";

export interface MetricTileProps {
  label: string;
  value: string;
  tone?: BadgeTone;
  sublabel?: string;
  testID?: string;
}

/** A compact stat tile with a tone-colored value (infographic building block). */
export function MetricTile({ label, value, tone = "muted", sublabel, testID }: MetricTileProps) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: badgeColors[tone].fg }]}>{value}</Text>
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    gap: 2,
  },
  label: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary },
  value: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold },
  sublabel: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
});
