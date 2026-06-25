/**
 * Append-only stores for the DailyBatch timing signals + daily market brief
 * (SPEC §5.6: §3.3 추천 로그와 같은 배치 트랜잭션에 immutable 기록). Backed by JSONL
 * files — one immutable JSON entry per line, append-only (never UPDATE/DELETE), so
 * the §5 성적표 can later verify "Buy 신호 후 실제 상승했나" against frozen history.
 *
 * Mirrors {@link ../track/store.ts TrackRecordStore}: idempotent by entry id so
 * re-running a day's batch can't double-log; an in-memory mirror serves reads;
 * corrupt lines are skipped (resilience), never crash a read; disk failures never
 * lose the in-memory append nor crash the batch. These shapes correspond 1:1 to the
 * `timing_signal` / `daily_market_brief` tables in `server/supabase/schema.sql`.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { TimingSignal, DailyMarketBrief } from "./types.js";
import type { Market } from "../market/types.js";

/** A persisted timing signal row (id = "market:date:ticker:source"). */
export interface TimingSignalEntry extends TimingSignal {
  id: string;
  market: Market;
  /** Recommendation/evaluation date, YYYY-MM-DD (the batch date). */
  date: string;
}

/** A persisted market-brief row (id = "market:date"). */
export interface MarketBriefEntry extends DailyMarketBrief {
  id: string;
}

export function timingSignalId(market: Market, date: string, ticker: string, source: string): string {
  return `${market}:${date}:${ticker.toUpperCase()}:${source}`;
}

export function marketBriefId(market: Market, date: string): string {
  return `${market}:${date}`;
}

abstract class JsonlAppendStore<T extends { id: string }> {
  protected entries: T[] = [];
  protected ids = new Set<string>();
  private loaded = false;

  constructor(protected readonly file: string | null) {}

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
          const entry = JSON.parse(t) as T;
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

  /** Append entries; ids already present are skipped (idempotent). Never rewrites. */
  append(newEntries: T[]): T[] {
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

  readAll(): T[] {
    this.ensureLoaded();
    return [...this.entries];
  }

  async hydrate(): Promise<void> {
    this.ensureLoaded();
  }
}

export interface TimingStoreOptions {
  /** JSONL file path. Defaults under <repoRoot>/.bindesk. `null` disables disk (tests). */
  file?: string | null;
}

/** Append-only store for DailyBatch timing signals. */
export class TimingSignalStore extends JsonlAppendStore<TimingSignalEntry> {
  constructor(opts: TimingStoreOptions = {}) {
    super(opts.file === undefined ? join(process.cwd(), ".bindesk", "timing-signals.jsonl") : opts.file);
  }

  /** Build + append entries for a market+date's DailyBatch signals. */
  record(market: Market, date: string, signals: TimingSignal[]): TimingSignalEntry[] {
    const entries = signals.map((s) => ({
      ...s,
      id: timingSignalId(market, date, s.ticker, s.source),
      market,
      date,
    }));
    return this.append(entries);
  }

  /** All signals for a market+date. */
  forDate(market: Market, date: string): TimingSignalEntry[] {
    return this.readAll().filter((e) => e.market === market && e.date === date);
  }
}

/** Append-only store for the daily market brief (one per market+date). */
export class MarketBriefStore extends JsonlAppendStore<MarketBriefEntry> {
  constructor(opts: TimingStoreOptions = {}) {
    super(opts.file === undefined ? join(process.cwd(), ".bindesk", "market-brief.jsonl") : opts.file);
  }

  record(brief: DailyMarketBrief): MarketBriefEntry[] {
    return this.append([{ ...brief, id: marketBriefId(brief.market, brief.date) }]);
  }

  get(market: Market, date: string): MarketBriefEntry | undefined {
    const id = marketBriefId(market, date);
    return this.readAll().find((e) => e.id === id);
  }
}
