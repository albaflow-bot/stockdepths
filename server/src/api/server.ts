/**
 * Zero-dependency HTTP API server wrapping the route handlers. CORS is open
 * (the client is a different origin; this is a small private app). JSON in/out;
 * any handler error becomes a 500 rather than crashing the process.
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import { route, routePost, defaultApiDeps, type ApiDeps } from "./handlers.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Read a request body (capped) and parse it as JSON; {} on empty/invalid. */
async function readJsonBody(req: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw); // throws on invalid JSON → caught as 400 below
}

export function createApiServer(deps: ApiDeps = defaultApiDeps()): Server {
  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS });
      res.end(JSON.stringify(body));
    };

    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "POST") {
        let parsed: unknown;
        try {
          parsed = await readJsonBody(req);
        } catch (err) {
          send(400, { error: err instanceof Error ? err.message : "invalid JSON body" });
          return;
        }
        const { status, body } = await routePost(url.pathname, parsed, deps);
        send(status, body);
        return;
      }

      if (req.method !== "GET") {
        send(405, { error: "method not allowed" });
        return;
      }
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (query[k] = v));
      const { status, body } = await route(url.pathname, query, deps);
      send(status, body);
    } catch (err) {
      send(500, { error: err instanceof Error ? err.message : "internal error" });
    }
  });
}

/** Start the API server on the given port (default from PORT env or 8787). */
export function startApiServer(port = Number(process.env["PORT"] ?? 8787)): Server {
  const server = createApiServer();
  server.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
  return server;
}
