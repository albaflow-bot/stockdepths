import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { TextField } from "./TextField";

export interface AddWatchFormProps {
  /** Returns an error message to display, or null/undefined on success. */
  onAdd: (symbol: string) => Promise<string | null> | string | null;
}

/** A compact "add to watchlist" row: symbol input + 추가 button. */
export function AddWatchForm({ onAdd }: AddWatchFormProps) {
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async () => {
    const result = await onAdd(symbol);
    if (result) {
      setError(result);
      return;
    }
    setError(undefined);
    setSymbol("");
  };

  return (
    <View style={styles.row}>
      <View style={styles.input}>
        <TextField
          label="관심종목 추가"
          value={symbol}
          onChangeText={setSymbol}
          placeholder="예: AAPL"
          autoCapitalize="characters"
          testID="watch-symbol-input"
          errorText={error}
        />
      </View>
      <Pressable style={styles.button} accessibilityRole="button" onPress={submit} testID="watch-add-button">
        <Text style={styles.buttonText}>추가</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.sm, marginBottom: tokens.space.md },
  input: { flex: 1 },
  button: {
    marginTop: 18,
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.md,
  },
  buttonText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },
});
