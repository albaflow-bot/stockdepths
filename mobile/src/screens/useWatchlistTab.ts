/**
 * Controller for the 관심·보유 active dashboard (SPEC §5.5). Composes:
 *  • the on-device portfolio + live quotes (existing usePortfolio),
 *  • the day's market dashboard (indices/brief/TOP/signals — graceful, never throws),
 *  • cache-first index refresh (시장 헤더 never blank), and
 *  • per-holding OnDeviceRule timing signals (deterministic, no LLM).
 *
 * Conflict (SPEC §5.4): a holding shows BOTH its OnDeviceRule (personal) and its
 * DailyBatch signal, personal first — this hook returns them already ordered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortfolio, type UsePortfolioDeps } from "./usePortfolio";
import { computePortfolioPnL, type HoldingPnL } from "../portfolio/pnl";
import { evaluateHoldingRule } from "../services/onDeviceRule";
import {
  MarketIndexCacheRepository,
  refreshIndices,
} from "../data/marketClient";
import {
  fetchDashboard,
  EMPTY_DASHBOARD,
  type DashboardData,
  type DashboardLoader,
  type RankedStock,
} from "../data/dashboardClient";
import type { MarketIndex } from "../types/market";
import type { TimingSignal } from "../types/timing";
import type { PersonaConfig } from "../persona/types";
import type { Holding } from "../portfolio/types";

export interface UseWatchlistTabDeps extends UsePortfolioDeps {
  persona?: PersonaConfig;
  /** Dashboard loader (indices/brief/TOP/signals). Defaults to the graceful API loader. */
  dashboardLoader?: DashboardLoader;
  /** Index cache repo for stale-first header rendering. */
  marketCache?: MarketIndexCacheRepository;
}

/** A holding row: P&L + its ordered timing signals (personal first) + news count. */
export interface HoldingRow {
  pnl: HoldingPnL;
  /** OnDeviceRule (personal) signal, when a quote is available. */
  personal?: TimingSignal;
  /** DailyBatch signal for the ticker, when present. */
  batch?: TimingSignal;
  /** Count of brief-linked news referencing this ticker (보유 종목 관련 뉴스 N건). */
  newsCount: number;
}

/** A watch row: current price + DailyBatch signal. */
export interface WatchRowData {
  symbol: string;
  price?: number;
  changePercent?: number;
  batch?: TimingSignal;
  newsCount: number;
}

export interface WatchlistTabController {
  status: "loading" | "ready";
  // market header
  indices: MarketIndex[];
  indicesUpdating: boolean;
  indicesStale: boolean;
  // brief + picker
  dashboard: DashboardData;
  topRows: RankedStock[];
  // composed lists
  holdingRows: HoldingRow[];
  watchRows: WatchRowData[];
  watchSet: Set<string>;
  quotesError?: string;
  // actions
  toggleWatch: (symbol: string) => Promise<string | null>;
  addWatch: ReturnType<typeof usePortfolio>["addWatch"];
  addHolding: ReturnType<typeof usePortfolio>["addHolding"];
  removeHolding: ReturnType<typeof usePortfolio>["removeHolding"];
  removeWatch: ReturnType<typeof usePortfolio>["removeWatch"];
}

function newsCountFor(ticker: string, linked: string[] | undefined): number {
  if (!linked) return 0;
  const t = ticker.toUpperCase();
  return linked.some((l) => l.toUpperCase() === t) ? 1 : 0;
}

