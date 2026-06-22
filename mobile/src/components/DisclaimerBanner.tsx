import { View, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";

/** The exact phrase the SPEC requires above all predictions (SPEC Task 6 / §3.2). */
export const DISCLAIMER_HEADLINE = "AI는 보장이 아닌 참고 조언입니다.";

export interface DisclaimerBannerProps {
  /** Optional longer disclaimer (e.g. artifact.disclaimer) shown beneath the headline. */
  detail?: string;
}

/**
 * Prominent, always-visible disclaimer banner. Rendered above the predictions so
 * the "참고 조언" framing is seen before any pick (SPEC: 'AI는 정답 아닌 참고 조언').
 */
export function DisclaimerBanner({ detail }: DisclaimerBannerProps) {
  return (
    <View style={styles.banner} accessibilityRole="alert" testID="disclaimer-banner">
      <Text style={styles.headline}>⚠️ {DISCLAIMER_HEADLINE}</Text>
      {detail && detail !== DISCLAIMER_HEADLINE ? (
        <Text style={styles.detail}>{detail}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: tokens.color.disclaimerBg,
    borderColor: tokens.color.disclaimerBorder,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.lg,
  },
  headline: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.disclaimerFg,
  },
  detail: {
    marginTop: tokens.space.xs,
    fontSize: tokens.font.size.sm,
    color: tokens.color.disclaimerFg,
  },
});
