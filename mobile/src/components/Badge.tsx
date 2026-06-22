import { View, Text, StyleSheet } from "react-native";
import { badgeColors, tokens, type BadgeTone } from "../theme/tokens";

export interface BadgeProps {
  text: string;
  tone: BadgeTone;
  testID?: string;
}

/** A small pill conveying a confidence/risk/return value via color + label. */
export function Badge({ text, tone, testID }: BadgeProps) {
  const c = badgeColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]} testID={testID}>
      <Text style={[styles.text, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    alignSelf: "flex-start",
  },
  text: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold },
});
