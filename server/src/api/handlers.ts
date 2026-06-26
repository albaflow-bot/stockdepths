/**
 * HTTP API handlers (MVP integration fix).
 *
 * The mobile client calls /api/picks/today, /api/quotes, and /api/scorecard — but
 * nothing exposed them. These handlers wire those endpoints to the existing
 * services (ArtifactStore, the cached market adapter, ScorecardService) so the app
 * works end-to-end. Handlers are pure-ish (services injected, return a status +
 * JSON body) so they're testable without opening a socket.
 */

import { getMarketRegistry } from "../market/index.js";
import type { Market, MarketSourceAdapter, Quote } from "../market/types.js";
import { ArtifactStore } from "../pipeline/artifactStore.js";
import { ScorecardService } from "../track/scorecard.js";
import { TimingAccuracyService } from "../track/timingAccuracy.js";
import { TimingSignalStore } from "../timing/store.js";
import type { DeviceTokenStore } from "../push/tokenStore.js";
import type { DeviceToken } from "../push/types.js";
import type { MarketGroup, SecuritySearchProvider } from "../screener/types.js";
import type { ScreenPersistence } from "../screener/screenStore.js";
import {
  createArtifactStore,
  createTrackStore,
  createTokenStore,
  createSearchStore,
  createScreenStore,
} from "../storage/index.js";
import {
  handleEdgeGate,
  handleEdgeSelect,
  handleSpecAnswers,
  matchEdgeGatePath,
  matchEdgeSelectPath,
  matchSpecAnswersPath,
  defaultEdgeGateDeps,
  type EdgeGateDeps,
} from "../edge/handler.js";

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiDeps {
  adapter: MarketSourceAdapter;
  artifactStore: ArtifactStore;
  scorecard: ScorecardService;
  /** Timing-signal accuracy (SPEC §5.6). Reads the append-only DailyBatch signal log. */
  timingAccuracy: TimingAccuracyService;
  /** Returns today's date (YYYY-MM-DD); injectable for tests. */
  today: () => string;
  /** Device push-token registry; optional — lazily built when a device registers. */
  tokenStore?: DeviceTokenStore;
  /** 종목 검색 제공자 (SPEC §3.2-Δ); optional — lazily built on first /api/search. */
  searchStore?: SecuritySearchProvider;
  /** 발굴 아티팩트 읽기 (SPEC §3.2-Δ 발굴 탭); optional — lazily built on /api/discover. */
  screenStore?: ScreenPersistence;
  /** Edge gate (SPEC §5) deps; optional — lazily built when a POST first needs it. */
  edgeGate?: EdgeGateDeps;
}

/**
 * Build the default deps (cached US adapter + stores). The stores are created via
 * the storage factory, so they persist to Supabase when configured (the Vercel/
 * serverless path) and fall back to disk for local dev and tests.
 */
export function defaultApiDeps(): ApiDeps {
  const adapter = getMarketRegistry().require("US");
  return {
    adapter,
    artifactStore: createArtifactStore(),
    scorecard: new ScorecardService(createTrackStore(), adapter),
    timingAccuracy: new TimingAccuracyService(new TimingSignalStore(), adapter),
    today: () => new Date().toISOString().slice(0, 10),
    tokenStore: createTokenStore(),
    searchStore: createSearchStore(),
    screenStore: createScreenStore(),
    edgeGate: defaultEdgeGateDeps(),
  };
}

/**
 * POST /api/devices/register — register (or refresh) a device's push token so the
 * daily digest can reach it. Body: { token: string, platform?: "android"|"ios"|"web" }.
 */
export async function handleRegisterDevice(body: unknown, deps: ApiDeps): Promise<ApiResponse> {
  const b = (body ?? {}) as { token?: unknown; platform?: unknown };
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return { status: 400, body: { error: "token is required" } };
  const platform: DeviceToken["platform"] =
    b.platform === "ios" || b.platform === "web" ? b.platform : "android";
  const store = deps.tokenStore ?? createTokenStore();
  store.register(token, platform, new Date().toISOString());
  await store.flush();
  return { status: 200, body: { ok: true } };
}

/** POST /api/devices/unregister — remove a device token. Body: { token: string }. */
export async function handleUnregisterDevice(body: unknown, deps: ApiDeps): Promise<ApiResponse> {
  const b = (body ?? {}) as { token?: unknown };
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return { status: 400, body: { error: "token is required" } };
  const store = deps.tokenStore ?? createTokenStore();
  const removed = store.remove([token]);
  await store.flush();
  return { status: 200, body: { ok: true, removed } };
}

/** GET /api/picks/today?market=US&date=YYYY-MM-DD */
export async function handlePicksToday(
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  const market = (query["market"]?.toUpperCase() as Market) || "US";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query["date"] ?? "") ? query["date"]! : deps.today();
  // 오늘자 추천이 아직 없으면(주말·UTC/KST 시차·배치 지연) 404 대신 직전 추천으로 폴백.
  // 명시적 date 질의는 그 날짜만(과거 조회 의미 보존), 무지정(오늘)일 때만 최신 폴백.
  const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(query["date"] ?? "");
  const artifact = deps.artifactStore.get(market, date) ?? (explicitDate ? undefined : deps.artifactStore.getLatest(market));
  if (!artifact) {
    return { status: 404, body: { error: `no picks for ${market} ${date}` } };
  }
  return { status: 200, body: artifact };
}

