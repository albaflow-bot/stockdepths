import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { tokens, badgeColors } from "../theme/tokens";
import { PeriodFilter } from "../components/PeriodFilter";
import { ComparisonBars } from "../components/ComparisonBars";
import { WinRateBar } from "../components/WinRateBar";
import { MetricTile } from "../components/MetricTile";
import { RealizedVsBacktest } from "../components/RealizedVsBacktest";
import { TimingAccuracyPanel } from "../components/TimingAccuracyPanel";
import { LoadingView, ErrorView } from "../components/StateViews";
import { fmtSignedPct, fmtPct, returnTone } from "../formatters";
import { FILTER_PERIODS, periodLabel, type ScorecardMetrics, type ScorecardPeriod, type TimingAccuracy } from "../types/scorecard";
import { useScorecard, type ScorecardStatus } from "./useScorecard";
import { fetchTimingAccuracy, type ScorecardLoader, type TimingAccuracyLoader } from "../data/scorecardClient";

export interface ScorecardScreenProps {
  loader?: ScorecardLoader;
  /** Timing-accuracy loader (SPEC §5.6). Graceful — undefined hides the panel. */
  timingLoader?: TimingAccuracyLoader;
  /** Initial period (tests). */
  initialPeriod?: ScorecardPeriod;
}

const DEFAULT_PERIOD: ScorecardPeriod = "1M";

/**
 * 성적표 tab — honest performance (SPEC Task 9 + §5.6). Headline = benchmark-relative
 * cumulative excess return (win rate, per-trade average, MDD), PLUS the timing-signal
 * 적중률 panel (메인 기능 정직성 증명), filterable by 1W/1M/3M/YTD, infographic-first.
 */
export function ScorecardScreen({ loader, timingLoader = fetchTimingAccuracy, initialPeriod = DEFAULT_PERIOD }: ScorecardScreenProps) {
  const { status, scorecard, errorMessage, reload } = useScorecard(loader);
  const [period, setPeriod] = useState<ScorecardPeriod>(initialPeriod);
  const [timing, setTiming] = useState<TimingAccuracy | undefined>(undefined);

  useEffect(() => {
    let active = true;
    timingLoader()
      .then((t) => active && setTiming(t))
      .catch(() => active && setTiming(undefined));
    return () => {
      active = false;
    };
  }, [timingLoader]);

  const timingMetrics = timing?.periods.find((p) => p.period === period);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="scorecard-screen">
      <Text style={styles.title}>추천 성적표</Text>
      <Text style={styles.subtitle}>지난 추천 실적을 그대로 공개합니다. (벤치마크: {scorecard?.benchmarkSymbol ?? "SPY"})</Text>

      <PeriodFilter periods={FILTER_PERIODS} selected={period} onSelect={setPeriod} />

      {renderBody(status, scorecard?.periods.find((p) => p.period === period), errorMessage, reload, scorecard?.benchmarkSymbol ?? "SPY")}

      {/* 타이밍 신호 적중률 — the MAIN feature's honesty proof (§5.6). Shown when loaded. */}
      {timing ? <TimingAccuracyPanel metrics={timingMetrics} criterion={timing.criterion} /> : null}
    </ScrollView>
  );
}

function renderBody(
  status: ScorecardStatus,
  metrics: ScorecardMetrics | undefined,
  errorMessage: string | undefined,
  reload: () => void,
  benchmarkSymbol: string,
) {
  if (status === "loading") return <LoadingView />;
  if (status === "error") return <ErrorView message={errorMessage ?? "성적표를 불러오지 못했습니다."} onRetry={reload} />;
  if (!metrics || metrics.evaluated === 0) {
    return (
      <View style={styles.empty} testID="scorecard-empty">
        <Text style={styles.emptyTitle}>{metrics ? periodLabel(metrics.period) : "이 기간"} 평가 결과 없음</Text>
        <Text style={styles.emptyText}>해당 기간에 평가 가능한 추천이 아직 없습니다.</Text>
      </View>
    );
  }
  return <ScorecardBody metrics={metrics} benchmarkSymbol={benchmarkSymbol} />;
}

function ScorecardBody({ metrics, benchmarkSymbol }: { metrics: ScorecardMetrics; benchmarkSymbol: string }) {
  const excessColor = badgeColors[returnTone(metrics.excessReturnPct)].fg;
  return (
    <View>
      {/* Headline hero: benchmark-relative cumulative excess return. */}
      <View style={styles.hero} testID="scorecard-hero">
        <Text style={styles.heroLabel}>벤치마크 대비 누적 초과수익</Text>
        <Text style={[styles.heroValue, { color: excessColor }]} testID="hero-excess">
          {fmtSignedPct(metrics.excessReturnPct)}
        </Text>
        <Text style={styles.heroSub}>
          내 추천 {fmtSignedPct(metrics.cumulativeReturnPct)} · {benchmarkSymbol} {fmtSignedPct(metrics.benchmarkReturnPct)}
          {"  "}({metrics.evaluated}건)
        </Text>
        <ComparisonBars
          portfolioPct={metrics.cumulativeReturnPct}
          benchmarkPct={metrics.benchmarkReturnPct}
          benchmarkSymbol={benchmarkSymbol}
        />
      </View>

      <View style={styles.winWrap}>
        <WinRateBar winRatePct={metrics.winRatePct} />
      </View>

      <View style={styles.tiles}>
        <MetricTile
          label="건당 평균수익"
          value={fmtSignedPct(metrics.avgTradeReturnPct)}
          tone={returnTone(metrics.avgTradeReturnPct)}
          testID="tile-avg"
        />
        <MetricTile
          label="최대낙폭 (MDD)"
          value={fmtPct(metrics.maxDrawdownPct)}
          tone={metrics.maxDrawdownPct != null && metrics.maxDrawdownPct < 0 ? "negative" : "muted"}
          testID="tile-mdd"
        />
      </View>

      <RealizedVsBacktest metrics={metrics} />

      {metrics.best || metrics.worst ? (
        <View style={styles.bestWorst} testID="best-worst">
          {metrics.best ? (
            <View style={[styles.bwChip, styles.bwBest]}>
              <Text style={styles.bwLabel}>최고</Text>
              <Text style={styles.bwText}>{metrics.best.symbol} {fmtSignedPct(metrics.best.returnPct)}</Text>
            </View>
          ) : null}
          {metrics.worst ? (
            <View style={[styles.bwChip, styles.bwWorst]}>
              <Text style={styles.bwLabel}>최저</Text>
              <Text style={styles.bwText}>{metrics.worst.symbol} {fmtSignedPct(metrics.worst.returnPct)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  title: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  subtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, marginTop: 2, marginBottom: tokens.space.lg },
  hero: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
  },
  heroLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  heroValue: { fontSize: 40, fontWeight: tokens.font.weight.bold, marginVertical: tokens.space.xs },
  heroSub: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  winWrap: { marginTop: tokens.space.lg },
  tiles: { flexDirection: "row", gap: tokens.space.md, marginTop: tokens.space.lg },
  empty: { alignItems: "center", paddingVertical: tokens.space.xxl, gap: tokens.space.sm },
  emptyTitle: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  emptyText: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, textAlign: "center" },
  bestWorst: { flexDirection: "row", gap: tokens.space.md, marginTop: tokens.space.lg },
  bwChip: { flex: 1, borderRadius: tokens.radius.md, padding: tokens.space.md, gap: 2 },
  bwBest: { backgroundColor: tokens.color.positiveBg },
  bwWorst: { backgroundColor: tokens.color.negativeBg },
  bwLabel: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary },
  bwText: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
});
