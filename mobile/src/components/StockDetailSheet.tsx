/**
 * StockDetailSheet — 구글 파이낸스 스타일 종목 상세(모달). 추천·발굴·검색 카드 탭 시 열린다.
 *
 * HoldingSheet 의 모달 패턴(백드롭 탭 닫기)을 그대로 따른다. 내부:
 *  - 헤더: 종목명 + 코드 + 시장 라벨
 *  - 큰 현재가(last 우선, 없으면 stats.close) + 등락률 배지(시장색·▲▼)
 *  - 기간 탭(5일/1개월/3개월/1년/5년) → 선택 시 재조회
 *  - PriceChart (로딩 스피너/에러 한 줄 — throw 금지)
 *  - 스탯 그리드(시가·고가·저가 / 거래량·52주 최고·52주 최저)
 *  - 한 줄 신호(있으면) + [＋ 관심]/[＋ 보유]
 *
 * 시세 로드 실패는 한 줄 안내로 degrade 한다(렌더 트리 깨짐 ✗). 디자인 토큰만 사용.
 */

import { useEffect, useState } from "react";
import { View, Modal, Pressable, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { PriceChart } from "./PriceChart";
import { marketDirectionColor, directionOf, changeArrow } from "./marketColors";
import { fmtSignedPct } from "../formatters";
import { fetchHistory, type HistoryLoader } from "../data/historyClient";
import { marketLabel, type ExchangeMarket } from "../types/security";
import type { HistoryMarket, HistoryRange, HistoryResponse } from "../types/history";

export interface StockDetailTarget {
  symbol: string;
  market: "US" | "KR" | ExchangeMarket;
  name: string;
  last?: number | null;
  changePct?: number | null;
  signal?: { label: string; reason: string } | null;
}

export interface StockDetailSheetProps {
  target: StockDetailTarget | null;
  visible: boolean;
  onClose: () => void;
  onAddWatch: (symbol: string) => void;
  onAddHolding: (symbol: string) => void;
  watched: boolean;
  held: boolean;
  /** 시세 로더(테스트 주입). 미주입 시 실제 /api/history 클라이언트. */
  loader?: HistoryLoader;
  testID?: string;
}

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "5D", label: "5일" },
  { value: "1M", label: "1개월" },
  { value: "3M", label: "3개월" },
  { value: "1Y", label: "1년" },
  { value: "5Y", label: "5년" },
];

/** 거래소/그룹 마켓 → 차트·색상용 US|KR 그룹. */
function toMarketGroup(market: StockDetailTarget["market"]): HistoryMarket {
  if (market === "KR" || market === "KOSPI" || market === "KOSDAQ") return "KR";
  return "US";
}

/** 그룹 색상 관례용 대표 거래소(marketDirectionColor 는 거래소 단위). */
function representativeExchange(group: HistoryMarket): ExchangeMarket {
  return group === "KR" ? "KOSPI" : "NASDAQ";
}

/** 시장 그룹별 가격 표기: KR=원(정수·콤마), US=$(소수 2자리). 없으면 "—". */
function formatPriceByGroup(group: HistoryMarket, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (group === "KR") return `${Math.round(v).toLocaleString("ko-KR")}원`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 거래량 — 정수 콤마(시장 무관). 없으면 "—". */
function formatVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("ko-KR");
}

type LoadStatus = "loading" | "ready" | "error";