export function useWatchlistTab(deps: UseWatchlistTabDeps = {}): WatchlistTabController {
  const pf = usePortfolio(deps);

  const cache = useMemo(() => deps.marketCache ?? new MarketIndexCacheRepository(), [deps.marketCache]);
  const loaderRef = useRef<DashboardLoader>(deps.dashboardLoader ?? fetchDashboard);
  loaderRef.current = deps.dashboardLoader ?? fetchDashboard;

  const [dashboard, setDashboard] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [indicesUpdating, setIndicesUpdating] = useState(true);
  const [indicesStale, setIndicesStale] = useState(false);

  // Cache-first header + dashboard load (once).
  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await cache.load();
      if (active && cached) setIndices(cached.indices);
      const data = await loaderRef.current();
      if (!active) return;
      setDashboard(data);
      if (data.indices.length > 0) {
        setIndices(data.indices);
        setIndicesStale(false);
        await cache.save(data.indices, new Date().toISOString());
      } else {
        // Dashboard had no indices — try the dedicated index endpoint, stale-first.
        const r = await refreshIndices(cache);
        if (!active) return;
        if (r.indices.length > 0) setIndices(r.indices);
        setIndicesStale(r.stale);
      }
      setIndicesUpdating(false);
    })();
    return () => {
      active = false;
    };
  }, [cache]);

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [sym, q] of Object.entries(pf.quotes)) m[sym] = q.price;
    return m;
  }, [pf.quotes]);

  const { rows: pnlRows } = useMemo(
    () => computePortfolioPnL(pf.portfolio.holdings, priceMap),
    [pf.portfolio.holdings, priceMap],
  );

  const holdingsBySymbol = useMemo(() => {
    const m = new Map<string, Holding>();
    for (const h of pf.portfolio.holdings) m.set(h.symbol.toUpperCase(), h);
    return m;
  }, [pf.portfolio.holdings]);

  const holdingRows = useMemo<HoldingRow[]>(() => {
    const linked = dashboard.brief?.linkedTickers;
    return pnlRows.map((pnl) => {
      const sym = pnl.symbol.toUpperCase();
      const holding = holdingsBySymbol.get(sym);
      const quote = pf.quotes[sym];
      // OnDeviceRule personal signal — only when we have a holding + a live price.
      let personal: TimingSignal | undefined;
      if (holding && quote) {
        const e = evaluateHoldingRule(
          holding,
          { symbol: sym, price: quote.price, changePercent: quote.changePercent, asOf: quote.asOf },
          deps.persona,
        );
        personal = e?.signal;
      }
      return { pnl, personal, batch: dashboard.signals[sym], newsCount: newsCountFor(sym, linked) };
    });
  }, [pnlRows, holdingsBySymbol, pf.quotes, dashboard.signals, dashboard.brief, deps.persona]);

  const watchRows = useMemo<WatchRowData[]>(() => {
    const linked = dashboard.brief?.linkedTickers;
    return pf.portfolio.watchlist.map((w) => {
      const sym = w.symbol.toUpperCase();
      const quote = pf.quotes[sym];
      return {
        symbol: sym,
        price: quote?.price,
        changePercent: quote?.changePercent,
        batch: dashboard.signals[sym],
        newsCount: newsCountFor(sym, linked),
      };
    });
  }, [pf.portfolio.watchlist, pf.quotes, dashboard.signals, dashboard.brief]);

  const watchSet = useMemo(
    () => new Set(pf.portfolio.watchlist.map((w) => w.symbol.toUpperCase())),
    [pf.portfolio.watchlist],
  );

  // '여기서 담기' rows: TOP/popular not already held (still show watched ones so the
  // toggle reflects 담김 state).
  const topRows = useMemo(() => {
    const held = new Set(pf.portfolio.holdings.map((h) => h.symbol.toUpperCase()));
    const seen = new Set<string>();
    const out: RankedStock[] = [];
    for (const r of dashboard.top) {
      const sym = r.symbol.toUpperCase();
      if (held.has(sym) || seen.has(sym)) continue;
      seen.add(sym);
      out.push(r);
    }
    return out;
  }, [dashboard.top, pf.portfolio.holdings]);

  const toggleWatch = useCallback(
    (symbol: string) => {
      const sym = symbol.toUpperCase();
      return watchSet.has(sym) ? pf.removeWatch(sym) : pf.addWatch(sym);
    },
    [watchSet, pf],
  );

  return {
    status: pf.status,
    indices,
    indicesUpdating,
    indicesStale,
    dashboard,
    topRows,
    holdingRows,
    watchRows,
    watchSet,
    quotesError: pf.quotesError,
    toggleWatch,
    addWatch: pf.addWatch,
    addHolding: pf.addHolding,
    removeHolding: pf.removeHolding,
    removeWatch: pf.removeWatch,
  };
}
