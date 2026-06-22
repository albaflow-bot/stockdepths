/**
 * Crash-loop safe mode (RESILIENCE CONTRACT, 3-strike).
 *
 * On boot we increment a persisted counter; if the app reaches a stable state we
 * reset it. Three consecutive immediate crashes (counter ≥ 3) trip safe mode, so
 * one bad state (a null, a denied permission) can't permanently brick the app —
 * it boots into a recovery screen instead. Storage is injectable for testing.
 */

import type { KeyValueStorage } from "./errorLog";
import { resolveStorage } from "./errorLog";

const CRASH_KEY = "bindesk:crash-count";
export const STRIKE_THRESHOLD = 3;

function readCount(storage: KeyValueStorage): number {
  const raw = storage.getItem(CRASH_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Record a boot attempt; returns the new consecutive-crash count. */
export function recordBootStart(storage: KeyValueStorage = resolveStorage()): number {
  const next = readCount(storage) + 1;
  try {
    storage.setItem(CRASH_KEY, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Mark the app stable — clears the consecutive-crash counter. */
export function markStable(storage: KeyValueStorage = resolveStorage()): void {
  try {
    storage.setItem(CRASH_KEY, "0");
  } catch {
    /* ignore */
  }
}

/** Whether the current boot count means we should enter safe mode. */
export function isSafeMode(count: number): boolean {
  return count >= STRIKE_THRESHOLD;
}

export function getCrashCount(storage: KeyValueStorage = resolveStorage()): number {
  return readCount(storage);
}
