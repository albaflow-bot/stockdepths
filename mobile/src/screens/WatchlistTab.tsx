/**
 * 관심·보유 탭 — 능동 타이밍 대시보드 (SPEC §5.5). Replaces the old empty input form:
 * on entry, market data flows immediately (header + brief + 주목 종목) so the tab is
 * never a cold "입력하세요" wall (피드백 직접 대응). 핵심 전환: 골라서 담으세요.
 *
 * Top→bottom: (1) 시장 헤더, (2) 오늘의 시장 브리핑, (3) 내 보유/관심 카드(각 종목은
 * TimingSignal 배지로 환원), (4) '여기서 담기 — 오늘 주목 종목'(한 번 탭 토글),
 * (5) 직접 입력 폼은 '직접 종목 추가' 버튼 뒤로 격하된 접힌 보조 수단.
 */

import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { MarketHeader } from "../components/MarketHeader";
import { MarketBriefBanner } from "../components/MarketBriefBanner";
import { HoldingCard } from "../components/HoldingCard";
import { PickableStockRow } from "../components/PickableStockRow";
import { TimingSignalArea, TIMING_DISCLAIMER } from "../components/TimingBadge";
import { AddHoldingForm } from "../components/AddHoldingForm";
import { AddWatchForm } from "../components/AddWatchForm";
import { LoadingView } from "../components/StateViews";
import { Badge } from "../components/Badge";
import { fmtMoney, fmtSignedPct, returnTone } from "../formatters";
import { useWatchlistTab, type UseWatchlistTabDeps } from "./useWatchlistTab";

export type WatchlistTabProps = UseWatchlistTabDeps;

