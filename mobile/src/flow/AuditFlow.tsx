import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { tokens, cardShadow } from "../theme/tokens";
import { LoadingView, ErrorView } from "../components/StateViews";
import { EdgeGateModal } from "../components/EdgeGateModal";
import { EdgeGateFallback } from "../components/EdgeGateFallback";
import { useAuditFlow, type AuditFlowController, type UseAuditFlowOptions } from "../state/auditSession";

export interface AuditFlowProps extends UseAuditFlowOptions {
  /** Inject a controller for tests; otherwise the hook builds one. */
  controller?: AuditFlowController;
}

/**
 * Audit flow page (Task 6) — drives Phase 77 → 엣지 게이트 → SPEC 인터뷰 off the
 * {@link useAuditFlow} state machine. Each phase renders the matching surface; the
 * gate decision optimistically advances to spec_interview and recovers on failure.
 */
export function AuditFlow(props: AuditFlowProps) {
  // Hooks must run unconditionally; the injected controller (tests) wins afterward.
  const hookController = useAuditFlow(props);
  const ctrl = props.controller ?? hookController;
  const { state } = ctrl;

  return (
    <View style={styles.root} testID="audit-flow">
      {/* A failed select rolls back to edge_gate but keeps the gate result; surface it. */}
      {state.error && state.gate ? (
        <View style={styles.errorBanner} testID="audit-error-banner">
          <Text style={styles.errorText}>{state.error}</Text>
        </View>
      ) : null}

      {state.phase === "phase77" ? (
        <Phase77Step onComplete={ctrl.completePhase77} busy={state.busy} />
      ) : null}

      {state.phase === "edge_gate" ? (
        <EdgeGatePhase ctrl={ctrl} />
      ) : null}

      {state.phase === "spec_interview" ? (
        state.interview ? (
          <SpecInterviewStep questions={state.interview.questions} edgeId={state.interview.selectedEdgeId} />
        ) : (
          <LoadingView />
        )
      ) : null}

      {state.phase === "spec_finalized" ? (
        <FinalizedStep embeddedSpec={state.interview?.embeddedSpec ?? null} />
      ) : null}
    </View>
  );
}

function Phase77Step({ onComplete, busy }: { onComplete: () => void; busy: boolean }) {
  return (
    <View style={styles.card} testID="phase77-step">
      <Text style={styles.title}>강제질문 게이트 (Phase 77)</Text>
      <Text style={styles.body}>강제질문을 모두 마치면 공학 엣지 게이트로 진입합니다.</Text>
      <Pressable
        onPress={onComplete}
        disabled={busy}
        accessibilityRole="button"
        testID="phase77-complete"
        style={[styles.primaryBtn, busy ? styles.btnDisabled : null]}
      >
        <Text style={styles.primaryBtnText}>강제질문 완료 → 엣지 게이트</Text>
      </Pressable>
    </View>
  );
}

function EdgeGatePhase({ ctrl }: { ctrl: AuditFlowController }) {
  const { state } = ctrl;
  if (state.busy && !state.gate) return <LoadingView />;
  if (state.error && !state.gate) return <ErrorView message={state.error} onRetry={ctrl.loadGate} />;
  if (!state.gate) return <LoadingView />;

  if (state.gate.edgeFound) {
    return (
      <EdgeGateModal
        visible
        result={state.gate}
        onAccept={ctrl.accept}
        onOverride={ctrl.override}
        onSkip={ctrl.skip}
      />
    );
  }
  return (
    <EdgeGateFallback
      visible
      result={state.gate}
      busy={state.busy}
      onSelectCandidate={ctrl.override}
      onSubmitCustom={ctrl.submitCustom}
      onSkip={ctrl.skip}
    />
  );
}

function SpecInterviewStep({
  questions,
  edgeId,
}: {
  questions: { id: string; prompt: string }[];
  edgeId: string | null;
}) {
  return (
    <ScrollView contentContainerStyle={styles.card} testID="spec-interview-step">
      <Text style={styles.title}>엣지-aware 세부 SPEC 인터뷰</Text>
      <Text style={styles.body}>
        {edgeId
          ? "선택한 엣지를 반영한 질문으로 SPEC 인터뷰를 시작합니다."
          : "엣지 없이 일반 SPEC 인터뷰를 시작합니다."}
      </Text>
      {questions.map((q, i) => (
        <View key={q.id} style={styles.question} testID={`spec-question-${q.id}`}>
          <Text style={styles.questionText}>
            {i + 1}. {q.prompt}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function FinalizedStep({ embeddedSpec }: { embeddedSpec: string | null }) {
  return (
    <ScrollView contentContainerStyle={styles.card} testID="spec-finalized-step">
      <Text style={styles.title}>SPEC 확정</Text>
      <Text style={styles.mono}>{embeddedSpec ?? "(임베드된 SPEC 없음)"}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.space.lg, gap: tokens.space.md },
  errorBanner: {
    backgroundColor: tokens.color.negativeBg,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  errorText: { color: tokens.color.negativeFg, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: tokens.space.md,
    ...cardShadow,
  },
  title: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  body: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 20 },
  question: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  questionText: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, lineHeight: 22 },
  mono: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold, fontSize: tokens.font.size.sm },
  btnDisabled: { backgroundColor: tokens.color.mutedBg },
});
