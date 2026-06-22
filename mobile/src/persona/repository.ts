/**
 * Persona repository — persists the chosen persona to on-device storage only
 * (SPEC §3.2: no login). `load()` returns null when nothing is set yet, which is
 * what drives the first-run gate.
 */

import type { AsyncKeyValueStorage } from "../data/storage";
import { defaultStorage } from "../data/storage";
import type { PersonaConfig } from "./types";

const STORAGE_KEY = "bindesk:persona";

export interface PersonaRepositoryDeps {
  storage?: AsyncKeyValueStorage;
  now?: () => string;
}

export class PersonaRepository {
  private readonly storage: AsyncKeyValueStorage;
  readonly now: () => string;

  constructor(deps: PersonaRepositoryDeps = {}) {
    this.storage = deps.storage ?? defaultStorage();
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** The saved persona, or null on first run / corrupt store. */
  async load(): Promise<PersonaConfig | null> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersonaConfig;
      if (!parsed || typeof parsed.targetReturnPct !== "number" || typeof parsed.stopLossPct !== "number") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async save(config: PersonaConfig): Promise<PersonaConfig> {
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(config));
    return config;
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(STORAGE_KEY);
  }
}
