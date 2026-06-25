/**
 * 검색 결과 카드 (SPEC §3.2-Δ A 와이어프레임). 한 종목:
 *  - 종목명 + 코드 + 시장
 *  - 오늘 주가 + ▲▼ + 등락률 (시장별 색상; 색만으로 구분 ✗ → ▲▼ 병기)
 *  - 최근 7일 미니 스파크라인
 *  - 타이밍 한 줄 신호 + 근거 (있을 때만 — 근거 없는 신호 렌더 ✗)
 *  - [＋ 관심] / [＋ 보유] 원터치 (담김 ✓ 상태 표시)
 *
 * 정보 나열로 끝나지 않게, 신호가 있으면 한 줄 행동으로 환원한다(learnings 정합).
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { Sparkline } from "./Sparkline";
import { marketDirectionColor, changeArrow } from "./marketColors";
import { fmtSignedPct } from "../formatters";
import {
  displayName,
  isKrMarket,
  marketLabel,
  type SecuritySearchItem,
} from "../types/security";

export interface SecuritySearchCardProps {
  item: SecuritySearchItem;
  /** 이미 관심목록에 있는지. */
  watched: boolean;
  /** 이미 보유목록에 있는지. */
  held: boolean;
  onAddWatch: (item: SecuritySearchItem) => void;
  onAddHolding: (item: SecuritySearchItem) => void;
  /** 카드 상단 작은 배지(예: "이례신호 초대형주"). 없으면 미표시. */
  badgeText?: string;
  testID?: string;
}

/** 시장별 가격 표기: KR 은 원(정수·콤마), US 는 $(소수 2자리). */
export function formatPrice(item: Pick<SecuritySearchItem, "market" | "last">): string {
  if (item.last == null || !Number.isFinite(item.last)) return "—";
  if (isKrMarket(item.market)) {
    return `${Math.round(item.last).toLocaleString("ko-KR")}원`;
  }
  return `$${item.last.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SecuritySearchCard({
  item,
  watched,
  held,
  onAddWatch,
  onAddHolding,
  badgeText,
  testID,
}: SecuritySearchCardProps) {
  const tid = testID ?? `search-card-${item.market}-${item.code}`;
  const color = marketDirectionColor(item.market, item.direction);
  const arrow = changeArrow(item.direction);
  const hasSignal = !!item.signal && !!item.signal.label?.trim() && !!item.signal.reason?.trim();

  return (
    <View style={styles.card} testID={tid}>
      {badgeText ? (
        <View style={styles.badge} testID={`${tid}-badge`}>
          <Text style={styles.badgeText}>⚡ {badgeText}</Text>
        </View>
      ) : null}

      {/* 종목명 · 코드 · 시장 */}
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName(item)}
        </Text>
        <Text style={styles.code}>{item.code}</Text>
        <Text style={styles.market}>· {marketLabel(item.market)}</Text>
      </View>

      {/* 오늘 주가 + ▲▼ + 등락률 */}
      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatPrice(item)}</Text>
        <Text style={[styles.change, { color }]} testID={`${tid}-change`}>
          {arrow} {fmtSignedPct(item.change_pct)} (오늘)
        </Text>
      </View>

      {/* 최근 7일 추이 */}
      <Sparkline closes={item.weekly} market={item.market} testID={`${tid}-spark`} />

      {/* 타이밍 한 줄 신호 (근거 동반, 있을 때만) */}
      {hasSignal ? (
        <View style={styles.signal} testID={`${tid}-signal`}>
          <Text style={styles.signalLabel}>한 줄 신호: {item.signal!.label}</Text>
          <Text style={styles.signalReason}>· {item.signal!.reason}</Text>
        </View>
      ) : null}

      {/* ＋관심 / ＋보유 */}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: watched }}
          accessibilityLabel={`${displayName(item)} 관심목록에 추가`}
          onPress={() => onAddWatch(item)}
          style={[styles.btn, watched ? styles.btnDone : styles.btnWatch]}
          testID={`${tid}-watch`}
        >
          <Text style={[styles.btnText, watched ? styles.btnTextDone : styles.btnTextWatch]}>
            {watched ? "관심 담김 ✓" : "＋ 관심"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: held }}
          accessibilityLabel={`${displayName(item)} 보유목록에 추가`}
          onPress={() => onAddHolding(item)}
          style={[styles.btn, held ? styles.btnDone : styles.btnHold]}
          testID={`${tid}-hold`}
        >
          <Text style={[styles.btnText, held ? styles.btnTextDone : styles.btnTextHold]}>
            {held ? "보유 담김 ✓" : "＋ 보유"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
    gap: tokens.space.sm,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: tokens.color.warningBg,
    borderRadius: tokens.radius.pill,
    paddingVertical: 2,
    paddingHorizontal: tokens.space.sm,
  },
  badgeText: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.warningFg },
  headerRow: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.xs, flexWrap: "wrap" },
  name: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, flexShrink: 1 },
  code: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  market: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },

  priceRow: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.sm },
  price: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  change: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },

  signal: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.xs, flexWrap: "wrap" },
  signalLabel: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  signalReason: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, flexShrink: 1 },

  actions: { flexDirection: "row", gap: tokens.space.sm },
  btn: { flex: 1, paddingVertical: tokens.space.sm, borderRadius: tokens.radius.pill, alignItems: "center", borderWidth: 1.5 },
  btnWatch: { backgroundColor: tokens.color.surface, borderColor: tokens.color.primary },
  btnHold: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  btnDone: { backgroundColor: tokens.color.surfaceAlt, borderColor: tokens.color.border },
  btnText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  btnTextWatch: { color: tokens.color.primary },
  btnTextHold: { color: tokens.color.primaryText },
  btnTextDone: { color: tokens.color.textMuted },
});
