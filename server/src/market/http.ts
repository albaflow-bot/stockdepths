/**
 * Minimal HTTP layer with timeout + bounded retry, written so the fetch
 * implementation is injectable. Tests pass a deterministic fetcher (no network);
 * production uses the global `fetch` (Node 20+).
 */

/** The injectable shape — a subset of the WHATWG fetch signature. */
export type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface HttpOptions {
  fetcher?: Fetcher;
  /** Per-attempt timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** Extra retries after the first attempt. Default 2. */
  retries?: number;
  headers?: Record<string, string>;
}

/** A browser-ish UA: some free feeds (Yahoo, SEC) reject empty/agentless UAs. */
const DEFAULT_UA =
  "Mozilla/5.0 (compatible; StockTimingBot/0.1; +https://example.invalid/bot)";

function resolveFetcher(f?: Fetcher): Fetcher {
  if (f) return f;
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch as unknown as Fetcher;
  }
  throw new Error(
    "No fetch implementation available; pass opts.fetcher or run on Node >= 20.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a URL as text with timeout + exponential backoff retry. Throws only after
 * all attempts fail; the caller (adapter) decides whether to fall back.
 */
export async function fetchText(url: string, opts: HttpOptions = {}): Promise<string> {
  const fetcher = resolveFetcher(opts.fetcher);
  const timeoutMs = opts.timeoutMs ?? 8000;
  const retries = opts.retries ?? 2;
  const headers = { "User-Agent": DEFAULT_UA, ...opts.headers };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetcher(url, { headers, signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        // Exponential backoff: 200ms, 400ms, ... — cheap and avoids hammering.
        await sleep(200 * 2 ** attempt);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
