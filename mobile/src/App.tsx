import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "./theme/tokens";
import { ErrorBoundary } from "./resilience/ErrorBoundary";
import { isSafeMode, markStable, recordBootStart } from "./resilience/safeMode";
import { addBreadcrumb, installGlobalErrorHandlers, readErrors } from "./resilience/errorLog";
import { AppShell } from "./navigation/AppShell";
import { PersonaGate } from "./navigation/PersonaGate";

/** Recovery screen shown after 3 consecutive immediate crashes (RESILIENCE CONTRACT). */
function SafeModeScreen({ onRecover }: { onRecover: () => void }) {
  const last = readErrors().slice(-1)[0];
  const copy = () => {
    try {
      const nav = (globalThis as { navigator?: { clipboard?: { writeText(t: string): unknown } } }).navigator;
      nav?.clipboard?.writeText(JSON.stringify(last ?? {}, null, 2));
    } catch {
      /* ignore */
    }
  };
  return (
    <View style={styles.safe} testID="safe-mode-screen">
      <Text style={styles.safeTitle}>오류 보고됨 · 복구 대기</Text>
      <Text style={styles.safeBody}>
        앱이 반복해서 멈춰 안전 모드로 시작했습니다. 아래에서 복구를 시도할 수 있습니다.
      </Text>
      {last ? <Text style={styles.safeCause}>최근 원인: {last.message}</Text> : null}
      <View style={styles.safeRow}>
        <Pressable style={styles.primaryBtn} accessibilityRole="button" onPress={onRecover}>
          <Text style={styles.primaryBtnText}>복구 시도</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} accessibilityRole="button" onPress={copy}>
          <Text style={styles.secondaryBtnText}>오류 복사</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  // Increment the boot counter once; trips safe mode at the 3rd consecutive crash.
  const [safe, setSafe] = useState<boolean>(() => isSafeMode(recordBootStart()));

  useEffect(() => {
    installGlobalErrorHandlers();
    addBreadcrumb("app boot");
    // If we stay up a few seconds, this boot was healthy — reset the strike count.
    const t = setTimeout(() => markStable(), 4000);
    return () => clearTimeout(t);
  }, []);

  if (safe) {
    return (
      <SafeModeScreen
        onRecover={() => {
          markStable();
          setSafe(false);
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <ErrorBoundary>
        {/* No-skip first-run persona gate (Task 8) wraps the whole app. */}
        <PersonaGate>
          {(persona, onPersonaChange) => <AppShell persona={persona} onPersonaChange={onPersonaChange} />}
        </PersonaGate>
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  safe: { flex: 1, padding: tokens.space.xl, backgroundColor: tokens.color.bg, gap: tokens.space.md, justifyContent: "center" },
  safeTitle: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  safeBody: { fontSize: tokens.font.size.md, color: tokens.color.textSecondary },
  safeCause: { fontSize: tokens.font.size.sm, color: tokens.color.negative },
  safeRow: { flexDirection: "row", gap: tokens.space.md, marginTop: tokens.space.md },
  primaryBtn: { backgroundColor: tokens.color.primary, paddingVertical: tokens.space.md, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.md },
  primaryBtnText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },
  secondaryBtn: { paddingVertical: tokens.space.md, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border },
  secondaryBtnText: { color: tokens.color.textPrimary, fontWeight: tokens.font.weight.medium },
});