/** Map the internal Quote to the compact shape the client expects. */
function toClientQuote(q: Quote) {
  return {
    symbol: q.symbol,
    price: q.price,
    previousClose: q.previousClose,
    changePercent: q.changePercent,
    asOf: q.asOf,
  };
}

/** GET /api/quotes?symbols=AAPL,MSFT */
export async function handleQuotes(
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  const raw = query["symbols"] ?? "";
  const symbols = [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (symbols.length === 0) {
    return { status: 400, body: { error: "symbols query parameter is required" } };
  }
  // Resilient: a single bad symbol must not fail the whole request.
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        return toClientQuote(await deps.adapter.getQuote(sym));
      } catch {
        return null;
      }
    }),
  );
  return { status: 200, body: results.filter((q): q is ReturnType<typeof toClientQuote> => q != null) };
}

/** GET /api/scorecard?asOf=YYYY-MM-DD */
export async function handleScorecard(
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(query["asOf"] ?? "") ? query["asOf"]! : deps.today();
  const scorecard = await deps.scorecard.compute(asOf);
  return { status: 200, body: scorecard };
}

/** GET /api/scorecard/timing?asOf=YYYY-MM-DD — timing-signal accuracy (SPEC §5.6). */
export async function handleTimingAccuracy(
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(query["asOf"] ?? "") ? query["asOf"]! : deps.today();
  const accuracy = await deps.timingAccuracy.compute(asOf);
  return { status: 200, body: accuracy };
}

/** Coerce a free-form market query param to a MarketGroup ('ALL' default). */
function parseMarketGroup(raw: string | undefined): MarketGroup {
  const v = (raw ?? "ALL").toUpperCase();
  return v === "US" || v === "KR" ? v : "ALL";
}

/**
 * GET /api/search?q=삼성&market=ALL&limit=30 — 코드 없이 이름으로 종목 검색
 * (SPEC §3.2-Δ A/C). 한글/영문/코드 부분일치, 거래대금 desc 정렬. 각 항목에
 * last/change_pct/direction/weekly/signal 포함. 빈 q 는 빈 배열(에러 ✗).
 */
export async function handleSearch(
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  const q = (query["q"] ?? "").trim();
  const market = parseMarketGroup(query["market"]);
  const rawLimit = Number.parseInt(query["limit"] ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;
  if (!q) return { status: 200, body: [] };
  const store = deps.searchStore ?? createSearchStore();
  if (store.hydrate) await store.hydrate();
  const results = await store.search({ q, market, limit });
  return { status: 200, body: results };
}

/**
 * GET /api/discover?market=US — 발굴 탭 데이터 (SPEC §3.2-Δ 발굴 탭). 일배치가 적재한
 * 최신 카테고리 아티팩트(6 카테고리 후보 + 신호 + 통계)를 그대로 반환. 아직 없으면 404.
 */
export async function handleDiscover(
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  const market: MarketGroup = parseMarketGroup(query["market"]);
  // ALL 은 발굴 탭에서 의미 없음(배치는 US/KR 별 산출) → 기본 US.
  const m: MarketGroup = market === "ALL" ? "US" : market;
  const store = deps.screenStore ?? createScreenStore();
  const artifact = await store.getLatestArtifact(m);
  if (!artifact) {
    return { status: 404, body: { error: `no discovery data for ${m} yet` } };
  }
  return { status: 200, body: artifact };
}

/** Route a GET request path+query to the matching handler, or 404. */
export async function route(
  pathname: string,
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  if (pathname === "/api/picks/today") return handlePicksToday(query, deps);
  if (pathname === "/api/search") return handleSearch(query, deps);
  if (pathname === "/api/discover") return handleDiscover(query, deps);
  if (pathname === "/api/quotes") return handleQuotes(query, deps);
  if (pathname === "/api/scorecard/timing") return handleTimingAccuracy(query, deps);
  if (pathname === "/api/scorecard") return handleScorecard(query, deps);
  if (pathname === "/api/health" || pathname === "/") return { status: 200, body: { ok: true } };
  return { status: 404, body: { error: "not found" } };
}

/** Route a POST request path+body to the matching handler, or 404. */
export async function routePost(
  pathname: string,
  body: unknown,
  deps: ApiDeps,
): Promise<ApiResponse> {
  if (pathname === "/api/devices/register") return handleRegisterDevice(body, deps);
  if (pathname === "/api/devices/unregister") return handleUnregisterDevice(body, deps);
  const edgeDeps = deps.edgeGate ?? defaultEdgeGateDeps();
  const edge = matchEdgeGatePath(pathname);
  if (edge) return handleEdgeGate(edge.sessionId, body, edgeDeps);
  const select = matchEdgeSelectPath(pathname);
  if (select) return handleEdgeSelect(select.sessionId, body, edgeDeps);
  const answers = matchSpecAnswersPath(pathname);
  if (answers) return handleSpecAnswers(answers.sessionId, body, edgeDeps);
  return { status: 404, body: { error: "not found" } };
}
