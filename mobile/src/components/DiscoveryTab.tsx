/**
 * DiscoveryTab — '오늘의 발굴' (SPEC §1-Δ: 기존 '오늘의 추천' → Movers & Flow 스크리너).
 *
 * 6 카테고리(🚀급등/🔻급락/🔥거래폭발/💰대금집중/📈신고가/↩️과매도반등) 섹션 구조.
 * 각 섹션은 검색 화면과 동일 레이아웃의 카드 리스트. 후보 선정은 서버의 결정론적 스캔이
 * 끝냈고(엣지), 카드는 한 줄 신호로 환원된다.
 *
 * 대형주 배제를 UI 에 명시: 모멘텀 카테고리는 "시총 상위 N 종목 제외" 를 표기하고,
 * 대금집중에 노출된 초대형주에는 "이례신호 초대형주" 배지를 단다(SPEC §1-Δ 강제 규칙).
 */

import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { SecuritySearchCard } from "./SecuritySearchCard";
import { StockDetailSheet, type StockDetailTarget } from "./StockDetailSheet";
import { TodaysPicksSection, type PicksMarketLoader } from "./TodaysPicksSection";
import type { PersonaConfig } from "../persona/types";
import { useDiscovery } from "../screens/useDiscovery";
import type { DiscoveryLoader, DiscoveryMarket } from "../data/discoveryClient";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  LARGE_CAP_TOP_N,
  type DiscoveryArtifact,
  type DiscoveryItem,
  type ScreenCategory,
} from "../types/discovery";
import type { SecuritySearchItem } from "../types/security";

export interface DiscoveryTabProps {
  loader?: DiscoveryLoader;
  onAddWatch: (item: SecuritySearchItem) => void;
  onAddHolding: (item: SecuritySearchItem) => void;
  watchedCodes?: Set<string>;
  heldCodes?: Set<string>;
  /** '오늘의 추천' 픽 로더 오버라이드(테스트 주입). */
  picksLoader?: PicksMarketLoader;
  /** '오늘의 추천' 픽 ＋관심 — symbol 만 받아 기존 addWatch 경로로 위임. */
  onAddPickWatch?: (symbol: string) => void;
  /** 활성 성향 — 픽 섹션의 적합/주의 배지·정렬에 사용. */
  personaConfig?: PersonaConfig;
  testID?: string;
}

const MARKETS: Array<{ value: DiscoveryMarket; label: string }> = [
  { value: "US", label: "미국" },
  { value: "KR", label: "한국" },
];

/** DiscoveryItem → 카드가 받는 SecuritySearchItem (검색 화면과 동일 레이아웃). */
function toSearchItem(d: DiscoveryItem): SecuritySearchItem {
  return {
    market: d.market,
    code: d.code,
    name_ko: d.name_ko,
    name_en: d.name_en,
    last: d.last,
    change_pct: d.change_pct,
    direction: d.direction,
    weekly: d.weekly,
    signal: d.signal,
  };
}

/** 모멘텀 카테고리는 "시총 상위 N 제외", 대금집중은 초대형주 이례신호 규칙을 표기. */
function largeCapNote(category: ScreenCategory, market: DiscoveryArtifact["market"]): string {
  if (category === "large_cap_movers") {
    return `시총 상위 ${LARGE_CAP_TOP_N[market]} 대형주 중 오늘 크게 움직인 종목 (모멘텀에선 빼고 여기 따로)`;
  }
  if (CATEGORY_META[category].momentum) {
    return `시총 상위 ${LARGE_CAP_TOP_N[market]} 대형주 제외 — 아래 '💎 대형주 무버'에서 따로 봄`;
  }
  return "초대형주는 이례신호(RVOL≥3·갭±5%)가 있을 때만 노출";
}

function CategorySection({
  category,
  items,
  market,
  onAddWatch,
  onAddHolding,
  onPressItem,
  watched,
  held,
}: {
  category: ScreenCategory;
  items: DiscoveryItem[];
  market: DiscoveryArtifact["market"];
  onAddWatch: (item: SecuritySearchItem) => void;
  onAddHolding: (item: SecuritySearchItem) => void;
  onPressItem: (item: SecuritySearchItem) => void;
  watched: Set<string>;
  held: Set<string>;
}) {
  const meta = CATEGORY_META[category];
  return (
    <View style={styles.section} testID={`discovery-section-${category}`}>
      <Text style={styles.sectionTitle}>{meta.label}</Text>
      <Text style={styles.sectionDesc}>{meta.description}</Text>
      <Text style={styles.largeCapNote} testID={`discovery-section-${category}-largecap-note`}>
        ⓘ {largeCapNote(category, market)}
      </Text>

      {items.length === 0 ? (
        <Text style={styles.emptyCat}>해당 종목이 없습니다.</Text>
      ) : (
        items.map((d) => (
          <SecuritySearchCard
            key={`${d.market}:${d.code}`}
            item={toSearchItem(d)}
            watched={watched.has(d.code.toUpperCase())}
            held={held.has(d.code.toUpperCase())}
            onAddWatch={onAddWatch}
            onAddHolding={onAddHolding}
            onPress={onPressItem}
            badgeText={d.unusual ? "이례신호 초대형주" : undefined}
            testID={`discovery-card-${category}-${d.code}`}
          />
        ))
      )}
    </View>
  );
}