export function StockDetailSheet({
  target,
  visible,
  onClose,
  onAddWatch,
  onAddHolding,
  watched,
  held,
  loader,
  testID = "stock-detail-sheet",
}: StockDetailSheetProps) {
  const [range, setRange] = useState<HistoryRange>("1M");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const symbol = target?.symbol ?? null;
  const group = target ? toMarketGroup(target.market) : "US";

  // 열릴 때 기본 기간으로 리셋(이전 종목의 기간이 남지 않게).
  useEffect(() => {
    if (visible && symbol) setRange("1M");
  }, [visible, symbol]);

  // 시세 조회 — 열려 있고 대상이 있을 때만. 기간/종목 변경 시 재조회.
  useEffect(() => {
    if (!visible || !symbol) return;
    let alive = true;
    setStatus("loading");
    setErrorMessage(null);
    const load = loader ?? fetchHistory;
    load({ symbol, market: group, range })
      .then((res) => {
        if (!alive) return;
        setData(res);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErrorMessage(e instanceof Error ? e.message : "시세를 불러오지 못했습니다.");
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [visible, symbol, group, range, loader]);

  if (!target) return null;

  const stats = data?.stats;
  // 헤더 현재가: last 우선, 없으면 stats.close.
  const price = target.last != null && Number.isFinite(target.last) ? target.last : stats?.close ?? null;
  const changePct = target.changePct ?? null;
  const direction = directionOf(changePct);
  const changeColor = marketDirectionColor(representativeExchange(group), direction);
  const hasChange = changePct != null && Number.isFinite(changePct);
  const hasSignal = !!target.signal && !!target.signal.label?.trim() && !!target.signal.reason?.trim();
  const closes = (data?.points ?? []).map((p) => p.close);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`}>
        <Pressable style={styles.sheet} onPress={() => {}} testID={testID}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* 헤더: 종목명 · 코드 · 시장 */}
            <View style={styles.headerRow}>
              <Text style={styles.name} numberOfLines={1}>
                {target.name}
              </Text>
              <Text style={styles.code}>{target.symbol}</Text>
              <Text style={styles.market}>· {marketLabel(representativeExchange(group))}</Text>
            </View>

            {/* 큰 현재가 + 등락률 배지 */}
            <View style={styles.priceRow}>
              <Text style={styles.price} testID={`${testID}-price`}>
                {formatPriceByGroup(group, price)}
              </Text>
              {hasChange ? (
                <Text style={[styles.change, { color: changeColor }]} testID={`${testID}-change`}>
                  {changeArrow(direction)} {fmtSignedPct(changePct)}
                </Text>
              ) : null}
            </View>

            {/* 기간 탭 */}
            <View style={styles.rangeRow} testID={`${testID}-ranges`}>
              {RANGES.map((r) => {
                const on = r.value === range;
                return (
                  <Pressable
                    key={r.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setRange(r.value)}
                    style={[styles.rangePill, on ? styles.rangePillOn : null]}
                    testID={`${testID}-range-${r.value}`}
                  >
                    <Text style={[styles.rangeText, on ? styles.rangeTextOn : null]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 차트 영역 — 로딩/에러는 한 줄 graceful (throw 금지) */}
            <View style={styles.chartArea} testID={`${testID}-chart-area`}>
              {status === "loading" ? (
                <View style={styles.chartCenter} testID={`${testID}-loading`}>
                  <ActivityIndicator color={tokens.color.primary} />
                </View>
              ) : status === "error" ? (
                <Text style={styles.chartError} testID={`${testID}-error`}>
                  {errorMessage ?? "시세를 불러오지 못했습니다."}
                </Text>
              ) : (
                <PriceChart closes={closes} market={group} testID={`${testID}-chart`} />
              )}
            </View>

            {/* 스탯 그리드 (구글처럼: 시가·고가·저가 / 거래량·52주 최고·52주 최저) */}
            <View style={styles.statGrid} testID={`${testID}-stats`}>
              <Stat label="시가" value={formatPriceByGroup(group, stats?.open)} />
              <Stat label="고가" value={formatPriceByGroup(group, stats?.high)} />
              <Stat label="저가" value={formatPriceByGroup(group, stats?.low)} />
              <Stat label="거래량" value={formatVolume(stats?.volume)} />
              <Stat label="52주 최고" value={formatPriceByGroup(group, stats?.high52)} />
              <Stat label="52주 최저" value={formatPriceByGroup(group, stats?.low52)} />
            </View>

            {/* 한 줄 신호 (근거 동반, 있을 때만) */}
            {hasSignal ? (
              <View style={styles.signal} testID={`${testID}-signal`}>
                <Text style={styles.signalLabel}>한 줄 신호: {target.signal!.label}</Text>
                <Text style={styles.signalReason}>· {target.signal!.reason}</Text>
              </View>
            ) : null}

            {/* ＋관심 / ＋보유 */}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: watched }}
                accessibilityLabel={`${target.name} 관심목록에 추가`}
                onPress={() => onAddWatch(target.symbol)}
                style={[styles.btn, watched ? styles.btnDone : styles.btnWatch]}
                testID={`${testID}-watch`}
              >
                <Text style={[styles.btnText, watched ? styles.btnTextDone : styles.btnTextWatch]}>
                  {watched ? "관심 담김 ✓" : "＋ 관심"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: held }}
                accessibilityLabel={`${target.name} 보유목록에 추가`}
                onPress={() => onAddHolding(target.symbol)}
                style={[styles.btn, held ? styles.btnDone : styles.btnHold]}
                testID={`${testID}-hold`}
              >
                <Text style={[styles.btnText, held ? styles.btnTextDone : styles.btnTextHold]}>
                  {held ? "보유 담김 ✓" : "＋ 보유"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          <Pressable onPress={onClose} style={styles.cancel} testID={`${testID}-cancel`}>
            <Text style={styles.cancelText}>닫기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: tokens.color.bg,
    padding: tokens.space.md,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    maxHeight: "90%",
    gap: tokens.space.sm,
  },
  scrollBody: { gap: tokens.space.md },

  headerRow: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.xs, flexWrap: "wrap" },
  name: { fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, flexShrink: 1 },
  code: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  market: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },

  priceRow: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.sm },
  price: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  change: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold },

  rangeRow: { flexDirection: "row", gap: tokens.space.xs, flexWrap: "wrap" },
  rangePill: {
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  rangePillOn: { borderColor: tokens.color.primary, backgroundColor: tokens.color.primary },
  rangeText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.textSecondary },
  rangeTextOn: { color: tokens.color.primaryText, fontWeight: tokens.font.weight.bold },

  chartArea: { minHeight: 140, justifyContent: "center" },
  chartCenter: { height: 140, alignItems: "center", justifyContent: "center" },
  chartError: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, textAlign: "center", paddingVertical: tokens.space.xl },

  statGrid: { flexDirection: "row", flexWrap: "wrap" },
  statCell: {
    width: "33.33%",
    paddingVertical: tokens.space.sm,
    gap: 2,
  },
  statLabel: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  statValue: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },

  signal: { flexDirection: "row", alignItems: "baseline", gap: tokens.space.xs, flexWrap: "wrap" },
  signalLabel: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  signalReason: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, flexShrink: 1 },

  actions: { flexDirection: "row", gap: tokens.space.sm },
  btn: { flex: 1, paddingVertical: tokens.space.sm, borderRadius: tokens.radius.pill, alignItems: "center", borderWidth: 1.5 },
  btnWatch: { backgroundColor: tokens.color.surface, borderColor: tokens.color.primary },
  btnHold: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  btnDone: { backgroundColor: tokens.color.surfaceAlt, borderColor: tokens.color.border },
  btnText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  btnTextWatch: { color: tokens.color.primary },
  btnTextHold: { color: tokens.color.primaryText },
  btnTextDone: { color: tokens.color.textMuted },

  cancel: { alignItems: "center", paddingVertical: tokens.space.sm },
  cancelText: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
});
