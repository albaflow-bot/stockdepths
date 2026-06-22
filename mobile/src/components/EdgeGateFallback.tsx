import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from "react-native";
import { tokens, cardShadow } from "../theme/tokens";
import { TextField } from "./TextField";
import { addBreadcrumb } from "../resilience/errorLog";
import { candidateBadge, type EdgeCandidate, type EdgeGateResult } from "../types/edge";

/** Matches the server's customEdge MIN_LEN — keep in sync. */
const MIN_CUSTOM_LEN = 4;

type Mode = "candidate" | "custom" | "skip" | null;

export interface EdgeGateFallbackProps {
  visible: boolean;
  /** The gate result; expected `edgeFound=false`. Candidates may exist (all ⚠/❌). */
  result: EdgeGateResult;
  /** Option 1 — choose a provided candidate (informed override, SPEC §5.4). */
  onSelectCandidate: (edgeId: string) => void;
  /** Option 2 — submit a user-typed edge (validated + keyword-extracted server-side). */
  onSubmitCustom: (text: string) => void;
  /** Option 3 — proceed with no edge (general SPEC). */
  onSkip: () => void;
  /** Disable actions while a request is in flight. */
  busy?: boolean;
}

/**
 * §5.4 three-way fallback shown when the gate finds no eligible edge
 * (`has_edge_candidate=false` — 0 candidates, or all ⚠/❌). The user must still face a
 * decision (차단형, 강제진행 — ESC blocked), but the conclusion is theirs:
 *  1. 제공된 후보에서 선택 (있으면) — informed override over a dropped/⚠ candidate.
 *  2. 직접 엣지 입력 (텍스트) — server validates + extracts keywords.
 *  3. 엣지 스킵 진행 (일반 SPEC) — go straight to the SPEC flow.
 */
export function EdgeGateFallback({
  visible,
  result,
  onSelectCandidate,
  onSubmitCustom,
  onSkip,
  busy = false,
}: EdgeGateFallbackProps) {
  const candidates = result.candidates ?? [];
  const hasCandidates = candidates.length > 0;
  const [mode, setMode] = useState<Mode>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");

  // 강제진행: swallow ESC on web so the fallback can't be dismissed without a choice.
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        addBreadcrumb("edge-gate fallback ESC blocked (강제진행)");
      }
    };
    doc.addEventListener("keydown", onKey, true);
    return () => doc.removeEventListener("keydown", onKey, true);
  }, [visible]);

  if (!visible) return null;

  const customValid = customText.trim().length >= MIN_CUSTOM_LEN;

  return (
    <View style={styles.backdrop} testID="edge-gate-fallback" accessibilityRole="none">
      <View style={styles.sheet}>
        <Text style={styles.title}>엣지를 찾지 못했습니다</Text>
        <Text style={styles.subtitle}>
          {result.notFoundReason ?? "검증된 엣지 후보를 찾지 못했습니다."} 어떻게 진행할지 직접
          선택해 주세요. (건너뛸 수는 없습니다.)
        </Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {/* Option 1 — pick a provided candidate (only when some exist). */}
          {hasCandidates ? (
            <OptionBlock
              testID="fallback-option-candidate"
              active={mode === "candidate"}
              title="① 제공된 후보에서 선택"
              subtitle="자동 검증을 통과하진 못했지만, 직접 판단해 고를 수 있습니다."
              onPress={() => setMode("candidate")}
            >
              {candidates.map((c) => (
                <CandidatePickRow
                  key={c.id}
                  candidate={c}
                  selected={pickedId === c.id}
                  onPress={() => setPickedId(c.id)}
                />
              ))}
              <ActionButton
                label="이 후보로 진행"
                testID="fallback-candidate-confirm"
                disabled={busy || !pickedId}
                onPress={() => pickedId && onSelectCandidate(pickedId)}
              />
            </OptionBlock>
          ) : null}

          {/* Option 2 — type your own edge. */}
          <OptionBlock
            testID="fallback-option-custom"
            active={mode === "custom"}
            title="② 직접 엣지 입력"
            subtitle="데이터 소스와 활용 파이프라인을 직접 적어 주세요. (예: 거래소 공시 RSS → 매일 크롤·정규화)"
            onPress={() => setMode("custom")}
          >
            <TextField
              label="엣지 설명"
              value={customText}
              onChangeText={setCustomText}
              placeholder="구체적 데이터 소스 + 자동화 파이프라인"
              testID="fallback-custom-input"
              errorText={customText.length > 0 && !customValid ? `최소 ${MIN_CUSTOM_LEN}자 이상 입력해 주세요.` : undefined}
            />
            <ActionButton
              label="검증 후 진행"
              testID="fallback-custom-submit"
              disabled={busy || !customValid}
              onPress={() => onSubmitCustom(customText.trim())}
            />
          </OptionBlock>

          {/* Option 3 — skip the edge entirely. */}
          <OptionBlock
            testID="fallback-option-skip"
            active={mode === "skip"}
            title="③ 엣지 스킵 진행"
            subtitle="엣지 없이 일반 SPEC 인터뷰로 바로 진행합니다."
            onPress={() => setMode("skip")}
          >
            <ActionButton
              label="엣지 없이 진행"
              testID="fallback-skip-confirm"
              disabled={busy}
              onPress={onSkip}
            />
          </OptionBlock>
        </ScrollView>
      </View>
    </View>
  );
}

function OptionBlock({
  active,
  title,
  subtitle,
  onPress,
  children,
  testID,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={[styles.option, active ? styles.optionActive : null]} testID={testID}>
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: active }}>
        <Text style={[styles.optionTitle, active ? styles.optionTitleActive : null]}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </Pressable>
      {active ? <View style={styles.optionBody}>{children}</View> : null}
    </View>
  );
}

function CandidatePickRow({
  candidate,
  selected,
  onPress,
}: {
  candidate: EdgeCandidate;
  selected: boolean;
  onPress: () => void;
}) {
  const badge = candidateBadge(candidate);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      testID={`fallback-candidate-${candidate.id}`}
      style={[styles.pickRow, selected ? styles.pickRowSelected : null]}
    >
      <View style={styles.pickRowHead}>
        <Text style={styles.pickTitle}>{candidate.title}</Text>
        <Text style={styles.pickBadge}>{badge.label}</Text>
      </View>
      <Text style={styles.pickSource}>{candidate.dataSource}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      style={[styles.btn, disabled ? styles.btnDisabled : null]}
    >
      <Text style={[styles.btnText, disabled ? styles.btnTextDisabled : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space.lg,
    zIndex: 1000,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: tokens.color.bg,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
    ...cardShadow,
  },
  title: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  subtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 20 },
  list: { marginVertical: tokens.space.sm },
  listContent: { gap: tokens.space.md },
  option: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: tokens.space.xs,
  },
  optionActive: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surfaceAlt },
  optionTitle: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  optionTitleActive: { color: tokens.color.primary },
  optionSubtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 18 },
  optionBody: { marginTop: tokens.space.md, gap: tokens.space.md },
  pickRow: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    gap: 2,
  },
  pickRowSelected: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surface },
  pickRowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pickTitle: { flex: 1, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  pickBadge: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.warningFg },
  pickSource: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary },
  btn: {
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.md,
    alignItems: "center",
  },
  btnDisabled: { backgroundColor: tokens.color.mutedBg },
  btnText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.primaryText },
  btnTextDisabled: { color: tokens.color.textMuted },
});
