/**
 * Supabase-backed append-only track record (SPEC §3.3: immutable history the
 * scorecard derives from). Same pattern as the artifact store: an in-memory mirror
 * serves the synchronous reads the scorecard does, `hydrate()` loads it from
 * Supabase, and `append()` queues an idempotent insert that `flush()` awaits.
 *
 * Idempotency is enforced twice: in memory by id (like the disk store) and in the
 * database by the primary key (insert ignores duplicates), so re-running a day's
 * batch can never double-log a recommendation.
 */

import { TrackRecordStore } from "../track/store.js";
import type { TrackRecordEntry } from "../track/types.js";
import { type SupabaseConfig, type FetchLike, selectRows, insertIgnore } from "./supabaseRest.js";

const TABLE = "track_record";

interface TrackRow {
  id: string;
  date: string;
  symbol: string;
  data: TrackRecordEntry;
}

export class SupabaseTrackStore extends TrackRecordStore {
  private readonly cfg: SupabaseConfig;
  private readonly fetchImpl?: FetchLike;
  private mem: TrackRecordEntry[] = [];
  private seen = new Set<string>();
  private pending: Promise<unknown>[] = [];

  constructor(cfg: SupabaseConfig, fetchImpl?: FetchLike) {
    super({ file: null }); // disable disk; this subclass owns persistence
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  override append(newEntries: TrackRecordEntry[]): TrackRecordEntry[] {
    const fresh = newEntries.filter((e) => e.id && !this.seen.has(e.id));
    if (fresh.length === 0) return [];
    for (const e of fresh) {
      this.mem.push(e);
      this.seen.add(e.id);
    }
    const rows: TrackRow[] = fresh.map((e) => ({ id: e.id, date: e.date, symbol: e.symbol, data: e }));
    this.pending.push(
      insertIgnore(this.cfg, TABLE, rows, this.fetchImpl).catch(() => {
        // best-effort; the in-memory append already succeeded
      }),
    );
    return fresh;
  }

  override readAll(): TrackRecordEntry[] {
    return [...this.mem].sort((a, b) =>
      a.date === b.date ? a.symbol.localeCompare(b.symbol) : a.date < b.date ? -1 : 1,
    );
  }

  override readSince(since: string): TrackRecordEntry[] {
    return this.readAll().filter((e) => e.date >= since);
  }

  override async hydrate(): Promise<void> {
    try {
      const rows = await selectRows<TrackRow>(this.cfg, TABLE, "select=data&order=date.asc", this.fetchImpl);
      for (const r of rows) {
        const e = r.data;
        if (e && e.id && !this.seen.has(e.id)) {
          this.mem.push(e);
          this.seen.add(e.id);
        }
      }
    } catch {
      // unreadable history is treated as empty (Sane default + override)
    }
  }

  override async flush(): Promise<void> {
    const p = this.pending;
    this.pending = [];
    await Promise.all(p);
  }
}
