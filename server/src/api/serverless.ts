/**
 * Shared Vercel serverless handler for the picks API.
 *
 * Vercel's optional catch-all (`api/[[...slug]].ts`) does NOT reliably match
 * nested 2-segment paths (e.g. `/api/picks/today`, `/api/scorecard/timing`) — only
 * single-segment ones reach the function. So the catch-all AND thin per-path entry
 * files (`api/picks/today.ts`, `api/scorecard/timing.ts`) all delegate to this one
 * handler; Vercel then generates an explicit route for each nested path.
 *
 * Serverless filesystems are ephemeral, so production persistence is Supabase
 * (configured via SUPABASE_* env). Reads are synchronous, so we hydrate the
 * Supabase-backed stores into memory once per invocation before routing.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Market } from "../market/types.js";
import { getMarketRegistry } from "../market/index.js";
import { route, routePost, type ApiDeps } from "./handlers.js";
import { ScorecardService } from "../track/scorecard.js";
import { TimingAccuracyService } from "../track/timingAccuracy.js";
import { TimingSignalStore } from "../timing/store.js";
import { defaultEdgeGateDeps } from "../edge/handler.js";
import {
  createArtifactStore,
  createTrackStore,
  createTokenStore,
  createSearchStore,
  createScreenStore,
} from "../storage/index.js";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body: unknown): void => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
    res.end(JSON.stringify(body));
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // Per-invocation deps — serverless instances don't share mutable state. All
  // optional stores are wired (search/screen/timing) so every route, including the
  // nested 2-segment ones, has its backing store.
  const adapter = getMarketRegistry().require("US");
  const artifactStore = createArtifactStore();
  const trackStore = createTrackStore();
  const deps: ApiDeps = {
    adapter,
    artifactStore,
    scorecard: new ScorecardService(trackStore, adapter),
    timingAccuracy: new TimingAccuracyService(new TimingSignalStore(), adapter),
    today: () => new Date().toISOString().slice(0, 10),
    tokenStore: createTokenStore(),
    searchStore: createSearchStore(),
    screenStore: createScreenStore(),
    edgeGate: defaultEdgeGateDeps(),
  };

  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));

  // Hydrate the Supabase-backed stores before the synchronous handlers read them.
  const market = (query["market"]?.toUpperCase() as Market) || "US";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query["date"] ?? "") ? query["date"]! : deps.today();
  await Promise.all([artifactStore.hydrate(market, date), trackStore.hydrate()]);

  try {
    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch {
        send(400, { error: "invalid JSON body" });
        return;
      }
      const r = await routePost(url.pathname, body, deps);
      send(r.status, r.body);
      return;
    }
    if (req.method !== "GET") {
      send(405, { error: "method not allowed" });
      return;
    }
    const r = await route(url.pathname, query, deps);
    send(r.status, r.body);
  } catch (err) {
    send(500, { error: err instanceof Error ? err.message : "internal error" });
  }
}
