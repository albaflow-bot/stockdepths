/**
 * Decision-queue repository — persists the user's decision per item on-device only
 * (no login). The seed list (`queue.ts`) defines the items; this stores only the
 * status overlay (id → DecisionStatus), so seed copy can change without losing the
 * user's choices. Reads tolerate a missing/corrupt store (Sane default).
 */

import type { AsyncKeyValueStorage } from "../data/storage";
import { defaultStorage } from "../data/storage";
import { SEED_DECISIONS } from "./queue";
import type { DecisionItem, DecisionStatus } from "./types";

const STORAGE_KEY = "bindesk:decisions";

export interface DecisionRepositoryDeps {
  storage?: AsyncKeyValueStorage;
  /** Seed list override (tests). Defaults to {@link SEED_DECISIONS}. */
  seeds?: readonly DecisionItem[];
}

export class DecisionRepository {
  private readonly storage: AsyncKeyValueStorage;
  private readonly seeds: readonly DecisionItem[];

  constructor(deps: DecisionRepositoryDeps = {}) {
    this.storage = deps.storage ?? defaultStorage();
    this.seeds = deps.seeds ?? SEED_DECISIONS;
  }

  private async loadOverlay(): Promise<Record<string, DecisionStatus>> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, DecisionStatus>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /** The decision items with the user's saved status applied over the seed status. */
  async list(): Promise<DecisionItem[]> {
    const overlay = await this.loadOverlay();
    return this.seeds.map((item) => ({ ...item, status: overlay[item.id] ?? item.status }));
  }

  /** Persist a decision for one item; returns the updated list. */
  async setStatus(id: string, status: DecisionStatus): Promise<DecisionItem[]> {
    const overlay = await this.loadOverlay();
    overlay[id] = status;
    try {
      await this.storage.setItem(STORAGE_KEY, JSON.stringify(overlay));
    } catch {
      /* best-effort; never throw to the UI */
    }
    return this.list();
  }

  /** Count of items still awaiting a decision (status === "open"). */
  async openCount(): Promise<number> {
    return (await this.list()).filter((i) => i.status === "open").length;
  }
}