export function DiscoveryTab({
  loader,
  onAddWatch,
  onAddHolding,
  watchedCodes,
  heldCodes,
  picksLoader,
  onAddPickWatch,
  personaConfig,
  testID = "discovery-tab",
}: DiscoveryTabProps) {
  const d = useDiscovery({ loader });
  const watched = watchedCodes ?? new Set<string>();
  const held = heldCodes ?? new Set<string>();
  // 상세 모달 대상. 발굴 카드는 원본 SecuritySearchItem 을 보존해 ＋관심/＋보유가 기존
  // 경로(full item)를 그대로 호출하게 한다. 픽 카드는 item 없이 target 만 채운다.
  const [detail, setDetail] = useState<{ item: SecuritySearchItem | null; target: StockDetailTarget } | null>(null);

  // 발굴 카드(검색형) 탭 → 상세. last/change/신호를 그대로 넘긴다.
  const openItem = (item: SecuritySearchItem) =>
    setDetail({
      item,
      target: {
        symbol: item.code,
        market: item.market,
        name: item.name_ko?.trim() || item.name_en?.trim() || item.code,
        last: item.last,
        changePct: item.change_pct,
        signal: item.signal,
      },
    });

  return (
    <View style={styles.container} testID={testID}>
      {/* 시장 토글 */}
      <View style={styles.marketRow} testID={`${testID}-market`}>
        {MARKETS.map((m) => {
          const on = m.value === d.market;
          return (
            <Pressable
              key={m.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => d.setMarket(m.value)}
              style={[styles.pill, on ? styles.pillOn : null]}
              testID={`${testID}-market-${m.value}`}
            >
              <Text style={[styles.pillText, on ? styles.pillTextOn : null]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {d.status === "loading" ? (
        <View style={styles.center} testID={`${testID}-loading`}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={styles.muted}>투데이를 불러오는 중…</Text>
        </View>
      ) : null}

      {d.status === "error" ? (
        <View style={styles.center} testID={`${testID}-error`}>
          <Text style={styles.errTitle}>{d.errorMessage ?? "불러오지 못했습니다."}</Text>
          <Pressable onPress={d.reload} style={styles.retry} testID={`${testID}-retry`}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}

      {d.status === "ready" && d.artifact ? (
        <ScrollView style={styles.list} testID={`${testID}-sections`}>
          {onAddPickWatch ? (
            <TodaysPicksSection
              market={d.market}
              loader={picksLoader}
              onAddWatch={onAddPickWatch}
              onPressPick={(pick) =>
                setDetail({
                  item: null, // 픽은 last/change 없음 → 상세가 stats.close 로 헤더를 채운다.
                  target: {
                    symbol: pick.symbol,
                    market: d.market, // 픽 아티팩트 market(US/KR)
                    name: pick.companyName ?? pick.symbol,
                    signal: null,
                    // 카드에서 2줄로 잘리는 rationale(+action)을 모달에선 전문으로.
                    description: [pick.rationale, pick.action ? `→ ${pick.action}` : null]
                      .filter(Boolean)
                      .join("\n"),
                  },
                })
              }
              watchedCodes={watched}
              personaConfig={personaConfig}
              testID={`${testID}-picks`}
            />
          ) : null}

          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>투데이 · {d.artifact.asof}</Text>
            <Text style={styles.bannerSub}>
              시장 스캔 {d.artifact.stats.scanned}종목 · 대형주 {d.artifact.stats.largeCapsExcluded} 제외 · 후보{" "}
              {d.artifact.stats.candidates}
            </Text>
            <Text style={styles.bannerEdge}>
              ※ 시총 상위 초대형주는 모멘텀 카테고리에서 제외합니다 — 아무 데서나 얻는 정보는 이 제품의 엣지가 아닙니다.
            </Text>
          </View>

          {CATEGORY_ORDER.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              items={d.artifact!.categories[cat] ?? []}
              market={d.artifact!.market}
              onAddWatch={onAddWatch}
              onAddHolding={onAddHolding}
              onPressItem={openItem}
              watched={watched}
              held={held}
            />
          ))}
        </ScrollView>
      ) : null}

      {/* 카드/픽 탭 → 종목 상세 모달 */}
      <StockDetailSheet
        visible={detail != null}
        target={detail?.target ?? null}
        watched={detail ? watched.has(detail.target.symbol.toUpperCase()) : false}
        held={detail ? held.has(detail.target.symbol.toUpperCase()) : false}
        onAddWatch={() => {
          if (!detail) return;
          // 발굴 카드는 원본 item 으로, 픽은 symbol 만 있는 폴백 경로로 위임.
          if (detail.item) onAddWatch(detail.item);
          else if (onAddPickWatch) onAddPickWatch(detail.target.symbol);
        }}
        onAddHolding={() => {
          if (detail?.item) onAddHolding(detail.item);
          // 픽은 매수가 없는 후보라 ＋보유 경로가 없다(검색·발굴 카드만 보유 추가).
        }}
        onClose={() => setDetail(null)}
        testID={`${testID}-detail`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg, padding: tokens.space.md, gap: tokens.space.md },
  marketRow: { flexDirection: "row", gap: tokens.space.sm },
  pill: {
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  pillOn: { borderColor: tokens.color.primary, backgroundColor: tokens.color.primary },
  pillText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.textSecondary },
  pillTextOn: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },

  list: { flex: 1 },
  banner: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
    marginBottom: tokens.space.md,
    gap: tokens.space.xs,
  },
  bannerTitle: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  bannerSub: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  bannerEdge: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, lineHeight: 16 },

  section: { marginBottom: tokens.space.lg, gap: tokens.space.xs },
  sectionTitle: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  sectionDesc: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  largeCapNote: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginBottom: tokens.space.xs },
  emptyCat: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, paddingVertical: tokens.space.sm },

  center: { paddingVertical: tokens.space.xxl, gap: tokens.space.md, alignItems: "center" },
  muted: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  errTitle: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, textAlign: "center" },
  retry: {
    marginTop: tokens.space.sm,
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.md,
  },
  retryText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },
});
