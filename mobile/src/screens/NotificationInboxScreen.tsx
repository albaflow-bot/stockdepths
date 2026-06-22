import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { NotificationCard } from "../components/NotificationCard";
import { LoadingView } from "../components/StateViews";
import { useInbox, type UseInboxDeps } from "./useInbox";
import type { NotificationKind } from "../notifications/types";
import { NotificationPrefsRepository } from "../notifications/prefs";
import { trackAlertOptIn } from "../analytics/analytics";

type Filter = "all" | NotificationKind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "daily_digest", label: "추천" },
  { key: "alert", label: "알림" },
];

export interface NotificationInboxScreenProps extends UseInboxDeps {
  /** Current time (ms) for relative timestamps — injectable for tests. */
  nowMs?: number;
  /** Opt-in preference store (tests inject one). */
  prefsRepository?: NotificationPrefsRepository;
}

/**
 * 알림함 tab — history of delivered daily digests and event-driven target/
 * stop-loss alerts with their one-line contextual advice (SPEC Task 10).
 */
export function NotificationInboxScreen({ repository, nowMs, prefsRepository }: NotificationInboxScreenProps) {
  const { status, items, unreadCount, markRead, markAllRead } = useInbox({ repository });
  const [filter, setFilter] = useState<Filter>("all");
  const now = nowMs ?? Date.now();

  // Alert opt-in (drives the alert_opt_in funnel event).
  const prefs = useMemo(() => prefsRepository ?? new NotificationPrefsRepository(), [prefsRepository]);
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    prefs.isOptedIn().then((v) => active && setOptedIn(v));
    return () => {
      active = false;
    };
  }, [prefs]);

  const enableAlerts = async () => {
    await prefs.setOptedIn(true);
    setOptedIn(true);
    trackAlertOptIn();
  };

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="inbox-screen">
      <View style={styles.headerRow}>
        <Text style={styles.title}>알림함</Text>
        {unreadCount > 0 ? (
          <Pressable accessibilityRole="button" onPress={markAllRead} testID="mark-all-read">
            <Text style={styles.markAll}>모두 읽음 ({unreadCount})</Text>
          </Pressable>
        ) : null}
      </View>

      {optedIn === false ? (
        <View style={styles.optinBanner} testID="alert-optin-banner">
          <Text style={styles.optinText}>보유 종목의 목표가·손절선 알림을 받아보세요.</Text>
          <Pressable
            style={styles.optinBtn}
            accessibilityRole="button"
            onPress={enableAlerts}
            testID="alert-optin-button"
          >
            <Text style={styles.optinBtnText}>알림 받기</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.filterBar} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={f.label}
              testID={`inbox-filter-${f.key}`}
              style={[styles.segment, active ? styles.segmentActive : null]}
            >
              <Text style={[styles.segmentLabel, active ? styles.segmentLabelActive : null]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {status === "loading" ? (
        <LoadingView />
      ) : filtered.length === 0 ? (
        <View style={styles.empty} testID="inbox-empty">
          <Text style={styles.emptyTitle}>알림이 없습니다</Text>
          <Text style={styles.emptyText}>
            매일 아침 추천 다이제스트와 보유 종목의 목표가·손절선 알림이 여기에 쌓입니다.
          </Text>
        </View>
      ) : (
        filtered.map((item) => <NotificationCard key={item.id} item={item} nowMs={now} onPress={markRead} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: tokens.space.md },
  title: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  markAll: { fontSize: tokens.font.size.sm, color: tokens.color.primary, fontWeight: tokens.font.weight.bold },
  optinBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.md,
    backgroundColor: tokens.color.neutralBg,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.md,
  },
  optinText: { flex: 1, fontSize: tokens.font.size.sm, color: tokens.color.neutralFg },
  optinBtn: { backgroundColor: tokens.color.primary, paddingVertical: tokens.space.sm, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.md },
  optinBtnText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold, fontSize: tokens.font.size.sm },
  filterBar: { flexDirection: "row", backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.md, padding: tokens.space.xs, marginBottom: tokens.space.lg },
  segment: { flex: 1, paddingVertical: tokens.space.sm, alignItems: "center", borderRadius: tokens.radius.sm },
  segmentActive: { backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.primary },
  segmentLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  segmentLabelActive: { color: tokens.color.primary, fontWeight: tokens.font.weight.bold },
  empty: { alignItems: "center", paddingVertical: tokens.space.xxl, gap: tokens.space.sm },
  emptyTitle: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  emptyText: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, textAlign: "center" },
});
