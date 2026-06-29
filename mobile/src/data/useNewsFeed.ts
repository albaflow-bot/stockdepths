/**
 * 뉴스 피드 훅 — NewsSection 의 단일 데이터 소스.
 *
 *  - realtime=true (시장 속보): Supabase news 테이블에서 초기 SELECT 후 INSERT 를 구독해
 *    새 기사를 즉시 맨 앞에 끼운다(웹소켓 push). cron 적재 → 구독자에 실시간 반영.
 *  - 아니면(종목별 뉴스 / Supabase 미설정): 기존 on-demand 로더(/api/news) 1회 조회.
 *
 * Supabase 미설정(EXPO_PUBLIC_SUPABASE_* 부재)이면 realtime 이라도 로더로 폴백 — 화면은
 * 항상 degrade 로 동작(throw ✗).
 */
import { useEffect, useState } from "react";
import { supabaseClient } from "./supabase";
import { fetchNews, type NewsLoader } from "./newsClient";
import type { NewsArticle, NewsMarket } from "../types/news";

export interface UseNewsFeedParams {
  q: string;
  market: NewsMarket;
  limit: number;
  realtime: boolean;
  loader?: NewsLoader;
}

export interface NewsFeedState {
  articles: NewsArticle[];
  status: "loading" | "ready";
  /** Realtime 구독이 살아있을 때만 true (● LIVE 표시용). */
  live: boolean;
}

function rowToArticle(r: Record<string, unknown>): NewsArticle {
  return {
    title: typeof r["title"] === "string" ? r["title"] : "",
    source: typeof r["source"] === "string" ? r["source"] : "",
    publishedAt: typeof r["published_at"] === "string" ? r["published_at"] : "",
    link: typeof r["link"] === "string" ? r["link"] : "",
  };
}

export function useNewsFeed({ q, market, limit, realtime, loader }: UseNewsFeedParams): NewsFeedState {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [live, setLive] = useState(false);
  const client = realtime ? supabaseClient() : null;

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setLive(false);

    if (realtime && client) {
      // 초기 적재분 로드
      void client
        .from("news")
        .select("title,source,link,published_at")
        .eq("market", market)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit)
        .then(({ data }) => {
          if (!alive) return;
          setArticles((data ?? []).map((r) => rowToArticle(r as Record<string, unknown>)));
          setStatus("ready");
        });

      // 새 기사(INSERT) 즉시 구독 → 맨 앞에 prepend(중복 link 제외).
      const channel = client
        .channel(`news:${market}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "news", filter: `market=eq.${market}` },
          (payload) => {
            if (!alive) return;
            const a = rowToArticle(payload.new as Record<string, unknown>);
            if (!a.link) return;
            setArticles((prev) => (prev.some((p) => p.link === a.link) ? prev : [a, ...prev].slice(0, limit)));
          },
        )
        .subscribe((s) => {
          if (alive) setLive(s === "SUBSCRIBED");
        });

      return () => {
        alive = false;
        void client.removeChannel(channel);
      };
    }

    // 폴백: on-demand 1회 조회(종목별 뉴스 / Supabase 미설정).
    const load = loader ?? fetchNews;
    load({ q: q.trim(), market, limit })
      .then((list) => {
        if (!alive) return;
        setArticles(list);
        setStatus("ready");
      })
      .catch(() => {
        if (!alive) return;
        setArticles([]);
        setStatus("ready");
      });
    return () => {
      alive = false;
    };
  }, [q, market, limit, realtime, loader, client]);

  return { articles, status, live };
}
