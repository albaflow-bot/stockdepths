import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { trackPickView } from "../analytics/analytics";
import { DisclaimerBanner } from "../components/DisclaimerBanner";
import { PickCard } from "../components/PickCard";
import { LoadingView, EmptyView, ErrorView } from "../components/StateViews";
import { fetchTodaysPicks } from "../data/picksClient";
import { useTodaysPicks, type ArtifactLoader } from "./useTodaysPicks";
import { pickMatchesPersona } from "../persona/matching";
import type { PersonaConfig } from "../persona/types";

export interface TodaysPicksScreenProps {
  /** Override the data loader (tests inject a stub). */
  loader?: ArtifactLoader;
  /** The user's persona — when present, each pick is tagged 성향 적합/주의 (Task 8). */
  personaConfig?: PersonaConfig;
}

/**
 * Home tab — today's 3–5 picks. The '참고 조언' disclaimer is rendered at the very
 * top, above all predictions, in every state (SPEC Task 6).
 */
export function TodaysPicksScreen({ loader, personaConfig }: TodaysPicksScreenProps) {
  const [market, setMarket] = useState<"US" | "KR">("US");
  // When no loader is injected (production), load the selected market; switching
  // markets swaps the loader and useTodaysPicks reloads.
  const effectiveLoader = useMemo<ArtifactLoader>(
    () => loader ?? (() => fetchTodaysPicks(market)),
    [loader, market],
  );
  const { status, artifact, errorMessage, reload } = useTodaysPicks(effectiveLoader);

  // Funnel: the user viewed today's picks (fires once per successful load).
  useEffect(() => {
    if (status === "ready" && artifact) trackPickView(artifact.picks.length);
  }, [status, artifact]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      testID="todays-picks-screen"
    >
      <Text style={styles.title}>오늘의 추천</Text>
      <MarketToggle market={market} onSelect={setMarket} />
      {artifact ? (
        <Text style={styles.subtitle}>
          {artifact.date} · {marketLabel(artifact.market)}
        </Text>
      ) : null}

      {/* Disclaimer sits ABOVE all predictions, always visible. */}
      <DisclaimerBanner detail={artifact?.disclaimer} />

      {status === "loading" ? <LoadingView /> : null}
      {status === "error" ? (
        <ErrorView message={errorMessage ?? "추천을 불러오지 못했습니다."} onRetry={reload} />
      ) : null}
      {status === "empty" ? <EmptyView /> : null}

      {status === "ready" && artifact ? (
        <View>
          <View style={styles.contextCard}>
            <Text style={styles.contextLabel}>오늘의 시장</Text>
            <Text style={styles.contextText}>{artifact.marketContext}</Text>
          </View>

          {artifact.picks.map((pick) => (
            <PickCard
              key={pick.symbol}
              pick={pick}
              personaMatch={personaConfig ? pickMatchesPersona(pick.risk, personaConfig) : undefined}
            />
          ))}

          <Text style={styles.footer}>
            {artifact.provider}/{artifact.model} · {formatGeneratedAt(artifact.generatedAt)} 생성
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function marketLabel(market: string): string {
  if (market === "US") return "미국 (나스닥/S&P)";
  if (market === "KR") return "한국 (코스피/코스닥)";
  return market;
}

const MARKETS: { key: "US" | "KR"; label: string }[] = [
  { key: "US", label: "미국" },
  { key: "KR", label: "한국" },
];

/** 미국/한국 segmented toggle — picks which market's shared artifact to show. */
function MarketToggle({ market, onSelect }: { market: "US" | "KR"; onSelect: (m: "US" | "KR") => void }) {
  return (
    <View style={styles.marketBar} accessibilityRole="tablist" testID="market-toggle">
      {MARKETS.map((m) => {
        const active = m.key === market;
        return (
          <Pressable
            key={m.key}
            onPress={() => onSelect(m.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={marketLabel(m.key)}
            testID={`market-${m.key}`}
            style={[styles.marketSegment, active ? styles.marketSegmentActive : null]}
          >
            <Text style={[styles.marketLabelText, active ? styles.marketLabelActive : null]}>{m.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatGeneratedAt(iso: string): string {
  // Keep it simple + deterministic: show the date portion.
  return iso.slice(0, 10);
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  title: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  subtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, marginTop: 2, marginBottom: tokens.space.md },
  contextCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
    marginBottom: tokens.space.lg,
  },
  contextLabel: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginBottom: 2 },
  contextText: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary },
  footer: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: tokens.space.sm, textAlign: "center" },
  marketBar: {
    flexDirection: "row",
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space.xs,
    marginTop: tokens.space.sm,
    marginBottom: tokens.space.md,
  },
  marketSegment: { flex: 1, paddingVertical: tokens.space.sm, alignItems: "center", borderRadius: tokens.radius.sm },
  marketSegmentActive: { backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.primary },
  marketLabelText: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  marketLabelActive: { color: tokens.color.primary, fontWeight: tokens.font.weight.bold },
});
