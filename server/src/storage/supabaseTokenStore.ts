/**
 * Supabase-backed device token registry for FCM delivery.
 *
 * The registration endpoint runs on Vercel (ephemeral filesystem), so tokens must
 * live in Supabase; the daily digest job (GitHub Actions) reads them back. Same
 * mirror pattern as the other stores: synchronous reads over an in-memory mirror,
 * `hydrate()` loads it, and writes are queued and awaited by `flush()`.
 */

import { DeviceTokenStore } from "../push/tokenStore.js";
import type { DeviceToken } from "../push/types.js";
import {
  type SupabaseConfig,
  type FetchLike,
  selectRows,
  upsertRows,
  deleteByEq,
} from "./supabaseRest.js";

const TABLE = "device_tokens";

interface TokenRow {
  token: string;
  platform: DeviceToken["platform"];
  registered_at: string;
}

export class SupabaseDeviceTokenStore extends DeviceTokenStore {
  private readonly cfg: SupabaseConfig;
  private readonly fetchImpl?: FetchLike;
  private mirror = new Map<string, DeviceToken>();
  private pending: Promise<unknown>[] = [];

  constructor(cfg: SupabaseConfig, fetchImpl?: FetchLike) {
    super({ file: null }); // disable disk; this subclass owns persistence
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  override register(token: string, platform: DeviceToken["platform"], registeredAt: string): void {
    if (!token) return;
    this.mirror.set(token, { token, platform, registeredAt });
    const row: TokenRow = { token, platform, registered_at: registeredAt };
    this.pending.push(
      upsertRows(this.cfg, TABLE, [row], this.fetchImpl).catch(() => {
        // best-effort; the in-memory mirror already has it
      }),
    );
  }

  override remove(tokens: string[]): number {
    let removed = 0;
    for (const t of tokens) {
      if (this.mirror.delete(t)) {
        removed++;
        this.pending.push(deleteByEq(this.cfg, TABLE, "token", t, this.fetchImpl).catch(() => {}));
      }
    }
    return removed;
  }

  override list(): DeviceToken[] {
    return [...this.mirror.values()];
  }

  override async hydrate(): Promise<void> {
    try {
      const rows = await selectRows<TokenRow>(this.cfg, TABLE, "select=*", this.fetchImpl);
      for (const r of rows) {
        if (r?.token) {
          this.mirror.set(r.token, { token: r.token, platform: r.platform, registeredAt: r.registered_at });
        }
      }
    } catch {
      // unreadable registry → start empty (Sane default)
    }
  }

  override async flush(): Promise<void> {
    const p = this.pending;
    this.pending = [];
    await Promise.all(p);
  }
}
