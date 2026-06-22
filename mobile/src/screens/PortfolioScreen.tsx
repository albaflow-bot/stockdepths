import { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { PortfolioSummary } from "../components/PortfolioSummary";
import { AddHoldingForm } from "../components/AddHoldingForm";
import { AddWatchForm } from "../components/AddWatchForm";
import { HoldingCard } from "../components/HoldingCard";
import { WatchRow } from "../components/WatchRow";
import { LoadingView } from "../components/StateViews";
import { computePortfolioPnL } from "../portfolio/pnl";
import { usePortfolio, type UsePortfolioDeps } from "./usePortfolio";

export type PortfolioScreenProps = UsePortfolioDeps;

/**
 * 관심·보유 tab — watchlist add/remove + holdings P&L (SPEC IA ②, Task 7).
 * All data is on-device only; P&L is deterministic local math against live quotes.
 */
export function PortfolioScreen(props: PortfolioScreenProps) {
  const ctrl = usePortfolio(props);
  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [sym, q] of Object.entries(ctrl.quotes)) m[sym] = q.price;
    return m;
  }, [ctrl.quotes]);
  const { rows, totals } = useMemo(
    () => computePortfolioPnL(ctrl.portfolio.holdings, priceMap),
    [ctrl.portfolio.holdings, priceMap],
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="portfolio-screen">
      <Text style={styles.title}>관심·보유</Text>
      <Text style={styles.privacy}>🔒 모든 데이터는 이 기기에만 저장됩니다 (로그인 없음).</Text>

      {ctrl.status === "loading" ? (
        <LoadingView />
      ) : (
        <View>
          <PortfolioSummary totals={totals} />

          {ctrl.quotesError ? (
            <View style={styles.quoteWarn} testID="quote-warning">
              <Text style={styles.quoteWarnText}>시세를 불러오지 못해 일부 수익률이 표시되지 않을 수 있습니다.</Text>
            </View>
          ) : null}

          <Text style={styles.section}>보유 종목</Text>
          <AddHoldingForm onAdd={ctrl.addHolding} />
          {ctrl.portfolio.holdings.length === 0 ? (
            <Text style={styles.empty}>아직 보유 종목이 없습니다. 매수가를 입력해 수익률을 추적하세요.</Text>
          ) : (
            rows.map((pnl) => <HoldingCard key={pnl.id} pnl={pnl} onRemove={ctrl.removeHolding} />)
          )}

          <Text style={styles.section}>관심 종목</Text>
          <AddWatchForm onAdd={ctrl.addWatch} />
          {ctrl.portfolio.watchlist.length === 0 ? (
            <Text style={styles.empty}>관심종목을 추가해 시세를 확인하세요.</Text>
          ) : (
            ctrl.portfolio.watchlist.map((w) => (
              <WatchRow key={w.symbol} symbol={w.symbol} quote={ctrl.quotes[w.symbol]} onRemove={ctrl.removeWatch} />
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  title: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  privacy: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: 2, marginBottom: tokens.space.lg },
  section: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, marginTop: tokens.space.md, marginBottom: tokens.space.md },
  empty: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, marginBottom: tokens.space.md },
  quoteWarn: {
    backgroundColor: tokens.color.warningBg,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.md,
  },
  quoteWarnText: { fontSize: tokens.font.size.sm, color: tokens.color.warningFg },
});
