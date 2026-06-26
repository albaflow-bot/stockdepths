/**
 * Supabase-backed daily-picks artifact store (the shared public artifact, SPEC §3.3).
 *
 * Why a subclass that keeps an in-memory mirror: the HTTP handlers read picks
 * synchronously (`artifactStore.get(...)` is not awaited), but Supabase access is
 * async. So the serverless entry calls `await hydrate(market, date)` once per
 * request to load the row into memory, after which the synchronous `get()` works
 * unchanged. Writes (`put`) are queued and awaited by `flush()` so a short-lived
 * batch process persists before it exits.
 */

import type { Market } from "../market/types.js";
import { ArtifactStore, type DailyPicksArtifact } from "../pipeline/artifactStore.js";
import { type SupabaseConfig, type FetchLike, selectRows, upsertRows } from "./supabaseRest.js";

const TABLE = "daily_picks_artifacts";

interface ArtifactRow {
  market: string;
  date: string;
  data: DailyPicksArtifact;
}

export class SupabaseArtifactStore extends ArtifactStore {
  private readonly cfg: SupabaseConfig;
  private readonly fetchImpl?: FetchLike;
  private readonly rows = new Map<string, DailyPicksArtifact>();
  private pending: Promise<unknown>[] = [];

  constructor(cfg: SupabaseConfig, fetchImpl?: FetchLike) {
    // Disable the base class's disk layer; this subclass owns persistence.
    super({ dir: null });
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  private cacheKey(market: Market, date: string): string {
    return `${market}:${date}`;
  }

  override get(market: Market, date: string): DailyPicksArtifact | undefined {
    return this.rows.get(this.cacheKey(market, date));
  }

  override put(artifact: DailyPicksArtifact): void {
    this.rows.set(this.cacheKey(artifact.market, artifact.date), artifact);
    const row: ArtifactRow = { market: artifact.market, date: artifact.date, data: artifact };
    this.pending.push(
      upsertRows(this.cfg, TABLE, [row], this.fetchImpl).catch(() => {
        // best-effort persistence; never throw out of a synchronous put
      }),
    );
  }

  override async hydrate(market?: Market, date?: string): Promise<void> {
    if (!market || !date) return;
    const q =
      `select=data&market=eq.${encodeURIComponent(market)}` +
      `&date=eq.${encodeURIComponent(date)}&limit=1`;
    try {
      const found = await selectRows<ArtifactRow>(this.cfg, TABLE, q, this.fetchImpl);
      const data = found[0]?.data;
      if (data) this.rows.set(this.cacheKey(market, date), data);
    } catch {
      // leave the mirror empty -> handler returns a friendly 404 (Sane default)
    }
  }

  override getLatest(market: Market): DailyPicksArtifact | undefined {
    let best: DailyPicksArtifact | undefined;
    for (const a of this.rows.values()) {
      if (a.market === market && (!best || a.date > best.date)) best = a;
    }
    return best;
  }

  /** 시장의 최신 추천 한 행(date desc)을 메모리로 적재 — 오늘자 부재 시 폴백 소스. */
  override async hydrateLatest(market?: Market): Promise<void> {
    if (!market) return;
    const q = `select=data&market=eq.${encodeURIComponent(market)}&order=date.desc&limit=1`;
    try {
      const found = await selectRows<ArtifactRow>(this.cfg, TABLE, q, this.fetchImpl);
      const data = found[0]?.data;
      if (data) this.rows.set(this.cacheKey(market, data.date), data);
    } catch {
      // leave empty -> handler still returns a friendly 404 if nothing at all exists
    }
  }

  override async flush(): Promise<void> {
    const p = this.pending;
    this.pending = [];
    await Promise.all(p);
  }
}
