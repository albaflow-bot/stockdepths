/**
 * On-device key/value storage abstraction (SPEC §3.2: no login — personal data
 * lives on-device only).
 *
 * Async by design so a real Expo build can drop in
 * `@react-native-async-storage/async-storage` without touching call sites. The
 * default resolves to web localStorage (wrapped async) and falls back to an
 * in-memory store, so typecheck/tests run without the native dependency. All
 * operations are guarded — storage problems never throw to the UI.
 */

export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** A purely in-memory store (test default, and fallback when nothing else exists). */
export function createMemoryStorage(): AsyncKeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => (m.has(k) ? m.get(k)! : null),
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

interface SyncWebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function wrapWebStorage(ls: SyncWebStorage): AsyncKeyValueStorage {
  return {
    getItem: async (k) => {
      try {
        return ls.getItem(k);
      } catch {
        return null;
      }
    },
    setItem: async (k, v) => {
      try {
        ls.setItem(k, v);
      } catch {
        /* quota / privacy mode — degrade silently */
      }
    },
    removeItem: async (k) => {
      try {
        ls.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

let cached: AsyncKeyValueStorage | undefined;

/**
 * Override the process-wide default storage. Call once at the native app entry
 * with AsyncStorage so on-device data persists across launches, e.g.:
 *
 *   import AsyncStorage from "@react-native-async-storage/async-storage";
 *   setDefaultStorage(AsyncStorage); // satisfies AsyncKeyValueStorage
 *
 * On web this is unnecessary — defaultStorage() already uses localStorage.
 */
export function setDefaultStorage(storage: AsyncKeyValueStorage): void {
  cached = storage;
}

/**
 * The default on-device storage. On a native Expo build, inject AsyncStorage via
 * {@link setDefaultStorage} (this returns localStorage on web, memory otherwise).
 */
export function defaultStorage(): AsyncKeyValueStorage {
  if (cached) return cached;
  try {
    const ls = (globalThis as { localStorage?: SyncWebStorage }).localStorage;
    if (ls) {
      ls.getItem("__probe__"); // throws in some privacy modes
      cached = wrapWebStorage(ls);
      return cached;
    }
  } catch {
    /* fall through */
  }
  cached = createMemoryStorage();
  return cached;
}
