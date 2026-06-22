import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens, cardShadow } from "../theme/tokens";
import { Badge } from "./Badge";
import { fmtMoney, fmtSignedMoney, fmtSignedPct, fmtQty, returnTone } from "../formatters";
import type { HoldingPnL } from "../portfolio/pnl";

export interface HoldingCardProps {
  pnl: HoldingPnL;
  onRemove: (id: string) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/** A holding card showing cost basis, current price, return %, and value/gain. */
export function HoldingCard({ pnl, onRemove }: HoldingCardProps) {
  return (
    <View style={styles.card} testID={`holding-card-${pnl.symbol}`}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{pnl.symbol}</Text>
        <View style={styles.headerRight}>
          {pnl.priced ? (
            <Badge text={fmtSignedPct(pnl.returnPct)} tone={returnTone(pnl.returnPct)} testID={`holding-return-${pnl.symbol}`} />
          ) : (
            <Text style={styles.pending}>시세 대기</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${pnl.symbol} 보유 삭제`}
            onPress={() => onRemove(pnl.id)}
            testID={`holding-remove-${pnl.symbol}`}
            style={styles.remove}
          >
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
      </View>

      <Row label="매수가" value={fmtMoney(pnl.costBasis)} />
      <Row label="현재가" value={pnl.priced ? fmtMoney(pnl.price) : "—"} />
      {pnl.quantity != null ? <Row label="수량" value={fmtQty(pnl.quantity)} /> : null}
      {pnl.marketValue != null ? <Row label="평가금액" value={fmtMoney(pnl.marketValue)} /> : null}
      {pnl.totalGain != null ? <Row label="평가손익" value={fmtSignedMoney(pnl.totalGain)} /> : null}
      {pnl.quantity == null ? <Text style={styles.note}>수량을 입력하면 평가금액·손익이 표시됩니다.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
    gap: tokens.space.xs,
    ...cardShadow,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: tokens.space.xs },
  symbol: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  headerRight: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  pending: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  remove: { paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xs },
  removeText: { fontSize: tokens.font.size.md, color: tokens.color.textMuted },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  detailLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  detailValue: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.medium },
  note: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: 2 },
});
