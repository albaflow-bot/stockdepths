/**
 * TodaysPicksSection — '투데이' 화면 상단의 LLM '오늘의 추천' 픽 섹션.
 *
 * DiscoveryTab 의 시장 토글(US/KR)에 맞춰 `fetchTodaysPicks(market)` 로 LLM 픽을
 * 불러와 카드로 보여준다. 각 카드: 종목명+심볼 · 신뢰도/리스크 배지 · 한 줄 rationale ·
 * (있으면) action · [＋ 관심] 버튼(이미 담긴 종목은 "관심 담김 ✓" 비활성).
 *
 * 픽 로드는 카테고리 섹션과 독립적으로 degrade 한다: 로딩/에러/빈 상태는 조용한 한 줄
 * 안내로 끝내고, 절대 throw 로 렌더 트리를 깨지 않는다(RESILIENCE 정합). 디스클레이머는
 * 섹션 하단에 1줄 고정한다.
 */

import { useMemo } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { Badge } from "./Badge";
import { badgeLabel, confidenceTone, riskTone } from "../formatters";
import { fetchTodaysPicks } from "../data/picksClient";
import { useTodaysPicks, type ArtifactLoader } from "../screens/useTodaysPicks";
import type { DiscoveryMarket } from "../data/discoveryClient";
import type { DailyPicksArtifact, Pick } from "../types/picks";

const DISCLAIMER = "AI 참고 조언 · 투자 책임은 본인";

/** 시장을 받아 픽 아티팩트를 반환하는 로더(테스트 주입). 미주입 시 실제 클라이언트 사용. */
export type PicksMarketLoader = (market: DiscoveryMarket) => Promise<DailyPicksArtifact>;

export interface TodaysPicksSectionProps {
  /** 현재 선택된 시장(DiscoveryTab 토글 값). 바뀌면 픽도 다시 로드된다. */
  market: DiscoveryMarket;
  /** 데이터 로더 오버라이드(테스트 주입). 미주입 시 실제 클라이언트로 market 픽을 로드. */
  loader?: PicksMarketLoader;
  /** ＋관심 — 해당 픽 symbol 을 관심목록에 추가(기존 addWatch 경로 재사용). */
  onAddWatch: (symbol: string) => void;
  /** 이미 관심목록에 담긴 코드(대문자). */
  watchedCodes: Set<string>;
  testID?: string;
}

export function TodaysPicksSection({
  market,
  loader,
  onAddWatch,
  watchedCodes,
  testID = "todays-picks-section",
}: TodaysPicksSectionProps) {
  // market 이 바뀌면 로더 identity 가 바뀌어 useTodaysPicks 가 해당 시장으로 재조회한다.
  // 주입 로더든 실제 클라이언트든 항상 현재 market 을 받는다.
  const effectiveLoader = useMemo<ArtifactLoader>(() => {
    const load = loader ?? fetchTodaysPicks;
    return () => load(market);
  }, [loader, market]);
  const { status, artifact, errorMessage } = useTodaysPicks(effectiveLoader);

  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.title}>오늘의 추천</Text>
      <Text style={styles.subtitle}>AI 가 고른 오늘의 관심 후보</Text>

      {status === "loading" ? (
        <View style={styles.center} testID={`${testID}-loading`}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={styles.muted}>오늘의 추천을 불러오는 중…</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <Text style={styles.muted} testID={`${testID}-error`}>
          {errorMessage ?? "오늘의 추천을 불러오지 못했습니다."}
        </Text>
      ) : null}

      {status === "empty" ? (
        <Text style={styles.muted} testID={`${testID}-empty`}>
          오늘은 추천할 종목이 없습니다.
        </Text>
      ) : null}

      {status === "ready" && artifact ? (
        <View testID={`${testID}-list`}>
          {artifact.picks.map((pick) => (
            <PickWatchCard
              key={pick.symbol}
              pick={pick}
              watched={watchedCodes.has(pick.symbol.toUpperCase())}
              onAddWatch={onAddWatch}
              testID={`${testID}-card-${pick.symbol.toUpperCase()}`}
            />
          ))}
        </View>
      ) : null}

      <Text style={styles.disclaimer} testID={`${testID}-disclaimer`}>
        ⓘ {DISCLAIMER}
      </Text>
    </View>
  );
}

function PickWatchCard({
  pick,
  watched,
  onAddWatch,
  testID,
}: {
  pick: Pick;
  watched: boolean;
  onAddWatch: (symbol: string) => void;
  testID: string;
}) {
  const sym = pick.symbol.toUpperCase();
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        {pick.companyName ? <Text style={styles.company} numberOfLines={1}>{pick.companyName}</Text> : null}
        <Text style={styles.symbol}>{sym}</Text>
      </View>

      <View style={styles.badges}>
        <Badge text={`신뢰도 ${badgeLabel(pick.confidence)}`} tone={confidenceTone(pick.confidence)} testID={`${testID}-confidence`} />
        <Badge text={`리스크 ${badgeLabel(pick.risk)}`} tone={riskTone(pick.risk)} testID={`${testID}-risk`} />
      </View>

      <Text style={styles.rationale} numberOfLines={2}>{pick.rationale}</Text>
      {pick.action ? <Text style={styles.action}>→ {pick.action}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: watched }}
        accessibilityLabel={`${pick.companyName ?? sym} 관심목록에 추가`}
        onPress={() => onAddWatch(pick.symbol)}
        style={[styles.btn, watched ? styles.btnDone : styles.btnWatch]}
        testID={`${testID}-watch`}
      >
        <Text style={[styles.btnText, watched ? styles.btnTextDone : styles.btnTextWatch]}>
          {watched ? "관심 담김 ✓" : "＋ 관심"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
    marginBottom: tokens.space.md,
    gap: tokens.space.sm,
  },
  title: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  subtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },

  center: { paddingVertical: tokens.space.lg, gap: tokens.space.sm, alignItems: "center" },
  muted: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, paddingVertical: tokens.space.xs },

  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
    gap: tokens.space.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.xs, flexWrap: "wrap" },
  company: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, flexShrink: 1 },
  symbol: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.textSecondary },
  badges: { flexDirection: "row", gap: tokens.space.sm, flexWrap: "wrap" },
  rationale: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, lineHeight: 20 },
  action: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },

  btn: { paddingVertical: tokens.space.sm, borderRadius: tokens.radius.pill, alignItems: "center", borderWidth: 1.5 },
  btnWatch: { backgroundColor: tokens.color.surface, borderColor: tokens.color.primary },
  btnDone: { backgroundColor: tokens.color.surfaceAlt, borderColor: tokens.color.border },
  btnText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  btnTextWatch: { color: tokens.color.primary },
  btnTextDone: { color: tokens.color.textMuted },

  disclaimer: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: tokens.space.xs },
});
