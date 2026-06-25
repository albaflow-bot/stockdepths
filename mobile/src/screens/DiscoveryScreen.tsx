/**
 * 발굴 화면 (SPEC §1-Δ: 기존 '오늘의 추천' → '오늘의 발굴'). DiscoveryTab(6 카테고리
 * 섹션)을 온디바이스 포트폴리오와 결선한다: ＋관심 원터치 · ＋보유 입력 시트.
 * 검색 화면과 동일한 담기 흐름을 공유한다(HoldingSheet 재사용).
 */

import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { DiscoveryTab } from "../components/DiscoveryTab";
import { HoldingSheet } from "../components/HoldingSheet";
import { usePortfolio, type UsePortfolioDeps } from "./usePortfolio";
import type { DiscoveryLoader } from "../data/discoveryClient";
import type { PicksMarketLoader } from "../components/TodaysPicksSection";
import type { SecuritySearchItem } from "../types/security";

export interface DiscoveryScreenProps extends UsePortfolioDeps {
  /** 발굴 로더(테스트 주입). */
  discoveryLoader?: DiscoveryLoader;
  /** '오늘의 추천' 픽 로더(테스트 주입). */
  picksLoader?: PicksMarketLoader;
  testID?: string;
}

function codeSet(symbols: string[]): Set<string> {
  return new Set(symbols.map((s) => s.toUpperCase()));
}

export function DiscoveryScreen({ discoveryLoader, picksLoader, testID = "discovery-screen", ...deps }: DiscoveryScreenProps) {
  const pf = usePortfolio(deps);
  const [pending, setPending] = useState<SecuritySearchItem | null>(null);

  return (
    <View style={styles.screen} testID={testID}>
      <DiscoveryTab
        loader={discoveryLoader}
        picksLoader={picksLoader}
        watchedCodes={codeSet(pf.portfolio.watchlist.map((w) => w.symbol))}
        heldCodes={codeSet(pf.portfolio.holdings.map((h) => h.symbol))}
        onAddWatch={(item) => {
          void pf.addWatch(item.code);
        }}
        onAddPickWatch={(symbol) => {
          void pf.addWatch(symbol);
        }}
        onAddHolding={(item) => setPending(item)}
      />

      <HoldingSheet
        pending={pending}
        onClose={() => setPending(null)}
        onAdd={async (input) => {
          const err = await pf.addHolding(input);
          if (!err) setPending(null);
          return err;
        }}
        testID={`${testID}-sheet`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.bg },
});
