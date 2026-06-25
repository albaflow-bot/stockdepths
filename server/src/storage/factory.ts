/**
 * Storage backend selection (Sane default + override). When SUPABASE_URL + a key
 * are configured the stores persist to Supabase (the serverless-friendly path for
 * Vercel — its filesystem is ephemeral); otherwise they fall back to the disk
 * stores used by local dev and the test suite.
 */

import { ArtifactStore } from "../pipeline/artifactStore.js";
import { TrackRecordStore } from "../track/store.js";
import { DeviceTokenStore } from "../push/tokenStore.js";
import { InMemorySecuritySearchStore } from "../screener/searchStore.js";
import type { SecuritySearchProvider } from "../screener/types.js";
import { DiskScreenStore, type ScreenPersistence } from "../screener/screenStore.js";
import { readSupabaseConfig } from "./supabaseRest.js";
import { SupabaseArtifactStore } from "./supabaseArtifactStore.js";
import { SupabaseTrackStore } from "./supabaseTrackStore.js";
import { SupabaseDeviceTokenStore } from "./supabaseTokenStore.js";
import { SupabaseSecuritySearchStore } from "./supabaseSearchStore.js";
import { SupabaseScreenStore } from "./supabaseScreenStore.js";

/** Where persistence lives, decided from the environment. */
export function storageMode(env: NodeJS.ProcessEnv = process.env): "supabase" | "disk" {
  return readSupabaseConfig(env) ? "supabase" : "disk";
}

/** Daily-picks artifact store: Supabase when configured, else disk. */
export function createArtifactStore(): ArtifactStore {
  const cfg = readSupabaseConfig();
  return cfg ? new SupabaseArtifactStore(cfg) : new ArtifactStore();
}

/** Append-only track-record store: Supabase when configured, else disk. */
export function createTrackStore(): TrackRecordStore {
  const cfg = readSupabaseConfig();
  return cfg ? new SupabaseTrackStore(cfg) : new TrackRecordStore();
}

/** Device push-token registry: Supabase when configured, else disk. */
export function createTokenStore(): DeviceTokenStore {
  const cfg = readSupabaseConfig();
  return cfg ? new SupabaseDeviceTokenStore(cfg) : new DeviceTokenStore();
}

/** 종목 검색 제공자: Supabase 뷰 조회 또는 인메모리/디스크 시드. */
export function createSearchStore(): SecuritySearchProvider {
  const cfg = readSupabaseConfig();
  return cfg ? new SupabaseSecuritySearchStore(cfg) : new InMemorySecuritySearchStore();
}

/** 스크리너 영속화: Supabase upsert 또는 디스크 JSON. */
export function createScreenStore(): ScreenPersistence {
  const cfg = readSupabaseConfig();
  return cfg ? new SupabaseScreenStore(cfg) : new DiskScreenStore();
}
