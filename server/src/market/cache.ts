/**
 * TTL cache for normalized market data. Two reasons it exists:
 *
 *  1. SPEC §3.3 — downstream pick/alert logic reads a *cached* quote/news model,
 *     not the live source.
 *  2. TOKEN/비용 효율 계약 — "같은 입력의 반복 호출은 결과를 캐시하라". Free feeds
 *     are rate-limited and slow; we never re-fetch the same key within its TTL.
 *
 * In-memory is the source of truth for a process; disk is a best-effort warm
 * cache so a restarted batch job doesn't re-crawl everything. Disk failures are
 * swallowed (Sane default + override) — caching must never break a request.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

interface Entry<T> {
  value: T;
  /** Epoch ms when this entry was stored. */
  storedAt: number;
  /** TTL in ms for this entry. */
  ttlMs: number;
}

export interface CacheOptions {
  /** Default TTL in ms applied when set() is called without an explicit ttl. */
  defaultTtlMs?: number;
  /**
   * Directory for the warm disk cache. Defaults to `<repoRoot>/.bindesk/cache`.
   * Pass `null` to disable disk entirely (used by tests).
   */
  dir?: string | null;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

function defaultCacheDir(): string {
  // server/src/market/cache.ts -> repo root is three dirs up from src/market.
  // We anchor on process.cwd() instead to be robust to bundling: callers run
  // from the repo root, and .bindesk lives there per BinDesk convention.
  return join(process.cwd(), ".bindesk", "cache");
}

function keyToFile(dir: string, key: string): string {
  // Make the key filesystem-safe without collisions for the small key space we use.
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(dir, `${safe}.json`);
}

export class TtlCache {
  private mem = new Map<string, Entry<unknown>>();
  private readonly defaultTtlMs: number;
  private readonly dir: string | null;
  private readonly now: () => number;

  constructor(opts: CacheOptions = {}) {
    this.defaultTtlMs = opts.defaultTtlMs ?? 15 * 60 * 1000; // 15 min
    this.dir = opts.dir === undefined ? defaultCacheDir() : opts.dir;
    this.now = opts.now ?? Date.now;
  }

  private fresh(entry: Entry<unknown>): boolean {
    return this.now() - entry.storedAt < entry.ttlMs;
  }

  /** Returns the cached value if present and not expired, else undefined. */
  get<T>(key: string): T | undefined {
    const hit = this.mem.get(key);
    if (hit && this.fresh(hit)) return hit.value as T;
    // Keep an expired entry in memory so getStale() can serve it as a
    // stale-on-error fallback; the freshness guard above stops get() returning it.

    const fromDisk = this.readDisk<T>(key);
    if (fromDisk && this.fresh(fromDisk)) {
      this.mem.set(key, fromDisk);
      return fromDisk.value;
    }
    return undefined;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    const entry: Entry<T> = {
      value,
      storedAt: this.now(),
      ttlMs: ttlMs ?? this.defaultTtlMs,
    };
    this.mem.set(key, entry);
    this.writeDisk(key, entry);
  }

  /**
   * Returns the last cached value regardless of freshness — used for graceful
   * stale-on-error fallback when every live source is down (RESILIENCE CONTRACT).
   */
  getStale<T>(key: string): T | undefined {
    const hit = this.mem.get(key) ?? this.readDisk<T>(key);
    return hit ? (hit.value as T) : undefined;
  }

  private readDisk<T>(key: string): Entry<T> | undefined {
    if (!this.dir) return undefined;
    try {
      const file = keyToFile(this.dir, key);
      if (!existsSync(file)) return undefined;
      return JSON.parse(readFileSync(file, "utf8")) as Entry<T>;
    } catch {
      return undefined; // corrupt/unreadable cache is not an error
    }
  }

  private writeDisk<T>(key: string, entry: Entry<T>): void {
    if (!this.dir) return;
    try {
      const file = keyToFile(this.dir, key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(entry), "utf8");
    } catch {
      // best-effort only; never let a disk problem fail a request
    }
  }
}
