import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { SelectableToggle } from "../components/SelectableToggle";
import { TextField } from "../components/TextField";
import { buildCustomConfig, buildPresetConfig } from "../persona/config";
import { PRESET_INFO } from "../persona/matching";
import { PRESET_THRESHOLDS, PersonaValidationError, type InvestorProfile, type PersonaConfig } from "../persona/types";

type Selection = InvestorProfile | "custom" | null;

export interface PersonaSetupScreenProps {
  onSave: (config: PersonaConfig) => void | Promise<void>;
  /** "first-run" is the no-skip gate; "edit" is the settable 성향 tab. */
  mode?: "first-run" | "edit";
  initial?: PersonaConfig;
  /** Injectable clock (tests). */
  now?: () => string;
}

function initialSelection(initial?: PersonaConfig): Selection {
  if (!initial) return null;
  return initial.mode === "custom" ? "custom" : (initial.profile ?? null);
}

export function PersonaSetupScreen({ onSave, mode = "first-run", initial, now }: PersonaSetupScreenProps) {
  const clock = now ?? (() => new Date().toISOString());
  const [selection, setSelection] = useState<Selection>(() => initialSelection(initial));
  const [target, setTarget] = useState(() =>
    initial?.mode === "custom" ? String(initial.targetReturnPct) : "",
  );
  const [stop, setStop] = useState(() => (initial?.mode === "custom" ? String(initial.stopLossPct) : ""));
  const [error, setError] = useState<string | undefined>(undefined);

  // Toggle: tapping the selected option clears it (no separate clear button).
  const toggle = (key: Exclude<Selection, null>) => {
    setSelection((prev) => (prev === key ? null : key));
    setError(undefined);
  };

  const submit = async () => {
    if (selection === null) {
      setError("투자 성향을 선택해 주세요.");
      return;
    }
    let config: PersonaConfig;
    try {
      config =
        selection === "custom"
          ? buildCustomConfig(Number(target), Number(stop), clock())
          : buildPresetConfig(selection, clock());
    } catch (err) {
      setError(err instanceof PersonaValidationError ? err.message : "성향을 확인해 주세요.");
      return;
    }
    setError(undefined);
    await onSave(config);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="persona-setup-screen">
      <Text style={styles.title}>{mode === "first-run" ? "투자 성향 설정" : "내 성향"}</Text>
      <Text style={styles.help}>
        {mode === "first-run"
          ? "맞춤 추천을 위해 투자 성향을 먼저 선택해 주세요. 이 단계는 건너뛸 수 없습니다."
          : "성향을 변경하면 추천 종목 매칭에 반영됩니다."}
      </Text>

      {PRESET_INFO.map((p) => {
        const t = PRESET_THRESHOLDS[p.profile];
        return (
          <SelectableToggle
            key={p.profile}
            selected={selection === p.profile}
            onPress={() => toggle(p.profile)}
            title={p.label}
            subtitle={`${p.summary} · 목표 +${t.target}% · 손절 -${t.stop}%`}
            testID={`persona-option-${p.profile}`}
          />
        );
      })}

      <SelectableToggle
        selected={selection === "custom"}
        onPress={() => toggle("custom")}
        title="직접 설정"
        subtitle="목표 수익률·손절선을 직접 입력"
        testID="persona-option-custom"
      >
        <TextField
          label="목표 수익률 (%)"
          value={target}
          onChangeText={setTarget}
          placeholder="예: 25"
          keyboardType="decimal-pad"
          testID="persona-target-input"
        />
        <TextField
          label="손절선 (%)"
          value={stop}
          onChangeText={setStop}
          placeholder="예: 12"
          keyboardType="decimal-pad"
          testID="persona-stop-input"
        />
      </SelectableToggle>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.saveBtn} accessibilityRole="button" onPress={submit} testID="persona-save-button">
        <Text style={styles.saveBtnText}>{mode === "first-run" ? "시작하기" : "성향 저장"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  title: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  help: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, marginTop: tokens.space.xs, marginBottom: tokens.space.lg },
  error: { fontSize: tokens.font.size.sm, color: tokens.color.negative, marginBottom: tokens.space.md },
  saveBtn: {
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.lg,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    marginTop: tokens.space.sm,
  },
  saveBtnText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold, fontSize: tokens.font.size.md },
});
