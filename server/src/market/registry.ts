/**
 * Per-market adapter registry. Downstream pick/alert logic asks the registry for
 * a market and gets back a cached adapter behind the common interface — it never
 * names a concrete source (SPEC §3.3 "swapped per market without touching
 * downstream logic"). KR is intentionally absent until its free-data path is
 * verified (SPEC §우선순위: 한국은 데이터 확인 후 패스트팔로우).
 */

import { TtlCache, type CacheOptions } from "./cache.js";
import { CachedMarketSource, type CacheTtls } from "./cached.js";
import { UsMarketAdapter } from "./adapters/us.js";
import type { Market, MarketSourceAdapter } from "./types.js";

export interface RegistryOptions {
  cache?: CacheOptions;
  ttls?: CacheTtls;
}

export class MarketRegistry {
  private readonly adapters = new Map<Market, MarketSourceAdapter>();
  private readonly cache: TtlCache;
  private readonly ttls?: CacheTtls;

  constructor(opts: RegistryOptions = {}) {
    this.cache = new TtlCache(opts.cache);
    this.ttls = opts.ttls;
    // Register built-in markets. Each raw adapter is wrapped in the cache layer.
    this.register(new UsMarketAdapter());
  }

  /** Wrap a raw adapter in the shared cache and register it under its market. */
  register(raw: MarketSourceAdapter): void {
    this.adapters.set(raw.market, new CachedMarketSource(raw, this.cache, this.ttls));
  }

  /** Returns the cached adapter for a market, or undefined if unsupported. */
  get(market: Market): MarketSourceAdapter | undefined {
    return this.adapters.get(market);
  }

  /** Like get(), but throws a clear error for unsupported markets. */
  require(market: Market): MarketSourceAdapter {
    const a = this.adapters.get(market);
    if (!a) {
      throw new Error(
        `No source adapter registered for market "${market}". Supported: ${[...this.adapters.keys()].join(", ")}.`,
      );
    }
    return a;
  }

  supported(): Market[] {
    return [...this.adapters.keys()];
  }
}

/** Process-wide default registry for production use. */
let defaultRegistry: MarketRegistry | undefined;

export function getMarketRegistry(): MarketRegistry {
  if (!defaultRegistry) defaultRegistry = new MarketRegistry();
  return defaultRegistry;
}
