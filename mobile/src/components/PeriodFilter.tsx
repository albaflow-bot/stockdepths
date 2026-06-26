import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { periodLabel, type ScorecardPeriod } from "../types/scorecard";

export interface PeriodFilterProps {
  periods: ScorecardPeriod[];
  selected: ScorecardPeriod;
  onSelect: (p: ScorecardPeriod) => void;
}

/** Segmented control to filter the scorecard by period (1W/1M/3M/1Y). */
export function PeriodFilter({ periods, selected, onSelect }: PeriodFilterProps) {
  return (
    <View style={styles.bar} accessibilityRole="tablist" testID="period-filter">
      {periods.map((p) => {
        const active = p === selected;
        return (
          <Pressable
            key={p}
            onPress={() => onSelect(p)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={periodLabel(p)}
            testID={`period-${p}`}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text style={[styles.label, active ? styles.labelActive : null]}>{periodLabel(p)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space.xs,
    marginBottom: tokens.space.lg,
  },
  segment: { flex: 1, paddingVertical: tokens.space.sm, alignItems: "center", borderRadius: tokens.radius.sm },
  segmentActive: { backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.primary },
  label: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  labelActive: { color: tokens.color.primary, fontWeight: tokens.font.weight.bold },
});
