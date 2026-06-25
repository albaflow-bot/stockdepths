/**
 * '여기서 담기' row (SPEC §5.5-4) — a TOP/인기 종목 with its timing badge, added to
 * the watchlist by a SINGLE tap (toggle). The whole row toggles: tap to add (담기),
 * tap again to remove (담김 ✓). There is NO separate clear/remove button (memory
 * 정합 — one-tap toggle, like SelectableToggle).
 *
 * Every row reduces to a one-line timing signal via TimingBadge — never a bare
 * price list (정보 나열로 끝나면 미완성, SPEC §5.0).
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { TimingBadge } from "./TimingBadge";
import { fmtMoney, fmtSignedPct } from "../formatters";
import { indexChangeColor } from "./MarketHeader";
import type { TimingSignal } from "../types/timing";

export interface PickableStockRowProps {
  symbol: string;
  companyName?: string;
  price?: number;
  changePercent?: number;
  /** DailyBatch timing signal for this ticker (매수 적정/관망 …). */
  signal?: TimingSignal;
  /** Whether it's already in the watchlist (drives the 담김 ✓ state). */
  inWatchlist: boolean;
  /** One-tap toggle: add if absent, remove if present. */
  onToggle: (symbol: string) => void;
  testID?: string;
}

export function PickableStockRow({
  symbol,
  companyName,
  price,
  changePercent,
  signal,
  inWatchlist,
  onToggle,
  testID,
}: PickableStockRowProps) {
  const sym = symbol.toUpperCase();
  const tid = testID ?? `pick-row-${sym}`;
  const changeColor = changePercent != null ? indexChangeColor(changePercent) : tokens.color.textMuted;

  return (
    <Pressable
      onPress={() => onToggle(sym)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: inWatchlist }}
      accessibilityLabel={`${sym} ${inWatchlist ? "관심목록에서 빼기" : "관심목록에 담기"}`}
      style={[styles.row, inWatchlist ? styles.rowSelected : null]}
      testID={tid}
    >
      <View style={styles.top}>
        <View style={styles.left}>
          <Text style={styles.symbol}>{sym}</Text>
          {companyName ? <Text style={styles.company} numberOfLines={1}>{companyName}</Text> : null}
        </View>
        <View style={styles.right}>
          <Text style={styles.price}>{price != null ? fmtMoney(price) : "—"}</Text>
          {changePercent != null ? (
            <Text style={[styles.change, { color: changeColor }]}>{fmtSignedPct(changePercent)}</Text>
          ) : null}
          <View style={[styles.chip, inWatchlist ? styles.chipOn : null]} testID={`${tid}-toggle`}>
            <Text style={[styles.chipText, inWatchlist ? styles.chipTextOn : null]}>
              {inWatchlist ? "담김 ✓" : "담기 +"}
            </Text>
          </View>
        </View>
      </View>

      {/* The timing signal reduces the row to one actionable line. */}
      {signal ? <TimingBadge signal={signal} showSource={false} testID={`${tid}-timing`} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
    gap: tokens.space.sm,
  },
  rowSelected: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surfaceAlt },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.sm, flexShrink: 1 },
  symbol: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  company: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, flexShrink: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  price: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  change: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium },
  chip: {
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.neutralBg,
  },
  chipOn: { backgroundColor: tokens.color.primary },
  chipText: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.neutralFg },
  chipTextOn: { color: tokens.color.primaryText },
});
