/**
 * Append-only track-record store (SPEC §3.3: immutable, append-only history).
 *
 * Backed by a JSONL file — one immutable JSON entry per line. Writes only ever
 * APPEND (fs.appendFile); existing lines are never mutated, rewritten, or
 * deleted, which is the whole point: the scorecard derives from this log and must
 * not be able to silently rewrite the past. Appends are idempotent by entry id so
 * re-running a day's batch can't double-log the same recommendation. An in-memory
 * mirror serves reads; corrupt lines are skipped (resilience), never crash a read.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { TrackRecordEntry } from "./types.js";

export interface TrackRecordStoreOptions {
  /** JSONL file path. Defaults to <repoRoot>/.bindesk/track-record.jsonl. */
  file?: string | null;
}

function defaultFile(): string {
  return join(process.cwd(), ".bindesk", "track-record.jsonl");
}

export class TrackRecordStore {
  private readonly file: string | null;
  private entries: TrackRecordEntry[] = [];
  private ids = new Set<string>();
  private loaded = false;

  constructor(opts: TrackRecordStoreOptions = {}) {
    this.file = opts.file === undefined ? defaultFile() : opts.file;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file || !existsSync(this.file)) return;
    try {
      const raw = readFileSync(this.file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const entry = JSON.parse(t) as TrackRecordEntry;
          if (entry && entry.id && !this.ids.has(entry.id)) {
            this.entries.push(entry);
            this.ids.add(entry.id);
          }
        } catch {
          // skip a corrupt line rather than failing the whole read
        }
      }
    } catch {
      // unreadable log is treated as empty (Sane default + override)
    }
  }

  /**
   * Append new entries; entries whose id already exists are skipped (idempotent).
   * Returns the entries actually appended. Never rewrites existing history.
   */
  append(newEntries: TrackRecordEntry[]): TrackRecordEntry[] {
    this.ensureLoaded();
    const fresh = newEntries.filter((e) => e.id && !this.ids.has(e.id));
    if (fresh.length === 0) return [];

    for (const e of fresh) {
      this.entries.push(e);
      this.ids.add(e.id);
    }

    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        appendFileSync(this.file, fresh.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      } catch {
        // disk failure must not lose the in-memory append nor crash the batch
      }
    }
    return fresh;
  }

  /** All logged entries, ascending by recommendation date then symbol. */
  readAll(): TrackRecordEntry[] {
    this.ensureLoaded();
    return [...this.entries].sort((a, b) =>
      a.date === b.date ? a.symbol.localeCompare(b.symbol) : a.date < b.date ? -1 : 1,
    );
  }

  /** Entries with recommendation date >= `since` (inclusive). */
  readSince(since: string): TrackRecordEntry[] {
    return this.readAll().filter((e) => e.date >= since);
  }

  /**
   * Load async-backend rows into memory before reads (disk loads lazily here).
   * Overridden by the Supabase-backed store.
   */
  async hydrate(): Promise<void> {
    this.ensureLoaded();
  }

  /** Await any pending async persistence (no-op for disk; Supabase awaits writes). */
  async flush(): Promise<void> {
    // disk backend: appends are synchronous
  }
}
