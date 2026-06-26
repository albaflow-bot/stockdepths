/**
 * SecuritySearch — 코드 없이 이름으로 종목을 찾아 관심/보유에 담는 화면 컴포넌트
 * (SPEC §3.2-Δ A). 단일 검색창(한글/영문/코드) + 시장·정렬 토글 + 결과 카드 리스트.
 *
 * "골라 담기" 대시보드형 진입(learnings 정합): 빈 입력일 때도 안내가 살아있고, 입력
 * 즉시 결과가 흐른다. 각 카드는 한 줄 신호로 환원되며 ＋관심/＋보유 원터치로 담는다.
 *
 * 데이터·담기 동작은 주입식(loader/onAddWatch/onAddHolding)이라 단위 테스트가 결정적.
 */

import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { TextField } from "./TextField";
import { SecuritySearchCard } from "./SecuritySearchCard";
import { useSearchSecurities } from "../screens/useSearchSecurities";
import type { SecuritySearchLoader } from "../data/securitySearchClient";
import type { MarketGroup, SearchSort, SecuritySearchItem } from "../types/security";

export interface SecuritySearchProps {
  /** API 로더(테스트 주입). 기본은 실제 /api/search 클라이언트. */
  loader?: SecuritySearchLoader;
  /** ＋관심 — 코드 입력 없이 원터치. */
  onAddWatch: (item: SecuritySearchItem) => void;
  /** ＋보유 — 매수가·수량 입력 시트로 이어짐(상위가 처리). */
  onAddHolding: (item: SecuritySearchItem) => void;
  /** 카드 본문 탭 — 상세 모달 열기(상위가 처리). 없으면 본문 비탭. */
  onPressItem?: (item: SecuritySearchItem) => void;
  /** 이미 관심에 담긴 코드 집합(대문자). */
  watchedCodes?: Set<string>;
  /** 이미 보유에 담긴 코드 집합(대문자). */
  heldCodes?: Set<string>;
  /** 디바운스(ms). 테스트는 0. */
  debounceMs?: number;
  testID?: string;
}

const MARKETS: Array<{ value: MarketGroup; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "KR", label: "한국" },
  { value: "US", label: "미국" },
];

const SORTS: Array<{ value: SearchSort; label: string }> = [
  { value: "turnover", label: "거래대금" },
  { value: "change", label: "등락률" },
];

function Toggle<T extends string>({
  options,
  value,
  onChange,
  groupTestID,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  groupTestID: string;
}) {
  return (
    <View style={styles.toggleRow} testID={groupTestID}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.pill, on ? styles.pillOn : null]}
            testID={`${groupTestID}-${o.value}`}
          >
            <Text style={[styles.pillText, on ? styles.pillTextOn : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SecuritySearch({
  loader,
  onAddWatch,
  onAddHolding,
  onPressItem,
  watchedCodes,
  heldCodes,
  debounceMs,
  testID = "security-search",
}: SecuritySearchProps) {
  const s = useSearchSecurities({ loader, debounceMs });
  const watched = watchedCodes ?? new Set<string>();
  const held = heldCodes ?? new Set<string>();

  return (
    <View style={styles.container} testID={testID}>
      <TextField
        label="종목 검색"
        value={s.query}
        onChangeText={s.setQuery}
        placeholder="이름·코드로 검색 (예: 삼성, apple, 005930)"
        autoCapitalize="none"
        testID={`${testID}-input`}
      />

      <View style={styles.filters}>
        <Toggle options={MARKETS} value={s.market} onChange={s.setMarket} groupTestID={`${testID}-market`} />
        <Toggle options={SORTS} value={s.sort} onChange={s.setSort} groupTestID={`${testID}-sort`} />
      </View>

      {s.status === "idle" ? (
        <View style={styles.hint} testID={`${testID}-idle`}>
          <Text style={styles.hintText}>이름으로 검색하세요. 코드를 몰라도 됩니다.</Text>
          <Text style={styles.hintSub}>한글·영문·티커 모두 부분일치로 찾습니다.</Text>
        </View>
      ) : null}

      {s.status === "loading" ? (
        <View style={styles.center} testID={`${testID}-loading`}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={styles.hintSub}>검색 중…</Text>
        </View>
      ) : null}

      {s.status === "empty" ? (
        <View style={styles.center} testID={`${testID}-empty`}>
          <Text style={styles.hintText}>“{s.query.trim()}” 검색 결과가 없습니다.</Text>
          <Text style={styles.hintSub}>다른 이름이나 코드로 다시 검색해 보세요.</Text>
        </View>
      ) : null}

      {s.status === "error" ? (
        <View style={styles.center} testID={`${testID}-error`}>
          <Text style={styles.hintText}>{s.errorMessage ?? "검색에 실패했습니다."}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={s.reload}
            style={styles.retry}
            testID={`${testID}-retry`}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}

      {s.status === "ready" ? (
        <ScrollView style={styles.list} testID={`${testID}-results`} keyboardShouldPersistTaps="handled">
          {s.items.map((item) => (
            <SecuritySearchCard
              key={`${item.market}:${item.code}`}
              item={item}
              watched={watched.has(item.code.toUpperCase())}
              held={held.has(item.code.toUpperCase())}
              onAddWatch={onAddWatch}
              onAddHolding={onAddHolding}
              onPress={onPressItem}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: tokens.space.md, padding: tokens.space.md, backgroundColor: tokens.color.bg },
  filters: { gap: tokens.space.sm },
  toggleRow: { flexDirection: "row", gap: tokens.space.sm },
  pill: {
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  pillOn: { borderColor: tokens.color.primary, backgroundColor: tokens.color.primary },
  pillText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.textSecondary },
  pillTextOn: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },

  list: { flex: 1 },
  hint: { paddingVertical: tokens.space.xl, gap: tokens.space.xs, alignItems: "center" },
  center: { paddingVertical: tokens.space.xl, gap: tokens.space.sm, alignItems: "center" },
  hintText: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, textAlign: "center" },
  hintSub: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, textAlign: "center" },
  retry: {
    marginTop: tokens.space.sm,
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.md,
  },
  retryText: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },
});
