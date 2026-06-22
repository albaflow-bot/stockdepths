/**
 * Portfolio repository — persists the watchlist + holdings to on-device storage
 * only (SPEC §3.2: no login, local storage). Every mutation validates input,
 * writes the whole portfolio back, and returns the new state. Reads tolerate a
 * missing/corrupt store by returning an empty portfolio (Sane default).
 */

import type { AsyncKeyValueStorage } from "../data/storage";
import { defaultStorage } from "../data/storage";
import {
  EMPTY_PORTFOLIO,
  PortfolioValidationError,
  type Holding,
  type HoldingInput,
  type Portfolio,
} from "./types";

const STORAGE_KEY = "bindesk:portfolio";

function normalizeSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) {
    throw new PortfolioValidationError("종목 코드를 올바르게 입력해 주세요 (예: AAPL).");
  }
  return s;
}

function validatePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PortfolioValidationError(`${label}는 0보다 큰 숫자여야 합니다.`);
  }
  return value;
}

export interface RepositoryDeps {
  storage?: AsyncKeyValueStorage;
  /** ISO timestamp source (injectable for tests). */
  now?: () => string;
  /** Stable id generator (injectable for tests). */
  genId?: () => string;
}

export class PortfolioRepository {
  private readonly storage: AsyncKeyValueStorage;
  private readonly now: () => string;
  private readonly genId: () => string;
  private counter = 0;

  constructor(deps: RepositoryDeps = {}) {
    this.storage = deps.storage ?? defaultStorage();
    this.now = deps.now ?? (() => new Date().toISOString());
    this.genId =
      deps.genId ?? (() => `h_${Date.now().toString(36)}_${(this.counter++).toString(36)}`);
  }

  async load(): Promise<Portfolio> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (!raw) return { ...EMPTY_PORTFOLIO };
      const parsed = JSON.parse(raw) as Partial<Portfolio>;
      return {
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
        holdings: Array.isArray(parsed.holdings) ? parsed.holdings : [],
      };
    } catch {
      return { ...EMPTY_PORTFOLIO };
    }
  }

  private async save(portfolio: Portfolio): Promise<Portfolio> {
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
    return portfolio;
  }

  async addToWatchlist(symbol: string): Promise<Portfolio> {
    const sym = normalizeSymbol(symbol);
    const portfolio = await this.load();
    if (portfolio.watchlist.some((w) => w.symbol === sym)) return portfolio; // idempotent
    portfolio.watchlist = [{ symbol: sym, addedAt: this.now() }, ...portfolio.watchlist];
    return this.save(portfolio);
  }

  async removeFromWatchlist(symbol: string): Promise<Portfolio> {
    const sym = symbol.trim().toUpperCase();
    const portfolio = await this.load();
    portfolio.watchlist = portfolio.watchlist.filter((w) => w.symbol !== sym);
    return this.save(portfolio);
  }

  async addHolding(input: HoldingInput): Promise<Portfolio> {
    const sym = normalizeSymbol(input.symbol);
    const costBasis = validatePositive(input.costBasis, "매수가");
    const quantity =
      input.quantity == null ? undefined : validatePositive(input.quantity, "수량");

    const holding: Holding = {
      id: this.genId(),
      symbol: sym,
      costBasis,
      quantity,
      note: input.note?.trim() || undefined,
      createdAt: this.now(),
    };
    const portfolio = await this.load();
    portfolio.holdings = [holding, ...portfolio.holdings];
    return this.save(portfolio);
  }

  async updateHolding(
    id: string,
    patch: Partial<Pick<Holding, "costBasis" | "quantity" | "note">>,
  ): Promise<Portfolio> {
    const portfolio = await this.load();
    portfolio.holdings = portfolio.holdings.map((h) => {
      if (h.id !== id) return h;
      const next: Holding = { ...h };
      if (patch.costBasis != null) next.costBasis = validatePositive(patch.costBasis, "매수가");
      if (patch.quantity !== undefined) {
        next.quantity = patch.quantity == null ? undefined : validatePositive(patch.quantity, "수량");
      }
      if (patch.note !== undefined) next.note = patch.note?.trim() || undefined;
      return next;
    });
    return this.save(portfolio);
  }

  async removeHolding(id: string): Promise<Portfolio> {
    const portfolio = await this.load();
    portfolio.holdings = portfolio.holdings.filter((h) => h.id !== id);
    return this.save(portfolio);
  }
}
