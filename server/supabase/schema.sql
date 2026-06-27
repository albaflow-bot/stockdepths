-- Supabase schema for AI 주식 타이밍 알리미 (server-side storage).
--
-- Run this once in the Supabase SQL editor (or via the CLI) before deploying.
-- Two tables back the two stores; both hold the domain object as JSONB so the
-- application's TypeScript types stay the single source of truth.

-- The shared public daily-picks artifact (one row per market+date, upserted).
create table if not exists public.daily_picks_artifacts (
  market     text        not null,
  date       date        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (market, date)
);

-- Append-only, immutable track record (one row per recommendation; never updated).
-- The id ("market:date:symbol") makes inserts idempotent, so re-running a day's
-- batch can never double-log the same recommendation.
create table if not exists public.track_record (
  id         text        primary key,
  date       date        not null,
  symbol     text        not null,
  data       jsonb       not null,
  logged_at  timestamptz not null default now()
);

create index if not exists track_record_date_idx on public.track_record (date);

-- ── Timing main feature (SPEC 피드백 라운드 3 §5.3–§5.4, §5.6) ───────────────────
-- DailyBatch TimingSignals + the daily market brief are written IMMUTABLY into the
-- SAME batch transaction as track_record above (SPEC §5.6), so the §5 성적표 can
-- later verify "Buy 신호 후 실제 상승했나" against frozen history. Append-only:
-- rows are inserted once, never UPDATEd or DELETEd. The id makes inserts idempotent
-- so re-running a day's batch can't double-log the same signal/brief.

-- One row per DailyBatch timing signal. id = "market:date:ticker" (source is always
-- DailyBatch here; OnDeviceRule signals are evaluated on-device and never stored).
-- confidence is a NOT NULL column (not just inside JSONB) — it is the direct input
-- to the scorecard hit-rate, so it is hoisted out for honest querying/aggregation.
create table if not exists public.timing_signal (
  id           text        primary key,
  market       text        not null,
  date         date        not null,
  ticker       text        not null,
  action       text        not null,
  confidence   real        not null,
  -- context_news_ids: JSON string array (SPEC §5.4 — no FK, 무로그인·로컬 정합).
  -- evaluated_at: stored UTC inside `data`. Full TimingSignal lives in `data`.
  data         jsonb       not null,
  logged_at    timestamptz not null default now()
);

create index if not exists timing_signal_date_idx on public.timing_signal (date);
create index if not exists timing_signal_ticker_idx on public.timing_signal (ticker);

-- One row per market+date daily market brief (SPEC §5.3). id = "market:date".
-- headline_summary, sector_signals, linked_tickers, source_urls live in `data`.
create table if not exists public.daily_market_brief (
  id         text        primary key,
  market     text        not null,
  date       date        not null,
  data       jsonb       not null,
  logged_at  timestamptz not null default now()
);

create index if not exists daily_market_brief_date_idx on public.daily_market_brief (date);

-- Registered device push tokens for the daily FCM digest (mutable registry:
-- upserted on register, deleted on unregister/prune). Deduped by token.
create table if not exists public.device_tokens (
  token         text        primary key,
  platform      text        not null default 'android',
  registered_at timestamptz not null default now()
);

-- ── 발굴 스크리너 + 한글 검색 (SPEC 피드백 라운드 4 §3.2-Δ B, §3.3-Δ) ──────────────
-- 후보 선정의 원천은 결정론적 시장 스캔(엣지)이고 LLM 은 한 줄 라벨만 얹는다
-- (§0-Δ). 아래 세 테이블이 한글 검색 / 카테고리 스크리닝 / 스파크라인의 데이터
-- 기반이다. 마스터는 매일 1회 upsert(가변), daily_screen 은 일별 스냅샷(asof 별
-- append), weekly_series 는 종목당 1행 캐시(매일 갱신).

-- 한글 부분일치 검색(LIKE '%삼성%')은 일반 b-tree 인덱스로 가속 불가 →
-- pg_trgm 의 trigram GIN 인덱스가 필요하다. 확장은 한 번만 활성화.
create extension if not exists pg_trgm;

-- 전종목 마스터 (검색 인덱스). 코드 없이 이름으로 찾기 위한 단일 진실원천.
-- market: 'KOSPI'|'KOSDAQ'|'NASDAQ'|'NYSE'. (market, code) 복합 PK 로 멀티마켓
-- 동일코드 충돌 회피. 무료 공개 거래소 마스터(KRX/Nasdaq) 우선, 없으면 크롤링.
create table if not exists public.security_master (
  market     text    not null,            -- 'KOSPI'|'KOSDAQ'|'NASDAQ'|'NYSE'
  code       text    not null,            -- 단축코드/티커
  name_ko    text,                        -- 한글 종목명 (KR)
  name_en    text,                        -- 영문명
  is_etf     integer not null default 0,
  delisted   integer not null default 0,  -- 관리/상폐 제외 토글의 기반
  updated_at timestamptz not null default now(),
  primary key (market, code)
);

