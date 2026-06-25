import { useMemo, useState, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { DiscoveryScreen } from "../screens/DiscoveryScreen";
import { SecuritySearchScreen } from "../screens/SecuritySearchScreen";
import { WatchlistTab } from "../screens/WatchlistTab";
import { ScorecardScreen } from "../screens/ScorecardScreen";
import { NotificationInboxScreen } from "../screens/NotificationInboxScreen";
import { LegalScreen } from "../screens/LegalScreen";
import { PersonaSetupScreen } from "../screens/PersonaSetupScreen";
import { DecisionQueueScreen } from "../screens/DecisionQueueScreen";
import type { PersonaConfig } from "../persona/types";

interface Tab {
  key: string;
  label: string;
  render: () => ReactNode;
}

/** 하단 바에 노출되는 1급 탭. 나머지는 '더보기' 허브로. */
const PRIMARY_KEYS = new Set(["home", "search", "portfolio", "scorecard", "more"]);
const SECONDARY_KEYS = new Set(["inbox", "persona", "decisions", "legal"]);

/** '더보기' 허브 — 보조 화면(알림함·내 성향·결정 대기·약관) 목록. 탭하면 해당 화면으로. */
function MoreScreen({ items, onOpen }: { items: Tab[]; onOpen: (key: string) => void }) {
  return (
    <View style={styles.moreScreen} testID="more-screen">
      <Text style={styles.moreTitle}>더보기</Text>
      {items.map((it) => (
        <Pressable
          key={it.key}
          style={styles.moreRow}
          accessibilityRole="button"
          onPress={() => onOpen(it.key)}
          testID={`more-${it.key}`}
        >
          <Text style={styles.moreRowLabel}>{it.label}</Text>
          <Text style={styles.moreRowChevron}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

export interface AppShellProps {
  /** The active persona (set by the first-run gate) — used to match pick volatility. */
  persona?: PersonaConfig;
  /** Persist a persona change made from the 성향 tab. */
  onPersonaChange?: (config: PersonaConfig) => void | Promise<void>;
}

/**
 * Lightweight bottom-tab shell (no navigation dependency). Hosts the screens
 * delivered so far; later tasks (성적표/알림함) register additional tabs.
 */
export function AppShell({ persona, onPersonaChange }: AppShellProps) {
  const [activeKey, setActiveKey] = useState<string>("home");

  // 보조 화면은 하단 탭에서 빼고 '더보기' 허브로 모은다(8탭 → 5탭, 정보과잉 제거).
  const secondary = useMemo<Tab[]>(
    () => [
      { key: "inbox", label: "알림함", render: () => <NotificationInboxScreen /> },
      {
        key: "persona",
        label: "내 성향",
        render: () => <PersonaSetupScreen mode="edit" initial={persona} onSave={onPersonaChange ?? (() => {})} />,
      },
      { key: "decisions", label: "결정 대기", render: () => <DecisionQueueScreen /> },
      { key: "legal", label: "약관", render: () => <LegalScreen /> },
    ],
    [persona, onPersonaChange],
  );

  // 하단 바에 노출되는 1급 탭 5개 + (렌더 대상에만 포함되는) 보조 화면.
  const tabs = useMemo<Tab[]>(
    () => [
      { key: "home", label: "투데이", render: () => <DiscoveryScreen /> },
      { key: "search", label: "검색", render: () => <SecuritySearchScreen /> },
      { key: "portfolio", label: "내 종목", render: () => <WatchlistTab persona={persona} /> },
      { key: "scorecard", label: "성적표", render: () => <ScorecardScreen /> },
      { key: "more", label: "더보기", render: () => <MoreScreen items={secondary} onOpen={setActiveKey} /> },
      ...secondary,
    ],
    [persona, secondary],
  );
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]!;

  return (
    <View style={styles.shell}>
      <View style={styles.body}>{active.render()}</View>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {tabs.filter((t) => PRIMARY_KEYS.has(t.key)).map((tab) => {
          // 보조 화면이 열려 있으면 '더보기'를 활성으로 표시.
          const selected = tab.key === activeKey || (tab.key === "more" && SECONDARY_KEYS.has(activeKey));
          return (
            <Pressable
              key={tab.key}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setActiveKey(tab.key)}
              testID={`tab-${tab.key}`}
            >
              <Text style={[styles.tabLabel, selected ? styles.tabLabelActive : null]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: tokens.color.bg },
  body: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  tab: { flex: 1, paddingVertical: tokens.space.md, alignItems: "center" },
  tabLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, fontWeight: tokens.font.weight.medium },
  tabLabelActive: { color: tokens.color.primary, fontWeight: tokens.font.weight.bold },

  moreScreen: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.lg, gap: tokens.space.sm },
  moreTitle: {
    fontSize: tokens.font.size.xxl,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.textPrimary,
    marginBottom: tokens.space.sm,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
  },
  moreRowLabel: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.medium },
  moreRowChevron: { fontSize: tokens.font.size.lg, color: tokens.color.textMuted },
});
