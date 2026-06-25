/**
 * TimingBadge — the product's MAIN surface (SPEC 피드백 라운드 3 §5.4). The same
 * timing badge attaches to every stock surface: 관심·보유 탭, TOP 종목, 추천 카드.
 *
 * Rules baked in (SPEC §5.4 / memory 정합):
 *  • Korean text labels, NO ambiguous icons — 매수='매수 적정'(상승색),
 *    매도='매도 검토'(하락색), 보유유지='보유 유지', 관망='관망'.
 *  • Tone is the calm semantic palette (positive/negative/neutral/muted), SEPARATE
 *    from the app identity color — gamification/flavor never changes it. We never map
 *    a timing tone onto `tokens.color.primary`.
 *  • Every badge ALWAYS carries a one-line reason; a signal with no reason is not
 *    rendered (근거 없는 신호 ✗).
 *  • Tap expands a 장기×최근 2-axis mini chart + the reason + related news (when
 *    contextNewsIds resolve to items).
 *  • A fixed 'AI 참고 조언 · 투자 책임은 본인' disclaimer sits atop the badge area.
 *  • Accepts BOTH DailyBatch + OnDeviceRule sources; on conflict the personal rule is
 *    shown on top (both surfaced). See {@link TimingSignalArea}.
 */

import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens, cardShadow, badgeColors, type BadgeTone } from "../theme/tokens";
import { Badge } from "./Badge";
import { openExternal } from "./openExternal";
import { barFraction, maxMagnitude, pctWidth } from "../charts/proportion";
import { fmtSignedPct } from "../formatters";
import {
  TIMING_ACTION_LABELS,
  type TimingAction,
  type TimingSignal,
} from "../types/timing";

/** The fixed badge-area disclaimer (SPEC §5.4 / §3.2 정합). */
export const TIMING_DISCLAIMER = "AI 참고 조언 · 투자 책임은 본인";

/**
 * TimingAction → semantic tone. Deliberately the calm finance palette, NOT the
 * identity color: 매수=상승(positive), 매도=하락(negative), 보유유지=neutral, 관망=muted.
 */
export const TIMING_BADGE_TONE: Record<TimingAction, BadgeTone> = {
  buy: "positive",
  sell: "negative",
  hold: "neutral",
  watch: "muted",
};

/** Short human label for the signal source (개인 규칙 우선 표기용). */
const SOURCE_LABEL: Record<TimingSignal["source"], string> = {
  onDeviceRule: "개인 규칙",
  dailyBatch: "AI 추천",
};

/** 2-axis (장기×최근) data for the expanded chart. */
export interface TimingAxes {
  /** Long-term axis — 5Y trend, in %. */
  longTermPct: number | null;
  /** Recent axis — recent momentum, in %. */
  recentPct: number | null;
}

/** A related news item resolved from a signal's contextNewsIds. */
export interface TimingNewsRef {
  id: string;
  title: string;
  url?: string;
}

export interface TimingBadgeProps {
  signal: TimingSignal;
  /** Optional 2-axis data for the expanded chart (omit when unavailable). */
  axes?: TimingAxes;
  /** News resolved from signal.contextNewsIds (optional). */
  relatedNews?: TimingNewsRef[];
  /** Show the small source tag (개인 규칙 / AI 추천). Default true. */
  showSource?: boolean;
  defaultExpanded?: boolean;
  testID?: string;
}

/** True when a signal is renderable (must carry a one-line reason). */
export function hasReason(signal: TimingSignal): boolean {
  return !!signal.oneLineReason && signal.oneLineReason.trim().length > 0;
}

/**
 * A single timing badge: label pill + one-line reason, tappable to expand a 2-axis
 * chart + reason + related news. Renders `null` if the signal has no reason.
 */
