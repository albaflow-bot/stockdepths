import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";

export function LoadingView() {
  return (
    <View style={styles.center} testID="state-loading">
      <ActivityIndicator size="large" color={tokens.color.primary} />
      <Text style={styles.muted}>오늘의 추천을 불러오는 중…</Text>
    </View>
  );
}

export function EmptyView({ message = "오늘은 아직 추천이 준비되지 않았습니다." }: { message?: string }) {
  return (
    <View style={styles.center} testID="state-empty">
      <Text style={styles.title}>추천 없음</Text>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center} testID="state-error">
      <Text style={styles.title}>불러오지 못했어요</Text>
      <Text style={styles.muted}>{message}</Text>
      <Pressable style={styles.retry} accessibilityRole="button" onPress={onRetry} testID="retry-button">
        <Text style={styles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: tokens.space.xxl, gap: tokens.space.md },
  title: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  muted: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, textAlign: "center" },
  retry: {
    marginTop: tokens.space.sm,
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.md,
  },
  retryText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },
});
