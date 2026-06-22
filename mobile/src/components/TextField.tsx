import { View, Text, TextInput, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  autoCapitalize?: "none" | "characters";
  testID?: string;
  errorText?: string;
}

/** A labeled text input following the design tokens (cards/inputs styling). */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  testID,
  errorText,
}: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, errorText ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        testID={testID}
        accessibilityLabel={label}
      />
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: tokens.space.xs },
  label: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  input: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    fontSize: tokens.font.size.md,
    color: tokens.color.textPrimary,
  },
  inputError: { borderColor: tokens.color.negative },
  error: { fontSize: tokens.font.size.xs, color: tokens.color.negative },
});
