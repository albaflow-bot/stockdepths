/**
 * NewsSection — 종목/시장 뉴스(SPEC §5.3 보조 입력). 자체 로딩하며, 한 건 탭 시 원문을
 * 외부 브라우저로 연다(본문 미표시 — 헤드라인+출처+시각만).
 *
 * "정보 나열로 끝나는 화면 = 미완성"(§0) 정합: 뉴스는 *맥락(왜)* 보조라, 타이밍 신호가
 * 있는 상세 시트/시장 브리핑 안에 배치되어 "그래서 뭘 할지"를 보강한다.
 *
 * 뉴스는 보조 정보 → 실패/빈 결과는 한 줄 안내로 degrade(렌더 트리 깨짐 ✗).
 */

import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { type NewsLoader } from "../data/newsClient";
import { useNewsFeed } from "../data/useNewsFeed";
import { NewsWebViewModal } from "./NewsWebViewModal";
import type { NewsArticle, NewsMarket } from "../types/news";

export interface NewsSectionProps {
  /** 검색어 — 종목명 또는 시장 키워드. 비면 섹션 자체를 렌더하지 않는다. */
  q: string;
  market: NewsMarket;
  title: string;
  /** 섹션 부제(예: "타이밍 판단의 맥락"). 없으면 미표시. */
  subtitle?: string;
  limit?: number;
  /** 뉴스 로더(테스트 주입). 미주입 시 실제 /api/news 클라이언트. */
  loader?: NewsLoader;
  /** 링크 열기(테스트 주입). 미주입 시 앱 내부 웹뷰. */
  onOpen?: (url: string) => void;
  /** true 면 Supabase Realtime 으로 실시간 구독(시장 속보). 미설정 시 on-demand 1회 조회. */
  realtime?: boolean;
  testID?: string;
}

/** ISO 시각 → 짧은 상대표기("방금"/"N시간 전"/"어제"/"M/D"). 파싱 실패 시 "". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const diffMin = Math.floor((now.getTime() - t.getTime()) / 60000);
  if (diffMin < 0) return "방금";
  if (diffMin < 60) return diffMin <= 1 ? "방금" : `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  return `${t.getMonth() + 1}/${t.getDate()}`;
}

export function NewsSection({
  q,
  market,
  title,
  subtitle,
  limit = 8,
  loader,
  onOpen,
  realtime,
  testID = "news-section",
}: NewsSectionProps) {
  const term = q.trim();
  const { articles, status, live } = useNewsFeed({ q: term, market, limit, realtime: !!realtime, loader });
  // 내부 웹뷰로 열 기사(외부 브라우저 대신). null 이면 닫힘.
  const [openArticle, setOpenArticle] = useState<NewsArticle | null>(null);

  // realtime(시장 속보)은 q 없이도 렌더. 그 외엔 검색어 없으면 섹션 자체를 안 그린다.
  if (!term && !realtime) return null;

  // 기본은 앱 내부 웹뷰로 열기(사용자 요청 — 외부 브라우저 ✗). onOpen 주입 시 그쪽 우선(테스트/오버라이드).
  const open = (a: NewsArticle) => {
    if (onOpen) return onOpen(a.link);
    setOpenArticle(a);
  };

  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {live ? (
          <Text style={styles.liveBadge} testID={`${testID}-live`}>
            ● LIVE
          </Text>
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {status === "loading" ? (
        <View style={styles.center} testID={`${testID}-loading`}>
          <ActivityIndicator color={tokens.color.primary} />
        </View>
      ) : articles.length === 0 ? (
        <Text style={styles.empty} testID={`${testID}-empty`}>
          관련 검증 뉴스가 아직 없어요. (공시·주요 언론사 기준)
        </Text>
      ) : (
        articles.map((a, i) => {
          const meta = [a.source, relativeTime(a.publishedAt)].filter(Boolean).join(" · ");
          return (
            <Pressable
              key={`${a.link}-${i}`}
              accessibilityRole="link"
              accessibilityLabel={`${a.title} — ${a.source} 기사 열기`}
              onPress={() => open(a)}
              style={styles.row}
              testID={`${testID}-item-${i}`}
            >
              <Text style={styles.headline} numberOfLines={2}>
                {a.title}
              </Text>
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            </Pressable>
          );
        })
      )}

      {/* 앱 내부 웹뷰 — 기사 원문(상단 ‹ 뒤로). 외부 브라우저 대신. */}
      <NewsWebViewModal
        visible={openArticle != null}
        url={openArticle?.link ?? null}
        title={openArticle?.source}
        onClose={() => setOpenArticle(null)}
        testID={`${testID}-webview`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: tokens.space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  title: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  liveBadge: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: "#e11d48" },
  subtitle: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  center: { paddingVertical: tokens.space.lg, alignItems: "center" },
  empty: { fontSize: tokens.font.size.sm, color: tokens.color.textMuted, paddingVertical: tokens.space.sm },
  row: {
    paddingVertical: tokens.space.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 2,
  },
  headline: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.textPrimary, lineHeight: 20 },
  meta: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
});