export function WatchlistTab(props: WatchlistTabProps) {
  const ctrl = useWatchlistTab(props);
  const [manualOpen, setManualOpen] = useState(false);

  const noPositions = ctrl.holdingRows.length === 0 && ctrl.watchRows.length === 0;

  return (
    <ScrollView style={styles.scroll} testID="watchlist-tab" stickyHeaderIndices={[0]}>
      {/* (1) 시장 헤더 — always on, cache-first (빈 보유여도 화면이 살아있음). */}
      <MarketHeader indices={ctrl.indices} updating={ctrl.indicesUpdating} stale={ctrl.indicesStale} />

      <View style={styles.content}>
        <Text style={styles.privacy}>🔒 모든 데이터는 이 기기에만 저장됩니다 (로그인 없음).</Text>

        {/* (2) 오늘의 시장 브리핑 */}
        <MarketBriefBanner brief={ctrl.dashboard.brief} />

        {ctrl.status === "loading" ? (
          <LoadingView />
        ) : (
          <View>
            {ctrl.quotesError ? (
              <View style={styles.quoteWarn} testID="quote-warning">
                <Text style={styles.quoteWarnText}>시세를 불러오지 못해 일부 수익률이 표시되지 않을 수 있습니다.</Text>
              </View>
            ) : null}

            {/* (3) 내 보유/관심 카드 — 모든 종목 표면은 한 줄 타이밍 신호로 환원. */}
            <Text style={styles.section}>내 보유·관심 종목</Text>
            <Text style={styles.disclaimer}>{TIMING_DISCLAIMER}</Text>

            {noPositions ? (
              <View style={styles.emptyCard} testID="dashboard-empty">
                <Text style={styles.emptyText}>아직 담은 종목이 없어요.</Text>
                <Text style={styles.emptySub}>아래에서 오늘 주목할 종목을 담아보세요 ↓</Text>
              </View>
            ) : null}

            {ctrl.holdingRows.map((row) => (
              <View key={`h-${row.pnl.id}`} style={styles.cardWrap} testID={`holding-wrap-${row.pnl.symbol}`}>
                <HoldingCard pnl={row.pnl} onRemove={ctrl.removeHolding} />
                <TimingSignalArea
                  personal={row.personal}
                  batch={row.batch}
                  holdingNewsCount={row.newsCount}
                  hideDisclaimer
                  testID={`holding-timing-${row.pnl.symbol}`}
                />
              </View>
            ))}

            {ctrl.watchRows.map((w) => (
              <View key={`w-${w.symbol}`} style={styles.cardWrap} testID={`watch-wrap-${w.symbol}`}>
                <View style={styles.watchHead} testID={`watch-row-${w.symbol}`}>
                  <Text style={styles.watchSym}>{w.symbol}</Text>
                  <View style={styles.watchRight}>
                    <Text style={styles.watchPrice}>{w.price != null ? fmtMoney(w.price) : "시세 —"}</Text>
                    {w.changePercent != null ? (
                      <Badge text={fmtSignedPct(w.changePercent)} tone={returnTone(w.changePercent)} />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${w.symbol} 관심종목 삭제`}
                      onPress={() => ctrl.removeWatch(w.symbol)}
                      testID={`watch-remove-${w.symbol}`}
                      style={styles.remove}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
                  </View>
                </View>
                <TimingSignalArea
                  batch={w.batch}
                  holdingNewsCount={w.newsCount}
                  hideDisclaimer
                  testID={`watch-timing-${w.symbol}`}
                />
              </View>
            ))}

            {/* (4) 여기서 담기 — 오늘 주목 종목 (한 번 탭 토글). */}
            <Text style={styles.section}>여기서 담기 — 오늘 주목 종목</Text>
            {ctrl.topRows.length === 0 ? (
              <Text style={styles.empty}>오늘 주목 종목을 불러오는 중이에요. 잠시 후 다시 확인해 주세요.</Text>
            ) : (
              ctrl.topRows.map((r) => (
                <PickableStockRow
                  key={r.symbol}
                  symbol={r.symbol}
                  companyName={r.companyName}
                  price={r.price}
                  changePercent={r.changePercent}
                  signal={ctrl.dashboard.signals[r.symbol.toUpperCase()]}
                  inWatchlist={ctrl.watchSet.has(r.symbol.toUpperCase())}
                  onToggle={ctrl.toggleWatch}
                />
              ))
            )}

            {/* (5) 직접 종목 추가 — 접힌 보조 수단. */}
            <Pressable
              style={styles.manualToggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: manualOpen }}
              onPress={() => setManualOpen((v) => !v)}
              testID="manual-add-toggle"
            >
              <Text style={styles.manualToggleText}>직접 종목 추가 {manualOpen ? "▲" : "▼"}</Text>
            </Pressable>
            {manualOpen ? (
              <View style={styles.manualBox} testID="manual-add-box">
                <Text style={styles.manualLabel}>보유 종목 추가</Text>
                <AddHoldingForm onAdd={ctrl.addHolding} />
                <Text style={styles.manualLabel}>관심 종목 추가</Text>
                <AddWatchForm onAdd={ctrl.addWatch} />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  privacy: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginBottom: tokens.space.md },
  section: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, marginTop: tokens.space.lg, marginBottom: tokens.space.sm },
  disclaimer: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginBottom: tokens.space.md },
  empty: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, marginBottom: tokens.space.md },
  emptyCard: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space.lg,
    gap: tokens.space.xs,
    marginBottom: tokens.space.md,
  },
  emptyText: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  emptySub: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  cardWrap: { marginBottom: tokens.space.md, gap: tokens.space.xs },
  watchHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.md,
  },
  watchSym: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  watchRight: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  watchPrice: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary },
  remove: { paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xs },
  removeText: { fontSize: tokens.font.size.md, color: tokens.color.textMuted },
  quoteWarn: { backgroundColor: tokens.color.warningBg, borderRadius: tokens.radius.md, padding: tokens.space.md, marginBottom: tokens.space.md },
  quoteWarnText: { fontSize: tokens.font.size.sm, color: tokens.color.warningFg },
  manualToggle: { marginTop: tokens.space.lg, paddingVertical: tokens.space.md, alignSelf: "flex-start" },
  manualToggleText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  manualBox: { gap: tokens.space.sm },
  manualLabel: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textSecondary, marginTop: tokens.space.sm },
});
