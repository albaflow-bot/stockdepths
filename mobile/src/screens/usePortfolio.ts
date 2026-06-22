import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortfolioRepository } from "../portfolio/repository";
import { EMPTY_PORTFOLIO, PortfolioValidationError, type HoldingInput, type Portfolio } from "../portfolio/types";
import { fetchQuotes, type Quote, type QuotesLoader } from "../data/quotesClient";
import { addBreadcrumb } from "../resilience/errorLog";

export interface UsePortfolioDeps {
  repository?: PortfolioRepository;
  quotesLoader?: QuotesLoader;
}

export interface PortfolioController {
  status: "loading" | "ready";
  portfolio: Portfolio;
  quotes: Record<string, Quote>;
  quotesError?: string;
  addWatch: (symbol: string) => Promise<string | null>;
  removeWatch: (symbol: string) => Promise<string | null>;
  addHolding: (input: HoldingInput) => Promise<string | null>;
  removeHolding: (id: string) => Promise<string | null>;
  refreshQuotes: () => void;
}

function uniqueSymbols(pf: Portfolio): string[] {
  const set = new Set<string>();
  for (const w of pf.watchlist) set.add(w.symbol.toUpperCase());
  for (const h of pf.holdings) set.add(h.symbol.toUpperCase());
  return [...set];
}

/**
 * Loads the on-device portfolio and live quotes, and exposes mutation actions
 * that persist + refresh. Quote failures are non-fatal (holdings still show with
 * cost basis). Loader refs keep effects stable so inline test loaders can't loop.
 */
export function usePortfolio(deps: UsePortfolioDeps = {}): PortfolioController {
  const repo = useMemo(() => deps.repository ?? new PortfolioRepository(), [deps.repository]);
  const quotesLoaderRef = useRef<QuotesLoader>(deps.quotesLoader ?? fetchQuotes);
  quotesLoaderRef.current = deps.quotesLoader ?? fetchQuotes;

  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [portfolio, setPortfolio] = useState<Portfolio>(EMPTY_PORTFOLIO);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quotesError, setQuotesError] = useState<string | undefined>(undefined);

  const loadQuotes = useCallback(async (pf: Portfolio) => {
    const symbols = uniqueSymbols(pf);
    if (symbols.length === 0) {
      setQuotes({});
      setQuotesError(undefined);
      return;
    }
    try {
      setQuotes(await quotesLoaderRef.current(symbols));
      setQuotesError(undefined);
    } catch (err) {
      // Keep any prior quotes; surface a non-blocking message.
      setQuotesError(err instanceof Error ? err.message : "시세를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const pf = await repo.load();
      if (!active) return;
      setPortfolio(pf);
      setStatus("ready");
      await loadQuotes(pf);
    })();
    return () => {
      active = false;
    };
  }, [repo, loadQuotes]);

  const apply = useCallback(
    async (op: () => Promise<Portfolio>, label: string): Promise<string | null> => {
      try {
        const pf = await op();
        addBreadcrumb(`portfolio ${label}`);
        setPortfolio(pf);
        await loadQuotes(pf);
        return null;
      } catch (err) {
        if (err instanceof PortfolioValidationError) return err.message;
        return "저장 중 오류가 발생했습니다.";
      }
    },
    [loadQuotes],
  );

  const addWatch = useCallback((s: string) => apply(() => repo.addToWatchlist(s), `watch+ ${s}`), [apply, repo]);
  const removeWatch = useCallback((s: string) => apply(() => repo.removeFromWatchlist(s), `watch- ${s}`), [apply, repo]);
  const addHolding = useCallback((i: HoldingInput) => apply(() => repo.addHolding(i), `holding+ ${i.symbol}`), [apply, repo]);
  const removeHolding = useCallback((id: string) => apply(() => repo.removeHolding(id), `holding- ${id}`), [apply, repo]);
  const refreshQuotes = useCallback(() => void loadQuotes(portfolio), [loadQuotes, portfolio]);

  return { status, portfolio, quotes, quotesError, addWatch, removeWatch, addHolding, removeHolding, refreshQuotes };
}