export function TimingBadge({
  signal,
  axes,
  relatedNews,
  showSource = true,
  defaultExpanded = false,
  testID,
}: TimingBadgeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!hasReason(signal)) return null; // 근거 없는 신호 ✗

  const sym = signal.ticker.toUpperCase();
  const label = TIMING_ACTION_LABELS[signal.action];
  const tone = TIMING_BADGE_TONE[signal.action];
  const news = (relatedNews ?? []).filter((n) => signal.contextNewsIds.includes(n.id));
  const canExpand = !!axes || news.length > 0;
  const tid = testID ?? `timing-badge-${sym}-${signal.source}`;

  return (
    <View style={styles.badgeWrap} testID={tid}>
      <Pressable
        style={styles.headerRow}
        onPress={canExpand ? () => setExpanded((v) => !v) : undefined}
        accessibilityRole={canExpand ? "button" : undefined}
        accessibilityState={canExpand ? { expanded } : undefined}
        testID={`${tid}-toggle`}
      >
        <Badge text={label} tone={tone} testID={`${tid}-pill`} />
        {showSource ? <Text style={styles.source}>{SOURCE_LABEL[signal.source]}</Text> : null}
        {canExpand ? <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text> : null}
      </Pressable>

      {/* The one-line reason ALWAYS accompanies the badge. */}
      <Text style={styles.reason} testID={`${tid}-reason`}>
        {signal.oneLineReason}
      </Text>

      {expanded ? (
        <View style={styles.detail} testID={`${tid}-detail`}>
          {axes ? <TwoAxisChart axes={axes} /> : null}
          {news.length > 0 ? (
            <View style={styles.newsList} testID={`${tid}-news`}>
              <Text style={styles.newsHeader}>관련 뉴스</Text>
              {news.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={n.url ? () => openExternal(n.url!) : undefined}
                  testID={`${tid}-news-${n.id}`}
                >
                  <Text style={[styles.newsItem, n.url ? styles.newsLink : null]}>• {n.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** 장기(5Y) × 최근 2-axis mini chart — two signed bars (infographic, not a list). */
export function TwoAxisChart({ axes }: { axes: TimingAxes }) {
  const max = maxMagnitude(axes.longTermPct, axes.recentPct);
  const Row = ({ label, value, testID }: { label: string; value: number | null; testID: string }) => {
    const positive = (value ?? 0) >= 0;
    const color = positive ? tokens.color.positive : tokens.color.negative;
    return (
      <View style={styles.axisRow} testID={testID}>
        <Text style={styles.axisLabel}>{label}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: pctWidth(barFraction(value, max)), backgroundColor: color }]} />
        </View>
        <Text style={styles.axisValue}>{fmtSignedPct(value)}</Text>
      </View>
    );
  };
  return (
    <View style={styles.axes} testID="timing-two-axis">
      <Row label="장기(5년)" value={axes.longTermPct} testID="axis-long" />
      <Row label="최근 흐름" value={axes.recentPct} testID="axis-recent" />
    </View>
  );
}

export interface TimingSignalAreaProps {
  /** Personal OnDeviceRule signal — shown on TOP when present (SPEC §5.4 충돌 우선). */
  personal?: TimingSignal;
  /** DailyBatch signal — shown below the personal one. */
  batch?: TimingSignal;
  axes?: TimingAxes;
  relatedNews?: TimingNewsRef[];
  /** When > 0, show a '내 보유 종목 관련 뉴스 N건' badge (SPEC §5.3 linked_tickers). */
  holdingNewsCount?: number;
  /** Hide the fixed disclaimer (e.g. when a parent already shows one). Default false. */
  hideDisclaimer?: boolean;
  testID?: string;
}

/**
 * The badge AREA for one stock: a fixed disclaimer on top, an optional holdings-news
 * badge, then the ordered timing badges (personal rule first, batch below). Renders
 * nothing actionable when neither signal carries a reason.
 */
export function TimingSignalArea({
  personal,
  batch,
  axes,
  relatedNews,
  holdingNewsCount = 0,
  hideDisclaimer = false,
  testID = "timing-area",
}: TimingSignalAreaProps) {
  // Personal (OnDeviceRule) on top, then batch (DailyBatch). Drop reason-less signals.
  const ordered = [personal, batch].filter(
    (s): s is TimingSignal => !!s && hasReason(s),
  );
  if (ordered.length === 0 && holdingNewsCount <= 0) return null;

  return (
    <View style={styles.area} testID={testID}>
      {!hideDisclaimer ? (
        <Text style={styles.disclaimer} testID={`${testID}-disclaimer`}>
          {TIMING_DISCLAIMER}
        </Text>
      ) : null}

      {holdingNewsCount > 0 ? (
        <View style={styles.newsBadge} testID={`${testID}-holding-news`}>
          <Text style={styles.newsBadgeText}>📄 내 보유 종목 관련 뉴스 {holdingNewsCount}건</Text>
        </View>
      ) : null}

      {ordered.map((signal, i) => (
        <TimingBadge
          key={`${signal.source}-${signal.ticker}`}
          signal={signal}
          axes={axes}
          relatedNews={relatedNews}
          // First (personal-priority) badge defaults to letting the user expand detail.
          defaultExpanded={false}
          testID={`${testID}-badge-${i}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    gap: tokens.space.sm,
    padding: tokens.space.md,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...cardShadow,
  },
  disclaimer: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.textMuted,
    fontWeight: tokens.font.weight.medium,
  },
  newsBadge: {
    alignSelf: "flex-start",
    backgroundColor: tokens.color.neutralBg,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.sm,
  },
  newsBadgeText: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.neutralFg },

  badgeWrap: { gap: tokens.space.xs },
  headerRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  source: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  chevron: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginLeft: "auto" },
  reason: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 19 },

  detail: { gap: tokens.space.sm, marginTop: tokens.space.xs },
  axes: { gap: tokens.space.xs },
  axisRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  axisLabel: { width: 64, fontSize: tokens.font.size.xs, color: tokens.color.textSecondary },
  track: { flex: 1, height: 12, backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.pill, overflow: "hidden" },
  fill: { height: 12, borderRadius: tokens.radius.pill, minWidth: 2 },
  axisValue: { width: 56, textAlign: "right", fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },

  newsList: { gap: tokens.space.xs },
  newsHeader: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.textMuted },
  newsItem: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 19 },
  newsLink: { color: tokens.color.primary, textDecorationLine: "underline" },
});
