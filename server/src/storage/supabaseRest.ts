/**
 * Minimal PostgREST client for Supabase, built on global fetch (Node 20+) — no SDK
 * dependency, matching the server's zero-dependency style. Used by the Supabase-
 * backed stores (daily-picks artifact + append-only track record) when
 * SUPABASE_URL + a key are present in the environment.
 *
 * Sane default + override: when Supabase is NOT configured the factories fall back
 * to the disk-backed stores, so local dev and the test suite are unaffected.
 */

export interface SupabaseConfig {
  url: string;
  key: string;
}

/** Injectable fetch (defaults to global fetch) so the stores are unit-testable. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Read Supabase config from the environment. Prefers the service-role key (needed
 * for server-side writes); falls back to a generic/anon key. Returns null when not
 * configured so callers can pick the disk fallback.
 */
export function readSupabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseConfig | null {
  const url = env["SUPABASE_URL"]?.replace(/\/+$/, "");
  const key = env["SUPABASE_SERVICE_ROLE_KEY"] || env["SUPABASE_KEY"] || env["SUPABASE_ANON_KEY"];
  if (!url || !key) return null;
  return { url, key };
}

export function supabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readSupabaseConfig(env) != null;
}

interface RestOptions {
  body?: unknown;
  prefer?: string;
  fetchImpl?: FetchLike;
}

async function rest(
  cfg: SupabaseConfig,
  method: string,
  path: string,
  opts: RestOptions = {},
): Promise<unknown> {
  const f: FetchLike = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const res = await f(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`supabase ${method} /${path} -> ${res.status} ${text}`.trim());
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** SELECT rows. `query` is a PostgREST querystring without the leading '?'. */
export async function selectRows<T>(
  cfg: SupabaseConfig,
  table: string,
  query: string,
  fetchImpl?: FetchLike,
): Promise<T[]> {
  const out = await rest(cfg, "GET", `${table}?${query}`, { fetchImpl });
  return Array.isArray(out) ? (out as T[]) : [];
}

/** UPSERT rows (merge on the table's primary key). */
export async function upsertRows(
  cfg: SupabaseConfig,
  table: string,
  rows: unknown[],
  fetchImpl?: FetchLike,
): Promise<void> {
  if (rows.length === 0) return;
  await rest(cfg, "POST", table, {
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
    fetchImpl,
  });
}

/** INSERT rows, ignoring any whose primary key already exists (idempotent append). */
export async function insertIgnore(
  cfg: SupabaseConfig,
  table: string,
  rows: unknown[],
  fetchImpl?: FetchLike,
): Promise<void> {
  if (rows.length === 0) return;
  await rest(cfg, "POST", table, {
    body: rows,
    prefer: "resolution=ignore-duplicates,return=minimal",
    fetchImpl,
  });
}

/** DELETE rows where `column` equals `value`. */
export async function deleteByEq(
  cfg: SupabaseConfig,
  table: string,
  column: string,
  value: string,
  fetchImpl?: FetchLike,
): Promise<void> {
  await rest(cfg, "DELETE", `${table}?${column}=eq.${encodeURIComponent(value)}`, {
    prefer: "return=minimal",
    fetchImpl,
  });
}
