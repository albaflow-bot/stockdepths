/**
 * Audit-session store with the edge-gate columns (SPEC §5, Task 1/7).
 *
 * This project has no SQL database — persistence is file-based with an in-memory
 * mirror, matching ../track/store and ../pipeline/artifactStore. So the "audit_session
 * table" the task calls for is modeled as an {@link AuditSession} record, and the two
 * new "columns" are the typed fields `selectedEdgeId` and `edgeMetadata`.
 *
 * `selectedEdgeId` freezes the user's gate decision (the pre-selected recommendation,
 * or an informed override — SPEC §5.4). `edgeMetadata` stores the full gate result
 * (candidates + evaluation tables + recommendation) so the downstream interview can
 * flow "엣지-aware" (SPEC §5.1) without re-running research.
 *
 * Backed by a JSON file (best-effort disk + in-memory map); disk failures never crash
 * a run (Sane default + override). Reads tolerate a corrupt file by starting empty.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { EdgeCandidate, EdgeGateResult } from "./types.js";
import type { SpecInterviewState } from "./specInterview.js";

/** Metadata frozen on the session once the gate produces its result. */
export type EdgeGateMetadata = EdgeGateResult;

/**
 * Audit-session lifecycle (SPEC §5.1 flow). The edge gate is a blocking step before
 * the detailed SPEC interview: `edge_gate` → (commit/skip) → `spec_interview` →
 * (answers embedded) → `spec_finalized`.
 */
export type AuditSessionStatus = "edge_gate" | "spec_interview" | "spec_finalized";

/**
 * One audit session. The edge-gate fields default to null until the gate runs and
 * the user faces the recommendation (SPEC §5.4 직면 강제). A null `selectedEdgeId`
 * with non-null `edgeMetadata` means "gate ran, choice not yet committed".
 */
export interface AuditSession {
  /** Stable session id (uniqueness + idempotency key). */
  id: string;
  /** Short idea summary this session is about (Korean ok). */
  ideaSummary: string;
  /** ISO timestamp the session was created. */
  createdAt: string;
  /** ISO timestamp of the last update. */
  updatedAt: string;
  /** Lifecycle stage; starts at `edge_gate`. */
  status: AuditSessionStatus;
  // --- edge-gate columns (Task 1) ---
  /** The committed edge id (recommendation accepted OR informed override). null = undecided. */
  selectedEdgeId: string | null;
  /** Full gate result (candidates + evaluations + recommendation). null = gate not run. */
  edgeMetadata: EdgeGateMetadata | null;
  /**
   * Snapshot of the committed edge (데이터소스·파이프라인·평가), frozen at accept time
   * (Task 4) so the chosen edge survives even if the gate result is later replaced.
   * null = no edge committed (skipped or undecided).
   */
  selectedEdge?: EdgeCandidate | null;
  /** Edge-aware SPEC interview state (questions + answers + embedded SPEC). */
  specInterview?: SpecInterviewState | null;
}

export interface AuditSessionStoreOptions {
  /** JSON file path. `null` disables disk (tests). Defaults to .bindesk/audit-sessions.json. */
  file?: string | null;
}

function defaultFile(): string {
  return join(process.cwd(), ".bindesk", "audit-sessions.json");
}

export class AuditSessionStore {
  private readonly file: string | null;
  private sessions = new Map<string, AuditSession>();
  private loaded = false;

  constructor(opts: AuditSessionStoreOptions = {}) {
    this.file = opts.file === undefined ? defaultFile() : opts.file;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file || !existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as AuditSession[];
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (s && typeof s.id === "string") {
            // Backfill status for records written before Task 4 (Sane default).
            if (!s.status) s.status = "edge_gate";
            this.sessions.set(s.id, s);
          }
        }
      }
    } catch {
      // corrupt/unreadable store is treated as empty (Sane default + override)
    }
  }

  private flush(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify([...this.sessions.values()], null, 2), "utf8");
    } catch {
      // best-effort persistence; never fail the run on a disk problem
    }
  }

  get(id: string): AuditSession | undefined {
    this.ensureLoaded();
    return this.sessions.get(id);
  }

  readAll(): AuditSession[] {
    this.ensureLoaded();
    return [...this.sessions.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
  }

  /**
   * Create a session if absent, else return the existing one (idempotent by id).
   * Edge-gate fields start null — the gate fills them later.
   */
  create(id: string, ideaSummary: string, now: string): AuditSession {
    this.ensureLoaded();
    const existing = this.sessions.get(id);
    if (existing) return existing;
    const session: AuditSession = {
      id,
      ideaSummary,
      createdAt: now,
      updatedAt: now,
      status: "edge_gate",
      selectedEdgeId: null,
      edgeMetadata: null,
      selectedEdge: null,
      specInterview: null,
    };
    this.sessions.set(id, session);
    this.flush();
    return session;
  }

  /**
   * Attach the gate's result to a session (SPEC §5.2). Does NOT auto-commit a
   * selection — facing the recommendation is forced, accepting it is not (SPEC §5.4).
   * Throws if the session does not exist.
   */
  attachEdgeMetadata(id: string, metadata: EdgeGateMetadata, now: string): AuditSession {
    this.ensureLoaded();
    const session = this.sessions.get(id);
    if (!session) throw new Error(`audit session not found: ${id}`);
    const updated: AuditSession = { ...session, edgeMetadata: metadata, updatedAt: now };
    this.sessions.set(id, updated);
    this.flush();
    return updated;
  }

  /**
   * Commit the user's edge choice (SPEC §5.4): the pre-selected recommendation or an
   * informed override. Pass `edgeId = null` to record an explicit "no edge selected".
   * Throws if the session does not exist.
   */
  selectEdge(id: string, edgeId: string | null, now: string): AuditSession {
    return this.patch(id, { selectedEdgeId: edgeId }, now);
  }

  /**
   * Commit the user's edge choice WITH its frozen snapshot and a status transition
   * (Task 4): saves `selectedEdgeId` + `selectedEdge` (데이터소스·파이프라인·평가) and
   * moves the session to the next stage. `selectedEdge = null` records a skip.
   * Throws if the session does not exist.
   */
  commitSelection(
    id: string,
    selectedEdge: EdgeCandidate | null,
    status: AuditSessionStatus,
    now: string,
  ): AuditSession {
    return this.patch(
      id,
      { selectedEdgeId: selectedEdge?.id ?? null, selectedEdge, status },
      now,
    );
  }

  /** Store the edge-aware SPEC interview state (questions/answers/embedded SPEC). */
  setSpecInterview(
    id: string,
    specInterview: SpecInterviewState,
    status: AuditSessionStatus,
    now: string,
  ): AuditSession {
    return this.patch(id, { specInterview, status }, now);
  }

  /** Apply a partial update to a session, bumping updatedAt. Throws if absent. */
  private patch(id: string, patch: Partial<AuditSession>, now: string): AuditSession {
    this.ensureLoaded();
    const session = this.sessions.get(id);
    if (!session) throw new Error(`audit session not found: ${id}`);
    const updated: AuditSession = { ...session, ...patch, updatedAt: now };
    this.sessions.set(id, updated);
    this.flush();
    return updated;
  }
}
