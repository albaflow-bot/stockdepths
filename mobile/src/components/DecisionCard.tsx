/**
 * One decision-queue card (SPEC delta / 완결 착시 차단). Shows the deferred/open item
 * in plain language and offers THREE separated actions — 승인 / 보류 / 거부 (BinDesk
 * playbook: 보류·거부는 분리된 액션). The current decision is shown as a status badge;
 * the user can change it at any time (re-decide).
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens, cardShadow } from "../theme/tokens";
import { Badge } from "./Badge";
import {
  DECISION_CATEGORY_LABEL,
  DECISION_STATUS_LABEL,
  DECISION_STATUS_TONE,
  type DecisionItem,
  type DecisionStatus,
} from "../decisions/types";

export interface DecisionCardProps {
  item: DecisionItem;
  onDecide: (id: string, status: DecisionStatus) => void;
  testID?: string;
}

const ACTIONS: Array<{ status: DecisionStatus; label: string }> = [
  { status: "approved", label: "승인" },
  { status: "deferred", label: "보류" },
  { status: "rejected", label: "거부" },
];

export function DecisionCard({ item, onDecide, testID }: DecisionCardProps) {
  const tid = testID ?? `decision-${item.id}`;
  return (
    <View style={styles.card} testID={tid}>
      <View style={styles.header}>
        <View style={styles.headLeft}>
          <Text style={styles.id}>{item.id}</Text>
          <Badge text={DECISION_CATEGORY_LABEL[item.category]} tone="muted" />
          <Text style={styles.spec}>{item.spec}</Text>
        </View>
        <Badge
          text={DECISION_STATUS_LABEL[item.status]}
          tone={DECISION_STATUS_TONE[item.status]}
          testID={`${tid}-status`}
        />
      </View>

      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.summary}>{item.summary}</Text>
      <Text style={styles.detail}>{item.detail}</Text>

      <View style={styles.needsBox}>
        <Text style={styles.needsLabel}>결정 필요</Text>
        <Text style={styles.needsText}>{item.needs}</Text>
      </View>

      <View style={styles.actions}>
        {ACTIONS.map((a) => {
          const active = item.status === a.status;
          return (
            <Pressable
              key={a.status}
              onPress={() => onDecide(item.id, a.status)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              testID={`${tid}-action-${a.status}`}
              style={[styles.action, active ? styles.actionActive : null]}
            >
              <Text style={[styles.actionText, active ? styles.actionTextActive : null]}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
    gap: tokens.space.sm,
    ...cardShadow,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headLeft: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  id: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  spec: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  title: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  summary: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, lineHeight: 20 },
  detail: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary, lineHeight: 18 },
  needsBox: { backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.md, padding: tokens.space.md, gap: 2 },
  needsLabel: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, fontWeight: tokens.font.weight.bold },
  needsText: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, lineHeight: 20 },
  actions: { flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.xs },
  action: {
    flex: 1,
    alignItems: "center",
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  actionActive: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  actionText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textSecondary },
  actionTextActive: { color: tokens.color.primaryText },
});
