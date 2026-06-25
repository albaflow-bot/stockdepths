/**
 * Device token registry for FCM delivery.
 *
 * A mutable registry (unlike the append-only track record): tokens are registered
 * by the client, refreshed, removed on unregister, and pruned when FCM reports
 * them dead. Persisted as a JSON array (best-effort disk + in-memory). Dedupe is
 * by token string. Disk failures never break a send (Sane default + override).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { DeviceToken } from "./types.js";

export interface DeviceTokenStoreOptions {
  /** JSON file path. Defaults to <repoRoot>/.bindesk/device-tokens.json. `null` = memory only. */
  file?: string | null;
}

function defaultFile(): string {
  return join(process.cwd(), ".bindesk", "device-tokens.json");
}

export class DeviceTokenStore {
  private readonly file: string | null;
  private tokens = new Map<string, DeviceToken>();
  private loaded = false;

  constructor(opts: DeviceTokenStoreOptions = {}) {
    this.file = opts.file === undefined ? defaultFile() : opts.file;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file || !existsSync(this.file)) return;
    try {
      const arr = JSON.parse(readFileSync(this.file, "utf8")) as DeviceToken[];
      for (const t of arr) if (t?.token) this.tokens.set(t.token, t);
    } catch {
      // unreadable registry → start empty
    }
  }

  private persist(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify([...this.tokens.values()], null, 2), "utf8");
    } catch {
      // best-effort persistence
    }
  }

  /** Register or refresh a device token. `registeredAt` is supplied by the caller. */
  register(token: string, platform: DeviceToken["platform"], registeredAt: string): void {
    if (!token) return;
    this.ensureLoaded();
    this.tokens.set(token, { token, platform, registeredAt });
    this.persist();
  }

  /** Remove tokens (unregister or prune). Returns how many were removed. */
  remove(tokens: string[]): number {
    this.ensureLoaded();
    let removed = 0;
    for (const t of tokens) if (this.tokens.delete(t)) removed++;
    if (removed > 0) this.persist();
    return removed;
  }

  list(): DeviceToken[] {
    this.ensureLoaded();
    return [...this.tokens.values()];
  }

  listTokens(): string[] {
    return this.list().map((t) => t.token);
  }

  /** Load async-backend rows into memory before reads (disk loads lazily here). */
  async hydrate(): Promise<void> {
    this.ensureLoaded();
  }

  /** Await any pending async persistence (no-op for disk; Supabase awaits writes). */
  async flush(): Promise<void> {
    // disk backend: register/remove persist synchronously
  }
}
