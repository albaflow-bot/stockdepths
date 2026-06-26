import { useEffect, useMemo, useState } from "react";
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
import { FILTER_PERIODS, periodLabel, type ScorecardEntry, type ScorecardMetrics, type ScorecardPeriod, type TimingAccuracy } from "../types/scorecard";
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

/** 종목별 집계 행 — 같은 종목이 여러 날 추천되면 한 줄로 묶는다. */
interface SymbolRollup {
  symbol: string;
  count: number;
  avgReturnPct: number | null;
  avgExcessPct: number | null;
}

/**
 * 추천 리스트를 종목별로 묶는다(추천 N회·평균 수익률·평균 초과). 같은 종목이 100일간
 * 추천돼도 1행으로 — 평균 수익률 desc 정렬. (일자별 raw 행 나열 문제 해소.)
 */
function rollupBySymbol(entries: ScorecardEntry[]): SymbolRollup[] {
  const by = new Map<string, { count: number; rets: number[]; excs: number[] }>();
  for (const e of entries) {
    const g = by.get(e.symbol) ?? { count: 0, rets: [], excs: [] };
    g.count += 1;
    if (e.returnPct != null) g.rets.push(e.returnPct);
    if (e.excessReturnPct != null) g.excs.push(e.excessReturnPct);
    by.set(e.symbol, g);
  }
  const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return [...by.entries()]
    .map(([symbol, g]) => ({ symbol, count: g.count, avgReturnPct: mean(g.rets), avgExcessPct: mean(g.excs) }))
    .sort((a, b) => (b.avgReturnPct ?? -Infinity) - (a.avgReturnPct ?? -Infinity));
}

/**
 * 성적표 tab — honest performance (SPEC Task 9 + §5.6). Headline = benchmark-relative
 * cumulative excess return (win rate, per-trade average, MDD), PLUS the timing-signal
 * 적중률 panel (메인 기능 정직성 증명), filterable by 1W/1M/3M/1Y, infographic-first.
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

      {/* 전체 추천 — 종목별로 묶어 공개(같은 종목 여러 날 추천 → 1행: 추천 N회·평균 수익률). */}
      <ScorecardEntries entries={metrics.entries ?? []} />
    </View>
  );
}

/** 전체 추천을 종목별로 묶어 표로 — 추천 N회·평균 수익률·평균 초과(평균수익 desc). */
function ScorecardEntries({ entries }: { entries: ScorecardEntry[] }) {
  const rollups = useMemo(() => rollupBySymbol(entries), [entries]);
  if (rollups.length === 0) return null;
  return (
    <View style={styles.entriesWrap} testID="scorecard-entries">
      <Text style={styles.entriesTitle}>전체 추천 ({rollups.length}종목)</Text>
      <View style={styles.entryHead}>
        <Text style={[styles.entryHeadText, styles.colSym]}>종목 (추천횟수)</Text>
        <Text style={[styles.entryHeadText, styles.colRet]}>평균 수익률</Text>
        <Text style={[styles.entryHeadText, styles.colExc]}>평균 초과</Text>
      </View>
      {rollups.map((r) => (
        <View key={r.symbol} style={styles.entryRow} testID={`scorecard-entry-${r.symbol}`}>
          <View style={styles.colSym}>
            <Text style={styles.entrySymbol}>{r.symbol}</Text>
            <Text style={styles.entryDate}>추천 {r.count}회</Text>
          </View>
          <Text style={[styles.entryRet, styles.colRet, { color: badgeColors[returnTone(r.avgReturnPct)].fg }]}>
            {r.avgReturnPct == null ? "평가 전" : fmtSignedPct(r.avgReturnPct)}
          </Text>
          <Text style={[styles.entryExc, styles.colExc]}>
            {r.avgExcessPct == null ? "—" : fmtSignedPct(r.avgExcessPct)}
          </Text>
        </View>
      ))}
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

  entriesWrap: {
    marginTop: tokens.space.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.md,
  },
  entriesTitle: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.textPrimary,
    marginBottom: tokens.space.sm,
  },
  entryHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: tokens.space.xs,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  entryHeadText: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, fontWeight: tokens.font.weight.medium },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  colSym: { flex: 1.4 },
  colRet: { flex: 1, textAlign: "right" },
  colExc: { flex: 1, textAlign: "right" },
  entrySymbol: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  entryDate: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  entryRet: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  entryExc: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
});
