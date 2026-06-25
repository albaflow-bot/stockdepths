/**
 * 결정 대기 탭 — the user-facing decision queue (SPEC delta / 완결 착시 차단). Surfaces
 * the delta's deferred/open items (KR 데이터 경로 실증, 실시간 틱 분리, 뉴스 화이트리스트)
 * as actionable cards so they aren't hidden in code comments. Local-only (no login).
 */

import { View, Text, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { DecisionCard } from "../components/DecisionCard";
import { LoadingView } from "../components/StateViews";
import { useDecisionQueue, type UseDecisionQueueDeps } from "./useDecisionQueue";

export type DecisionQueueScreenProps = UseDecisionQueueDeps;

export function DecisionQueueScreen(props: DecisionQueueScreenProps) {
  const ctrl = useDecisionQueue(props);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="decision-queue-screen">
      <Text style={styles.title}>결정 대기</Text>
      <Text style={styles.subtitle}>
        아직 정해지지 않은 항목입니다. 코드/문서에만 묻어두지 않고 여기서 직접 결정합니다.
      </Text>

      {ctrl.status === "loading" ? (
        <LoadingView />
      ) : (
        <View>
          <View style={styles.summaryRow} testID="decision-open-count">
            <Text style={styles.summaryText}>
              결정 대기 {ctrl.openCount}건 · 전체 {ctrl.items.length}건
            </Text>
          </View>
          {ctrl.items.map((item) => (
            <DecisionCard key={item.id} item={item} onDecide={ctrl.decide} />
          ))}
          <Text style={styles.footnote}>
            각 항목은 승인·보류·거부 중 하나로 결정할 수 있으며, 결정은 이 기기에만 저장됩니다.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  title: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  subtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, marginTop: 2, marginBottom: tokens.space.lg },
  summaryRow: { marginBottom: tokens.space.md },
  summaryText: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  footnote: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: tokens.space.sm, lineHeight: 17 },
});
