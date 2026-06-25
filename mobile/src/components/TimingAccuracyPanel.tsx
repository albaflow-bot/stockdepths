/**
 * 타이밍 신호 적중률 패널 (SPEC §5.6) — the honesty proof for the MAIN feature.
 * Infographic-first (bars), reuses the readable scorecard styling. Shows Buy→상승
 * 적중 and Sell→하락 회피 rates for the selected period, the EXPLICIT hit criterion,
 * and an honest '표본 부족' flag when there isn't enough data (과장 ✗ — memory 정합).
 */

import { View, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { Badge } from "./Badge";
import { pctWidth, winRateFraction } from "../charts/proportion";
import { fmtPct } from "../formatters";
import type { TimingAccuracyMetrics, TimingHitStats } from "../types/scorecard";

export interface TimingAccuracyPanelProps {
  metrics?: TimingAccuracyMetrics;
  /** Explicit hit criterion (from the server) shown for transparency. */
  criterion?: string;
  testID?: string;
}

function HitBar({ label, stats, color, testID }: { label: string; stats: TimingHitStats; color: string; testID: string }) {
  return (
    <View style={styles.barBlock} testID={testID}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue} testID={`${testID}-rate`}>
          {stats.evaluated > 0 ? fmtPct(stats.hitRatePct) : "—"}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: pctWidth(winRateFraction(stats.hitRatePct)), backgroundColor: color }]} />
      </View>
      <Text style={styles.barSub}>{stats.evaluated}건 평가 중 {stats.hits}건 적중</Text>
    </View>
  );
}

export function TimingAccuracyPanel({ metrics, criterion, testID = "timing-accuracy" }: TimingAccuracyPanelProps) {
  return (
    <View style={styles.panel} testID={testID}>
      <View style={styles.head}>
        <Text style={styles.title}>타이밍 신호 적중률</Text>
        {metrics ? <Text style={styles.horizon}>{metrics.horizonDays}일 기준</Text> : null}
      </View>

      {!metrics || metrics.overall.total === 0 ? (
        <Text style={styles.empty} testID={`${testID}-empty`}>
          아직 평가할 매수/매도 신호가 없습니다. 신호가 쌓이면 적중률을 공개합니다.
        </Text>
      ) : (
        <View>
          {metrics.lowSample ? (
            <View style={styles.lowSample} testID={`${testID}-lowsample`}>
              <Badge text="표본 부족" tone="warning" />
              <Text style={styles.lowSampleText}>
                평가 표본 {metrics.overall.evaluated}건으로 적중률 신뢰도가 낮습니다. 참고용으로만 보세요.
              </Text>
            </View>
          ) : null}

          {/* Overall headline */}
          <View style={styles.overall} testID={`${testID}-overall`}>
            <Text style={styles.overallLabel}>전체 적중률</Text>
            <Text style={styles.overallValue}>
              {metrics.overall.evaluated > 0 ? fmtPct(metrics.overall.hitRatePct) : "—"}
            </Text>
            <Text style={styles.overallSub}>{metrics.overall.evaluated}건 평가</Text>
          </View>

          <HitBar label="매수 → 상승 적중" stats={metrics.buy} color={tokens.color.positive} testID={`${testID}-buy`} />
          <HitBar label="매도 → 하락 회피" stats={metrics.sell} color={tokens.color.negative} testID={`${testID}-sell`} />
        </View>
      )}

      {criterion ? (
        <Text style={styles.criterion} testID={`${testID}-criterion`}>
          적중 기준: {criterion}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    marginTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  title: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  horizon: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  empty: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  lowSample: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, backgroundColor: tokens.color.warningBg, borderRadius: tokens.radius.md, padding: tokens.space.sm },
  lowSampleText: { flex: 1, fontSize: tokens.font.size.xs, color: tokens.color.warningFg },
  overall: { alignItems: "center", gap: 2, marginVertical: tokens.space.sm },
  overallLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  overallValue: { fontSize: 36, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  overallSub: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  barBlock: { gap: tokens.space.xs, marginTop: tokens.space.md },
  barHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  barValue: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.bold },
  track: { height: 12, backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.pill, overflow: "hidden" },
  fill: { height: 12, borderRadius: tokens.radius.pill, minWidth: 2 },
  barSub: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  criterion: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, lineHeight: 17, marginTop: tokens.space.sm },
});
