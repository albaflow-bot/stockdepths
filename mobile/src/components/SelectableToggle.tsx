import { type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";

export interface SelectableToggleProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle?: string;
  /** Optional revealed content (e.g. custom inputs) shown when selected. */
  children?: ReactNode;
  testID?: string;
}

/**
 * A selectable card that toggles. Tapping selects; tapping the already-selected
 * card deselects it — there is no separate clear button (SPEC Task 8). The
 * selected state is conveyed by a highlighted border + a check mark.
 */
export function SelectableToggle({ selected, onPress, title, subtitle, children, testID }: SelectableToggleProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      testID={testID}
      style={[styles.card, selected ? styles.cardSelected : null]}
    >
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.title, selected ? styles.titleSelected : null]}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.checkOuter, selected ? styles.checkOuterSelected : null]}>
          {selected ? <Text style={styles.check}>✓</Text> : null}
        </View>
      </View>
      {selected && children ? <View style={styles.children}>{children}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  cardSelected: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surfaceAlt },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  titleSelected: { color: tokens.color.primary },
  subtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  checkOuter: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOuterSelected: { borderColor: tokens.color.primary, backgroundColor: tokens.color.primary },
  check: { color: tokens.color.primaryText, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  children: { marginTop: tokens.space.md, gap: tokens.space.md },
});