-- 한글/영문 부분일치 검색 가속 (LIKE '%q%'). trigram GIN.
create index if not exists idx_master_name_ko_trgm
  on public.security_master using gin (name_ko gin_trgm_ops);
create index if not exists idx_master_name_en_trgm
  on public.security_master using gin (name_en gin_trgm_ops);

-- 일별 스크리닝 스냅샷 (스크리너 입력). 일배치가 전종목 계산 후 asof 별로 적재.
-- 스크리너는 이 테이블의 정렬·필터만 수행(LLM 호출 0). asof 별 행을 남기는
-- append 성격이라 과거 스냅샷이 보존된다(사후 검증 정합).
create table if not exists public.daily_screen (
  market     text not null,
  code       text not null,
  asof       date not null,
  last       double precision,   -- 당일 종가/현재가
  change_pct double precision,   -- 전일대비 등락률(%)
  volume     double precision,   -- 거래량
  turnover   double precision,   -- 거래대금 (단순 거래량 ✗, 대금 기준)
  rvol       double precision,   -- 거래량 / 20일 평균거래량
  high_52w   double precision,
  low_52w    double precision,
  rsi14      double precision,
  market_cap double precision,   -- 시가총액(원/달러) — 대형주 식별·분리용
  primary key (market, code, asof)
);

-- 기존 DB 에 market_cap 컬럼 보강(멱등).
alter table public.daily_screen add column if not exists market_cap double precision;

-- (market, code, asof) 복합 PK 가 일별 조회를 이미 가속하지만, 카테고리
-- 스크리닝은 "특정 asof 의 전종목을 등락률/거래대금/RVOL 로 정렬"하므로
-- asof 선두 인덱스를 추가해 당일 스냅샷 스캔을 가속한다.
create index if not exists idx_daily_screen_asof on public.daily_screen (asof);

-- 주간 추이 (스파크라인). 종목당 1행, 매일 갱신(upsert). closes 는 최근
-- 7거래일 종가 JSON 배열 → 검색 결과 카드에서 즉시 미니 차트 렌더.
create table if not exists public.weekly_series (
  market     text        not null,
  code       text        not null,
  closes     jsonb       not null,   -- 최근 7거래일 종가 배열 [c1..c7]
  updated_at timestamptz not null default now(),
  primary key (market, code)
);

-- 종목 검색 뷰 (SPEC §3.2-Δ C: GET /api/search). LIKE·JOIN·정렬을 DB 로 밀어
-- 한 번의 PostgREST 호출로 마스터+최신스냅샷+주간추이를 합쳐 반환한다.
-- daily_screen 은 종목당 asof 가 여럿이므로 lateral 로 *최신 한 행* 만 붙인다.
-- 클라(또는 검색 핸들러)는 이 뷰에 부분일치 필터를 건다:
--   security_search_v?or=(name_ko.ilike.*q*,name_en.ilike.*q*,code.ilike.*q*)
--     &delisted=eq.0&market=in.(NASDAQ,NYSE)&order=turnover.desc.nullslast&limit=30
create or replace view public.security_search_v as
select
  m.market, m.code, m.name_ko, m.name_en, m.is_etf, m.delisted,
  d.asof, d.last, d.change_pct, d.volume, d.turnover, d.rvol,
  d.high_52w, d.low_52w, d.rsi14,
  w.closes as weekly,
  d.market_cap
from public.security_master m
left join lateral (
  select ds.asof, ds.last, ds.change_pct, ds.volume, ds.turnover,
         ds.rvol, ds.high_52w, ds.low_52w, ds.rsi14, ds.market_cap
  from public.daily_screen ds
  where ds.market = m.market and ds.code = m.code
  order by ds.asof desc
  limit 1
) d on true
left join public.weekly_series w
  on w.market = m.market and w.code = m.code;

-- 발굴 탭 읽기 모델 (SPEC §3.2-Δ 발굴 탭 / GET /api/discover). 카테고리별 후보 +
-- 신호 + 통계를 하루치 아티팩트로 통째 JSONB 보관 — 발굴 탭이 한 번에 읽는다
-- (daily_picks_artifacts 와 동일 패턴). (market, asof) PK 라 과거 스냅샷도 보존되며,
-- 발굴 탭은 market 별 최신 asof 한 행만 읽는다(order=asof.desc&limit=1).
create table if not exists public.discovery_artifacts (
  market     text        not null,   -- 'US'|'KR'
  asof       date        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (market, asof)
);
