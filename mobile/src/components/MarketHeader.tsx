/**
 * MarketHeader — the shared 지수 요약 바 (SPEC §5.2-1). Rendered atop both the 홈 and
 * the 관심·보유 탭; it is the FIRST device that keeps the screen alive even with an
 * empty 보유 목록 (SPEC §5.5-1).
 *
 * Shows 코스피/코스닥(KR) + 나스닥/S&P(US) with 전일대비·등락률. Consumes the index
 * output of the market-data collection task (`types/market.ts` ← server overview).
 * NO macro indicators (환율·금리·유가 …) — §5.7 비채택.
 *
 * Up/down color follows the SAME identity-separated rule as TimingBadge: the calm
 * semantic palette (positive green / negative red / muted), never the identity color
 * (`tokens.color.primary`) and never changed by gamification/flavor.
 *
 * Loading: NOT a bare spinner — the caller passes the last cached value so the bar
 * renders the PREVIOUS numbers immediately, with a small 갱신 중 indicator while a
 * refresh is in flight (BinDesk playbook). It only shows a placeholder when there is
 * no cached value at all.
 */

import { View, Text, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import type { MarketIndex } from "../types/market";

export interface MarketHeaderProps {
  /** Index rows to render (typically the cached-or-fresh value). */
  indices: MarketIndex[];
  /**
   * Optional symbol order/filter — e.g. ["^KS11","^KQ11"] for a KR-only bar, or
   * omit to show every provided index. Lets 홈/탭 reuse the component with different
   * 표시 종목 구성 (props-configurable, SPEC requirement).
   */
  symbols?: string[];
  /** A refresh is in flight over the shown (cached) value → show 갱신 중. */
  updating?: boolean;
  /** Showing a stale cached value after a failed refresh. */
  stale?: boolean;
  testID?: string;
}

/** Up/down/zero color — semantic palette, identity-separated (same rule as TimingBadge). */
export function indexChangeColor(changePercent: number): string {
  if (!Number.isFinite(changePercent) || changePercent === 0) return tokens.color.textMuted;
  return changePercent > 0 ? tokens.color.positive : tokens.color.negative;
}

/** Order/filter indices by an optional symbol list (case-insensitive). */
export function selectIndices(indices: MarketIndex[], symbols?: string[]): MarketIndex[] {
  if (!symbols || symbols.length === 0) return indices;
  const want = symbols.map((s) => s.toUpperCase());
  const bySym = new Map(indices.map((i) => [i.symbol.toUpperCase(), i]));
  return want.map((s) => bySym.get(s)).filter((i): i is MarketIndex => !!i);
}

function fmtIndexValue(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "+60.00 (+1.20%)" / "-12.30 (-0.45%)" — signed, paired absolute + percent. */
function fmtChange(change: number, changePercent: number): string {
  const sign = changePercent >= 0 ? "+" : "";
  const absSign = change >= 0 ? "+" : "";
  return `${absSign}${fmtIndexValue(change)} (${sign}${Number.isFinite(changePercent) ? changePercent.toFixed(2) : "—"}%)`;
}

/** "YYYY-MM-DD" → "M/D" for the compact 기준일 label. */
function shortDate(asOf: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf);
  if (!m) return asOf;
  return `${Number(m[2])}/${Number(m[3])}`;
}

function IndexCell({ index, testID }: { index: MarketIndex; testID: string }) {
  const color = indexChangeColor(index.changePercent);
  return (
    <View style={styles.cell} testID={testID}>
      <Text style={styles.name} numberOfLines={1}>
        {index.name}
      </Text>
      <Text style={[styles.price, { color }]}>{fmtIndexValue(index.price)}</Text>
      <Text style={[styles.change, { color }]}>{fmtChange(index.change, index.changePercent)}</Text>
    </View>
  );
}

export function MarketHeader({ indices, symbols, updating = false, stale = false, testID = "market-header" }: MarketHeaderProps) {
  const shown = selectIndices(indices, symbols);
  const asOf = shown.map((i) => i.asOf).filter(Boolean).sort().pop();
  const anyDelayed = shown.some((i) => i.delayed);

  return (
    <View style={styles.bar} testID={testID}>
      <View style={styles.metaRow}>
        <Text style={styles.title}>오늘의 시장</Text>
        <View style={styles.metaRight}>
          {asOf ? <Text style={styles.meta} testID={`${testID}-asof`}>기준 {shortDate(asOf)}{anyDelayed ? " · 지연" : ""}</Text> : null}
          {updating ? <Text style={[styles.meta, styles.updating]} testID={`${testID}-updating`}>● 갱신 중</Text> : null}
          {!updating && stale ? <Text style={styles.meta} testID={`${testID}-stale`}>· 캐시</Text> : null}
        </View>
      </View>

      {shown.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cells}>
          {shown.map((i) => (
            <IndexCell key={i.symbol} index={i} testID={`${testID}-index-${i.symbol}`} />
          ))}
        </ScrollView>
      ) : (
        // No cached value yet — a quiet placeholder, never a blank bar or bare spinner.
        <Text style={styles.placeholder} testID={`${testID}-placeholder`}>
          {updating ? "시장 지수를 불러오는 중…" : "시장 지수를 준비하고 있어요."}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    gap: tokens.space.sm,
  },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  metaRight: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  meta: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  updating: { color: tokens.color.warning, fontWeight: tokens.font.weight.medium },

  cells: { gap: tokens.space.xl, paddingRight: tokens.space.lg },
  cell: { gap: 2, minWidth: 96 },
  name: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary },
  price: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold },
  change: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.medium },

  placeholder: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted },
});
