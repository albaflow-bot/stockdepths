import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens, cardShadow } from "../theme/tokens";
import { Badge } from "./Badge";
import { BacktestPanel } from "./BacktestPanel";
import { badgeLabel, confidenceTone, riskTone } from "../formatters";
import { addBreadcrumb } from "../resilience/errorLog";
import type { Pick } from "../types/picks";

export interface PickCardProps {
  pick: Pick;
  /** Initial expanded state (used by tests). */
  defaultExpanded?: boolean;
  /**
   * Whether this pick's volatility fits the user's persona (Task 8). When set,
   * a 성향 적합 / 성향 주의 badge is shown; undefined hides it (no persona context).
   */
  personaMatch?: boolean;
}

/**
 * One recommendation: symbol + one-line rationale + confidence/risk badges, and
 * an expandable '5년 백테스트 결과' panel (SPEC Task 6).
 */
export function PickCard({ pick, defaultExpanded = false, personaMatch }: PickCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sym = pick.symbol.toUpperCase();

  const toggle = () => {
    setExpanded((v) => !v);
    addBreadcrumb(`backtest panel ${expanded ? "collapse" : "expand"} ${sym}`);
  };

  return (
    <View style={styles.card} testID={`pick-card-${sym}`}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{sym}</Text>
        {pick.companyName ? <Text style={styles.company}>{pick.companyName}</Text> : null}
      </View>

      <View style={styles.badges}>
        <Badge text={`신뢰도 ${badgeLabel(pick.confidence)}`} tone={confidenceTone(pick.confidence)} testID={`confidence-${sym}`} />
        <Badge text={`리스크 ${badgeLabel(pick.risk)}`} tone={riskTone(pick.risk)} testID={`risk-${sym}`} />
        {personaMatch !== undefined ? (
          <Badge
            text={personaMatch ? "성향 적합" : "성향 주의"}
            tone={personaMatch ? "positive" : "warning"}
            testID={`persona-match-${sym}`}
          />
        ) : null}
      </View>

      <Text style={styles.rationale}>{pick.rationale}</Text>
      {pick.action ? <Text style={styles.action}>→ {pick.action}</Text> : null}

      <Pressable
        style={styles.toggle}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={`backtest-toggle-${sym}`}
      >
        <Text style={styles.toggleText}>
          5년 백테스트 결과 {expanded ? "접기 ▲" : "펼치기 ▼"}
        </Text>
      </Pressable>

      {expanded ? <BacktestPanel backtest={pick.backtest} testID={`backtest-panel-${sym}`} /> : null}
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
    gap: tokens.space.sm,
    ...cardShadow,
  },
  header: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.sm },
  symbol: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  company: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted },
  badges: { flexDirection: "row", gap: tokens.space.sm },
  rationale: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, lineHeight: 22 },
  action: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  toggle: {
    marginTop: tokens.space.xs,
    paddingVertical: tokens.space.sm,
    alignSelf: "flex-start",
  },
  toggleText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
});
