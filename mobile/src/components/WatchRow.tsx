import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { Badge } from "./Badge";
import { fmtMoney, fmtSignedPct, returnTone } from "../formatters";
import type { Quote } from "../data/quotesClient";

export interface WatchRowProps {
  symbol: string;
  quote?: Quote;
  onRemove: (symbol: string) => void;
}

/** A single watchlist row: symbol, current price + change, and a remove action. */
export function WatchRow({ symbol, quote, onRemove }: WatchRowProps) {
  return (
    <View style={styles.row} testID={`watch-row-${symbol}`}>
      <Text style={styles.symbol}>{symbol}</Text>
      <View style={styles.right}>
        <Text style={styles.price}>{quote ? fmtMoney(quote.price) : "시세 —"}</Text>
        {quote?.changePercent != null ? (
          <Badge text={fmtSignedPct(quote.changePercent)} tone={returnTone(quote.changePercent)} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${symbol} 관심종목 삭제`}
          onPress={() => onRemove(symbol)}
          testID={`watch-remove-${symbol}`}
          style={styles.remove}
        >
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    marginBottom: tokens.space.sm,
  },
  symbol: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  right: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  price: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  remove: { paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xs },
  removeText: { fontSize: tokens.font.size.md, color: tokens.color.textMuted },
});
