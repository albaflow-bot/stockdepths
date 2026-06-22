import { useMemo, useState, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { TodaysPicksScreen } from "../screens/TodaysPicksScreen";
import { PortfolioScreen } from "../screens/PortfolioScreen";
import { ScorecardScreen } from "../screens/ScorecardScreen";
import { NotificationInboxScreen } from "../screens/NotificationInboxScreen";
import { LegalScreen } from "../screens/LegalScreen";
import { PersonaSetupScreen } from "../screens/PersonaSetupScreen";
import type { PersonaConfig } from "../persona/types";

interface Tab {
  key: string;
  label: string;
  render: () => ReactNode;
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
  const tabs = useMemo<Tab[]>(
    () => [
      { key: "home", label: "오늘의 추천", render: () => <TodaysPicksScreen personaConfig={persona} /> },
      { key: "portfolio", label: "관심·보유", render: () => <PortfolioScreen /> },
      { key: "scorecard", label: "성적표", render: () => <ScorecardScreen /> },
      { key: "inbox", label: "알림함", render: () => <NotificationInboxScreen /> },
      {
        key: "persona",
        label: "내 성향",
        render: () => <PersonaSetupScreen mode="edit" initial={persona} onSave={onPersonaChange ?? (() => {})} />,
      },
      { key: "legal", label: "약관", render: () => <LegalScreen /> },
    ],
    [persona, onPersonaChange],
  );
  const [activeKey, setActiveKey] = useState(tabs[0]!.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0]!;

  return (
    <View style={styles.shell}>
      <View style={styles.body}>{active.render()}</View>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const selected = tab.key === activeKey;
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
});
