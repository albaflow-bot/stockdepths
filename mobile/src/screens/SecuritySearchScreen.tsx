/**
 * 종목 검색·추가 화면 (SPEC §3.2-Δ A). SecuritySearch 컴포넌트를 온디바이스 포트폴리오
 * 와 결선한다: ＋관심 → 관심목록 즉시 추가(원터치), ＋보유 → 매수가·수량 입력 시트.
 *
 * 코드 없이 한글/영문 이름으로 찾아 담는 흐름을 완성한다(KR 단축코드도 담김).
 */

import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { SecuritySearch } from "../components/SecuritySearch";
import { HoldingSheet } from "../components/HoldingSheet";
import { usePortfolio, type UsePortfolioDeps } from "./usePortfolio";
import type { SecuritySearchLoader } from "../data/securitySearchClient";
import { type SecuritySearchItem } from "../types/security";

export interface SecuritySearchScreenProps extends UsePortfolioDeps {
  /** 검색 로더(테스트 주입). */
  searchLoader?: SecuritySearchLoader;
  testID?: string;
}

/** 포트폴리오에서 이미 담긴 코드 집합(대문자). */
function codeSet(symbols: string[]): Set<string> {
  return new Set(symbols.map((s) => s.toUpperCase()));
}

export function SecuritySearchScreen({ searchLoader, testID = "security-search-screen", ...deps }: SecuritySearchScreenProps) {
  const pf = usePortfolio(deps);
  const [pending, setPending] = useState<SecuritySearchItem | null>(null);

  const watchedCodes = codeSet(pf.portfolio.watchlist.map((w) => w.symbol));
  const heldCodes = codeSet(pf.portfolio.holdings.map((h) => h.symbol));

  return (
    <View style={styles.screen} testID={testID}>
      <SecuritySearch
        loader={searchLoader}
        watchedCodes={watchedCodes}
        heldCodes={heldCodes}
        onAddWatch={(item) => {
          void pf.addWatch(item.code); // 원터치 — 실패해도 화면 막지 않음(담김 ✓는 상태로 반영)
        }}
        onAddHolding={(item) => setPending(item)}
      />

      {/* ＋보유 → 매수가·수량 입력 시트 (검색에서 고른 종목은 잠금) */}
      <HoldingSheet
        pending={pending}
        onClose={() => setPending(null)}
        onAdd={async (input) => {
          const err = await pf.addHolding(input);
          if (!err) setPending(null); // 성공 시 시트 닫기
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
