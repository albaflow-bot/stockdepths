import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLogStore } from "../auditLog.js";

describe("AuditLogStore (in-memory)", () => {
  it("records events and reads them back by session", () => {
    const log = new AuditLogStore({ file: null });
    log.record("s1", "edge_gate_selected", "2026-06-22T00:00:00.000Z", { edgeId: "e1" });
    log.record("s1", "spec_interview_started", "2026-06-22T00:00:01.000Z");
    log.record("s2", "edge_gate_skipped", "2026-06-22T00:00:02.000Z");

    expect(log.readBySession("s1").map((e) => e.type)).toEqual([
      "edge_gate_selected",
      "spec_interview_started",
    ]);
    expect(log.readBySession("s1")[0]?.detail).toEqual({ edgeId: "e1" });
    expect(log.readBySession("s2")).toHaveLength(1);
  });

  it("is idempotent by (session, type, at)", () => {
    const log = new AuditLogStore({ file: null });
    expect(log.record("s1", "edge_gate_selected", "t1")).not.toBeNull();
    expect(log.record("s1", "edge_gate_selected", "t1")).toBeNull(); // duplicate
    expect(log.readBySession("s1")).toHaveLength(1);
  });
});

describe("AuditLogStore (append-only file)", () => {
  const file = join(tmpdir(), `audit-log-${Math.random().toString(36).slice(2)}.jsonl`);
  afterEach(() => {
    if (existsSync(file)) rmSync(file);
  });

  it("persists across instances and skips corrupt lines", () => {
    const a = new AuditLogStore({ file });
    a.record("s1", "edge_gate_selected", "t1");
    appendFileSync(file, "not json\n", "utf8");
    a.record("s1", "spec_finalized", "t2");

    const b = new AuditLogStore({ file });
    expect(b.readBySession("s1").map((e) => e.type)).toEqual([
      "edge_gate_selected",
      "spec_finalized",
    ]);
  });
});
