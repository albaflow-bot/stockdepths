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
import { TrackRecordStore } from "../track/store.js";
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
  /** Returns today's date (YYYY-MM-DD); injectable for tests. */
  today: () => string;
  /** Edge gate (SPEC §5) deps; optional — lazily built when a POST first needs it. */
  edgeGate?: EdgeGateDeps;
}

/** Build the default deps (disk-backed stores + cached US adapter). */
export function defaultApiDeps(): ApiDeps {
  const adapter = getMarketRegistry().require("US");
  return {
    adapter,
    artifactStore: new ArtifactStore(),
    scorecard: new ScorecardService(new TrackRecordStore(), adapter),
    today: () => new Date().toISOString().slice(0, 10),
    edgeGate: defaultEdgeGateDeps(),
  };
}

/** GET /api/picks/today?market=US&date=YYYY-MM-DD */
export async function handlePicksToday(
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  const market = (query["market"]?.toUpperCase() as Market) || "US";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query["date"] ?? "") ? query["date"]! : deps.today();
  const artifact = deps.artifactStore.get(market, date);
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

/** Route a GET request path+query to the matching handler, or 404. */
export async function route(
  pathname: string,
  query: Record<string, string>,
  deps: ApiDeps,
): Promise<ApiResponse> {
  if (pathname === "/api/picks/today") return handlePicksToday(query, deps);
  if (pathname === "/api/quotes") return handleQuotes(query, deps);
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
  const edgeDeps = deps.edgeGate ?? defaultEdgeGateDeps();
  const edge = matchEdgeGatePath(pathname);
  if (edge) return handleEdgeGate(edge.sessionId, body, edgeDeps);
  const select = matchEdgeSelectPath(pathname);
  if (select) return handleEdgeSelect(select.sessionId, body, edgeDeps);
  const answers = matchSpecAnswersPath(pathname);
  if (answers) return handleSpecAnswers(answers.sessionId, body, edgeDeps);
  return { status: 404, body: { error: "not found" } };
}
