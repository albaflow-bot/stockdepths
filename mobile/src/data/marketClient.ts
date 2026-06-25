/**
 * Market index client — fetches the index summary (server Task 2 overview output)
 * and caches the last good value on-device so the 시장 요약 바 can render the PREVIOUS
 * value instantly while a refresh is in flight (SPEC §5.5 / BinDesk playbook: 비동기
 * UI는 스피너 단독 금지 — 직전 캐시값 우선 + 갱신 표시).
 *
 * Reads the API base from env; on no base / network error / non-OK it throws
 * MarketDataUnavailableError and the caller falls back to the cached value (the bar
 * never goes blank — stale-on-error / Sane default).
 */

import { apiBaseUrl } from "./config";
import type { AsyncKeyValueStorage } from "./storage";
import { defaultStorage } from "./storage";
import type { MarketIndex } from "../types/market";

export class MarketDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataUnavailableError";
  }
}

export type MarketIndicesLoader = () => Promise<MarketIndex[]>;

/** Fetch the current index summary across markets. Throws when unavailable. */
export const fetchMarketIndices: MarketIndicesLoader = async () => {
  const base = apiBaseUrl();
  if (!base) {
    throw new MarketDataUnavailableError("시장 데이터 서버가 아직 연결되지 않았습니다.");
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/market/indices`);
  } catch {
    throw new MarketDataUnavailableError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new MarketDataUnavailableError(`지수를 불러오지 못했습니다 (오류 ${res.status}).`);
  }

  const data = (await res.json()) as MarketIndex[] | { indices?: MarketIndex[] };
  const list = Array.isArray(data) ? data : (data.indices ?? []);
  return list.filter((i) => i && typeof i.symbol === "string");
};

const CACHE_KEY = "bindesk:market-indices";

interface CachedIndices {
  indices: MarketIndex[];
  cachedAt: string;
}

/** Persists the last good index summary for stale-first rendering. */
export class MarketIndexCacheRepository {
  private readonly storage: AsyncKeyValueStorage;

  constructor(deps: { storage?: AsyncKeyValueStorage } = {}) {
    this.storage = deps.storage ?? defaultStorage();
  }

  /** Last cached indices (+ when), or null. Never throws (corrupt → null). */
  async load(): Promise<CachedIndices | null> {
    try {
      const raw = await this.storage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedIndices;
      return parsed && Array.isArray(parsed.indices) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(indices: MarketIndex[], cachedAt: string): Promise<void> {
    try {
      await this.storage.setItem(CACHE_KEY, JSON.stringify({ indices, cachedAt }));
    } catch {
      /* best-effort warm cache; never throw to the UI */
    }
  }
}

export interface RefreshIndicesResult {
  indices: MarketIndex[];
  /** True when the value came from cache because the live fetch failed. */
  stale: boolean;
}

/**
 * Cache-first refresh: returns the freshly-fetched indices (and writes them to the
 * cache), or — if the live fetch fails — the last cached value flagged `stale`. The
 * bar therefore never goes blank. `loader`/`now` are injectable for tests.
 */
export async function refreshIndices(
  cache: MarketIndexCacheRepository,
  loader: MarketIndicesLoader = fetchMarketIndices,
  now: () => string = () => new Date().toISOString(),
): Promise<RefreshIndicesResult> {
  try {
    const indices = await loader();
    await cache.save(indices, now());
    return { indices, stale: false };
  } catch {
    const cached = await cache.load();
    return { indices: cached?.indices ?? [], stale: true };
  }
}
