/**
 * Store for the daily "today's picks" shared public artifact.
 *
 * SPEC §3.3: the daily picks are produced once and served as ONE shared public
 * artifact (the single LLM run amortized across all users). This store makes the
 * oneshot idempotent per (market, date): if today's artifact already exists it is
 * returned instead of re-running the model. Persistence is best-effort disk under
 * <repoRoot>/.bindesk/artifacts plus an in-memory map; disk failures never break a
 * run (Sane default + override).
 *
 * NOTE: this is the *current* shared artifact, distinct from the append-only
 * immutable track-record log (Task 4) used by the scorecard.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Market } from "../market/types.js";
import type { Pick } from "../llm/types.js";

export interface DailyPicksArtifact {
  market: Market;
  /** YYYY-MM-DD the picks are for. */
  date: string;
  /** ISO timestamp the artifact was generated. */
  generatedAt: string;
  picks: Pick[];
  marketContext: string;
  /** Which provider/model produced it (honest provenance for the scorecard). */
  provider: string;
  model: string;
  /** Always-on 참고 조언 disclaimer (SPEC §3.2 / legal tone). */
  disclaimer: string;
  /** Symbols considered this run (for auditing / backtest seeding). */
  universe: string[];
}

export interface ArtifactStoreOptions {
  /** Directory for persisted artifacts. `null` disables disk (tests). */
  dir?: string | null;
}

function defaultDir(): string {
  return join(process.cwd(), ".bindesk", "artifacts");
}

function fileFor(dir: string, market: Market, date: string): string {
  return join(dir, `${market.toLowerCase()}-${date}.json`);
}

export class ArtifactStore {
  private mem = new Map<string, DailyPicksArtifact>();
  private readonly dir: string | null;

  constructor(opts: ArtifactStoreOptions = {}) {
    this.dir = opts.dir === undefined ? defaultDir() : opts.dir;
  }

  private key(market: Market, date: string): string {
    return `${market}:${date}`;
  }

  get(market: Market, date: string): DailyPicksArtifact | undefined {
    const hit = this.mem.get(this.key(market, date));
    if (hit) return hit;
    if (!this.dir) return undefined;
    try {
      const file = fileFor(this.dir, market, date);
      if (!existsSync(file)) return undefined;
      const parsed = JSON.parse(readFileSync(file, "utf8")) as DailyPicksArtifact;
      this.mem.set(this.key(market, date), parsed);
      return parsed;
    } catch {
      return undefined;
    }
  }

  put(artifact: DailyPicksArtifact): void {
    this.mem.set(this.key(artifact.market, artifact.date), artifact);
    if (!this.dir) return;
    try {
      const file = fileFor(this.dir, artifact.market, artifact.date);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(artifact, null, 2), "utf8");
    } catch {
      // best-effort persistence; never fail the batch on a disk problem
    }
  }
}
