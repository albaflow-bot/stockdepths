/**
 * 시장 속보 적재 (SPEC §5.3-Δ realtime). Google News RSS(신뢰 출처 게이팅)를 KR/US 시장
 * 키워드로 받아 public.news 에 upsert(link 충돌 무시). cron(15분)으로 돌리면 Supabase
 * Realtime 이 새 row 를 구독 클라에 즉시 푸시한다. 7일 초과 기사는 정리해 테이블을 가볍게 유지.
 *
 * 쓰기는 service_role(SUPABASE_SERVICE_ROLE_KEY)만 — RLS 우회. 종목별 뉴스는 무한(17k)이라
 * 여기 적재 ✗(on-demand /api/news 유지), 시장(KR/US) 단위만 실시간화.
 *
 * Usage: npm run refresh:news
 */

import { fetchNews } from "../news/googleNews.js";
import { readSupabaseConfig, type SupabaseConfig } from "../storage/supabaseRest.js";

const MARKETS = ["KR", "US"] as const;
type Mkt = (typeof MARKETS)[number];

const MARKET_QUERY: Record<Mkt, string> = {
  KR: "코스피 코스닥 증시",
  US: "US stock market",
};

/** link UNIQUE 충돌은 무시(이미 적재된 기사 재삽입 ✗). on_conflict=link 필수. */
async function upsertNews(cfg: SupabaseConfig, rows: unknown[]): Promise<number> {
  if (rows.length === 0) return 0;
  const res = await fetch(`${cfg.url}/rest/v1/news?on_conflict=link`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`news upsert HTTP ${res.status}: ${await res.text()}`);
  return rows.length;
}

/** 오래된 기사 정리(테이블 비대 방지). 실패는 비치명. */
async function pruneOld(cfg: SupabaseConfig, days = 7): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = await fetch(`${cfg.url}/rest/v1/news?created_at=lt.${encodeURIComponent(cutoff)}`, {
    method: "DELETE",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Prefer: "return=minimal" },
  });
  if (!res.ok) console.warn(`[refresh-news] prune HTTP ${res.status}`);
}

async function main(): Promise<void> {
  const cfg = readSupabaseConfig();
  if (!cfg) throw new Error("refresh-news 는 Supabase 설정(SUPABASE_URL/KEY)이 필요합니다.");

  let total = 0;
  for (const market of MARKETS) {
    let n = 0;
    try {
      const articles = await fetchNews({ q: MARKET_QUERY[market], market, limit: 15 });
      n = await upsertNews(
        cfg,
        articles.map((a) => ({
          market,
          title: a.title,
          source: a.source,
          link: a.link,
          published_at: a.publishedAt || null,
        })),
      );
    } catch (e) {
      console.error(`[refresh-news] ${market} 실패:`, e instanceof Error ? e.message : e);
    }
    console.log(`[refresh-news] ${market}: ${n}건 upsert`);
    total += n;
  }

  try {
    await pruneOld(cfg);
  } catch {
    /* prune 실패는 무시 */
  }
  console.log(`[refresh-news] done — 총 ${total}건 처리(중복은 무시됨)`);
}

main().catch((err) => {
  console.error("[refresh-news] failed:", err);
  process.exitCode = 1;
});
