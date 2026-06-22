/**
 * Append-only audit log for edge-gate / SPEC-interview events (Task 4).
 *
 * SPEC §5 needs an immutable trail of what the user decided at the gate
 * (`edge_gate_selected` and friends). Modeled exactly on ../track/store: a JSONL file
 * where writes only ever APPEND — existing lines are never mutated or deleted — with
 * an in-memory mirror for reads. Corrupt lines are skipped, disk failure never
 * crashes the caller (Sane default + override / RESILIENCE CONTRACT).
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

/** Audit event kinds (extend as the flow grows). */
export type AuditEventType =
  | "edge_gate_selected" // recommendation accepted
  | "edge_gate_overridden" // a non-recommended candidate chosen (informed override)
  | "edge_gate_custom" // user typed their own edge at the §5.4 fallback
  | "edge_gate_skipped" // proceeded with no edge (엣지 미감)
  | "spec_interview_started"
  | "spec_finalized";

export interface AuditEvent {
  /** `${sessionId}:${type}:${at}` — uniqueness + idempotency key. */
  id: string;
  sessionId: string;
  type: AuditEventType;
  /** ISO timestamp. */
  at: string;
  /** Arbitrary structured detail (edge id, data source, etc.). */
  detail?: Record<string, unknown>;
}

export interface AuditLogStoreOptions {
  /** JSONL file path. `null` disables disk (tests). Defaults to .bindesk/audit-log.jsonl. */
  file?: string | null;
}

function defaultFile(): string {
  return join(process.cwd(), ".bindesk", "audit-log.jsonl");
}

export class AuditLogStore {
  private readonly file: string | null;
  private events: AuditEvent[] = [];
  private ids = new Set<string>();
  private loaded = false;

  constructor(opts: AuditLogStoreOptions = {}) {
    this.file = opts.file === undefined ? defaultFile() : opts.file;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file || !existsSync(this.file)) return;
    try {
      for (const line of readFileSync(this.file, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const ev = JSON.parse(t) as AuditEvent;
          if (ev && ev.id && !this.ids.has(ev.id)) {
            this.events.push(ev);
            this.ids.add(ev.id);
          }
        } catch {
          // skip a corrupt line rather than failing the whole read
        }
      }
    } catch {
      // unreadable log is treated as empty (Sane default + override)
    }
  }

  /**
   * Record an event. The id is derived from (sessionId, type, at) so the same logical
   * event is idempotent. Returns the event actually appended, or null if a duplicate.
   */
  record(sessionId: string, type: AuditEventType, at: string, detail?: Record<string, unknown>): AuditEvent | null {
    this.ensureLoaded();
    const id = `${sessionId}:${type}:${at}`;
    if (this.ids.has(id)) return null;
    const event: AuditEvent = { id, sessionId, type, at, ...(detail ? { detail } : {}) };
    this.events.push(event);
    this.ids.add(id);
    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        appendFileSync(this.file, JSON.stringify(event) + "\n", "utf8");
      } catch {
        // disk failure must not lose the in-memory append nor crash the flow
      }
    }
    return event;
  }

  /** All events for a session, in insertion order. */
  readBySession(sessionId: string): AuditEvent[] {
    this.ensureLoaded();
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  /** All events (ascending by timestamp then id). */
  readAll(): AuditEvent[] {
    this.ensureLoaded();
    return [...this.events].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1));
  }
}
