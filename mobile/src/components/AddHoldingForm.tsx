import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { TextField } from "./TextField";
import type { HoldingInput } from "../portfolio/types";

export interface AddHoldingFormProps {
  /** Returns an error message to display, or null/undefined on success. */
  onAdd: (input: HoldingInput) => Promise<string | null> | string | null;
  /** Prefill the symbol (e.g. chosen from search — code 없이 담기 흐름). */
  initialSymbol?: string;
  /** Lock the symbol field read-only (search 로 이미 종목을 고른 경우). */
  lockSymbol?: boolean;
  /** Override the card title (e.g. "삼성전자 보유 추가"). */
  title?: string;
}

/** Form to add a holding: symbol + cost basis (required) + quantity (optional). */
export function AddHoldingForm({ onAdd, initialSymbol, lockSymbol, title }: AddHoldingFormProps) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async () => {
    const costNum = Number(cost);
    if (!cost.trim() || !Number.isFinite(costNum) || costNum <= 0) {
      setError("매수가를 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    const qtyNum = qty.trim() ? Number(qty) : undefined;
    if (qtyNum !== undefined && (!Number.isFinite(qtyNum) || qtyNum <= 0)) {
      setError("수량은 0보다 큰 숫자여야 합니다.");
      return;
    }
    const result = await onAdd({ symbol, costBasis: costNum, quantity: qtyNum });
    if (result) {
      setError(result);
      return;
    }
    setError(undefined);
    if (!lockSymbol) setSymbol(""); // 검색에서 고른 종목은 유지(잠금)
    setCost("");
    setQty("");
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title ?? "보유 종목 추가"}</Text>
      {lockSymbol ? (
        <View style={styles.lockedSymbol} testID="holding-symbol-locked">
          <Text style={styles.lockedLabel}>종목</Text>
          <Text style={styles.lockedValue}>{symbol}</Text>
        </View>
      ) : (
        <TextField
          label="종목"
          value={symbol}
          onChangeText={setSymbol}
          placeholder="예: AAPL"
          autoCapitalize="characters"
          testID="holding-symbol-input"
        />
      )}
      <View style={styles.row}>
        <View style={styles.col}>
          <TextField
            label="매수가"
            value={cost}
            onChangeText={setCost}
            placeholder="예: 150.25"
            keyboardType="decimal-pad"
            testID="holding-cost-input"
          />
        </View>
        <View style={styles.col}>
          <TextField
            label="수량 (선택)"
            value={qty}
            onChangeText={setQty}
            placeholder="예: 10"
            keyboardType="decimal-pad"
            testID="holding-qty-input"
          />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} accessibilityRole="button" onPress={submit} testID="holding-add-button">
        <Text style={styles.buttonText}>보유 추가</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.md,
    marginBottom: tokens.space.md,
  },
  title: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  lockedSymbol: { gap: tokens.space.xs },
  lockedLabel: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  lockedValue: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  row: { flexDirection: "row", gap: tokens.space.md },
  col: { flex: 1 },
  error: { fontSize: tokens.font.size.sm, color: tokens.color.negative },
  button: {
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.md,
    alignItems: "center",
  },
  buttonText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },
});
