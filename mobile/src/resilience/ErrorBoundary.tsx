/**
 * Top-level error boundary (RESILIENCE CONTRACT).
 *
 * Catches render/runtime errors below it, logs them with breadcrumbs, and shows a
 * recovery screen that surfaces the real cause + full stack and a one-tap "오류
 * 복사" so a non-developer can forward a useful report. Does not hide the cause
 * behind a generic message.
 */

import { Component, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { logError, type ErrorRecord } from "./errorLog";

interface Props {
  children: ReactNode;
  /** Optional override for the recovery action (defaults to resetting state). */
  onReset?: () => void;
}
interface State {
  record: ErrorRecord | null;
}

function copyToClipboard(text: string): void {
  try {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(t: string): unknown } } }).navigator;
    nav?.clipboard?.writeText(text);
  } catch {
    /* clipboard may be unavailable; ignore */
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { record: null };

  // Set state synchronously so the fallback renders in the same commit.
  static getDerivedStateFromError(error: Error): State {
    return {
      record: {
        kind: "react.render",
        message: error.message,
        stack: error.stack,
        ts: new Date().toISOString(),
        breadcrumbs: [],
      },
    };
  }

  // Enrich + persist the record (breadcrumbs, ring buffer) after the catch.
  override componentDidCatch(error: Error): void {
    this.setState({ record: logError(error, "react.render") });
  }

  private reset = (): void => {
    this.setState({ record: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { record } = this.state;
    if (!record) return this.props.children;

    const report = [
      `시각: ${record.ts}`,
      `원인: ${record.message}`,
      "",
      "스택:",
      record.stack ?? "(없음)",
      "",
      "직전 동작:",
      ...record.breadcrumbs.slice(-10),
    ].join("\n");

    return (
      <View style={styles.container} testID="error-boundary-fallback">
        <Text style={styles.title}>문제가 발생했어요</Text>
        <Text style={styles.cause}>{record.message}</Text>
        <ScrollView style={styles.stackBox} contentContainerStyle={styles.stackContent}>
          <Text style={styles.stack} selectable>
            {record.stack ?? "스택 정보가 없습니다."}
          </Text>
        </ScrollView>
        <View style={styles.row}>
          <Pressable
            style={styles.primaryBtn}
            accessibilityRole="button"
            onPress={() => copyToClipboard(report)}
          >
            <Text style={styles.primaryBtnText}>오류 복사</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} accessibilityRole="button" onPress={this.reset}>
            <Text style={styles.secondaryBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: tokens.space.xl, backgroundColor: tokens.color.bg, gap: tokens.space.md },
  title: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  cause: { fontSize: tokens.font.size.md, color: tokens.color.negative },
  stackBox: {
    maxHeight: 240,
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  stackContent: { padding: tokens.space.md },
  stack: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary },
  row: { flexDirection: "row", gap: tokens.space.md },
  primaryBtn: {
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.md,
  },
  primaryBtnText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },
  secondaryBtn: {
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  secondaryBtnText: { color: tokens.color.textPrimary, fontWeight: tokens.font.weight.medium },
});
