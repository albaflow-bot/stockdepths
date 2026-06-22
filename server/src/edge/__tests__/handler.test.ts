import { describe, it, expect } from "vitest";
import {
  handleEdgeGate,
  handleEdgeSelect,
  matchEdgeGatePath,
  matchEdgeSelectPath,
  type EdgeGateDeps,
} from "../handler.js";
import { EdgeGateService } from "../service.js";
import { ScoutClient, type WebSearch, type WebSearchResult } from "../scout.js";
import { AuditSessionStore } from "../store.js";
import { AuditLogStore } from "../auditLog.js";
import { EdgeSelectionService } from "../selection.js";
import { TtlCache } from "../../market/cache.js";
import type { LlmCompletion, LlmProvider, LlmRequest } from "../../llm/types.js";

/** Build the Task-4 selection service over a shared sessions store. */
function selectionFor(sessions: AuditSessionStore): EdgeSelectionService {
  return new EdgeSelectionService(sessions, new AuditLogStore({ file: null }), now);
}

const now = () => "2026-06-22T00:00:00.000Z";

function stubProvider(payload: unknown): LlmProvider {
  return {
    name: "anthropic",
    isAvailable: () => true,
    async complete(_req: LlmRequest): Promise<LlmCompletion> {
      return { text: JSON.stringify(payload), model: "stub-model" };
    },
  };
}

function search(): WebSearch {
  const hit: WebSearchResult = {
    title: "DART 무료 공개 데이터",
    url: "https://opendart.fss.or.kr",
    snippet: "free public open data RSS 무료 티어",
  };
  return {
    name: "stub",
    async search(): Promise<WebSearchResult[]> {
      return [hit];
    },
  };
}

const PAYLOAD = {
  candidates: [
    {
      title: "공시 RSS",
      dataSource: "DART 공시 RSS 피드",
      automationPipeline: "매일 공시 RSS 크롤·정규화",
      buildDifficulty: { score: 4, assessment: "RSS 익숙" },
      defensibility: { score: 5, assessment: "유지보수 노가다 해자" },
    },
  ],
};

function deps(payload: unknown = PAYLOAD, withSearch = true): EdgeGateDeps {
  const sessions = new AuditSessionStore({ file: null });
  return {
    service: new EdgeGateService({
      providers: [stubProvider(payload)],
      scout: new ScoutClient({ search: withSearch ? search() : undefined, cache: new TtlCache({ dir: null }), now }),
      now,
    }),
    sessions,
    selection: selectionFor(sessions),
    now,
  };
}

describe("matchEdgeGatePath", () => {
  it("matches the edge-gate route and extracts the id", () => {
    expect(matchEdgeGatePath("/api/audit-session/sess-1/edge-gate")).toEqual({ sessionId: "sess-1" });
    expect(matchEdgeGatePath("/api/audit-session/sess-1/edge-gate/")).toEqual({ sessionId: "sess-1" });
    expect(matchEdgeGatePath("/api/picks/today")).toBeNull();
    expect(matchEdgeGatePath("/api/audit-session//edge-gate")).toBeNull();
  });
});

describe("handleEdgeGate", () => {
  it("400 when idea is missing", async () => {
    const res = await handleEdgeGate("sess-1", {}, deps());
    expect(res.status).toBe(400);
  });

  it("runs the gate, persists edge_metadata, and returns pre_selected recommendation", async () => {
    const d = deps();
    const res = await handleEdgeGate("sess-1", { idea: "공시 기반 추천", domain: "주식" }, d);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, any>;
    expect(body.has_edge_candidate).toBe(true);
    expect(body.recommended_edge_id).toBeTruthy();
    expect(body.pre_selected_edge.pre_selected).toBe(true);
    expect(body.candidates.some((c: any) => c.pre_selected)).toBe(true);

    // edge_metadata frozen on the session; selection NOT auto-committed (§5.4).
    const session = d.sessions.get("sess-1")!;
    expect(session.edgeMetadata?.recommendedEdgeId).toBe(body.recommended_edge_id);
    expect(session.selectedEdgeId).toBeNull();
  });

  it("returns has_edge_candidate=false (200) when no edge verifies", async () => {
    const res = await handleEdgeGate("sess-2", { idea: "공시 기반 추천" }, deps(PAYLOAD, false));
    expect(res.status).toBe(200);
    const body = res.body as Record<string, any>;
    expect(body.has_edge_candidate).toBe(false);
    expect(body.pre_selected_edge).toBeNull();
    expect(body.not_found_reason).toBeTruthy();
  });

  it("502 on infra failure (no LLM provider), not a fake 'no edge'", async () => {
    const sessions = new AuditSessionStore({ file: null });
    const d: EdgeGateDeps = {
      service: new EdgeGateService({ providers: [], scout: new ScoutClient({ cache: new TtlCache({ dir: null }), now }), now }),
      sessions,
      selection: selectionFor(sessions),
      now,
    };
    const res = await handleEdgeGate("sess-3", { idea: "x" }, d);
    expect(res.status).toBe(502);
  });
});

describe("handleEdgeSelect (§5.4 three-way branch)", () => {
  it("matchEdgeSelectPath extracts the id and rejects the bare gate path", () => {
    expect(matchEdgeSelectPath("/api/audit-session/s1/edge-gate/select")).toEqual({ sessionId: "s1" });
    expect(matchEdgeSelectPath("/api/audit-session/s1/edge-gate")).toBeNull();
  });

  it("400 on an unknown action", async () => {
    const d = deps();
    await handleEdgeGate("s1", { idea: "공시 기반 추천", domain: "주식" }, d);
    const res = await handleEdgeSelect("s1", { action: "bogus" }, d);
    expect(res.status).toBe(400);
  });

  it("custom: accepts user-typed edge, returns questions + extracted keywords", async () => {
    const d = deps();
    await handleEdgeGate("s1", { idea: "공시 기반 추천", domain: "주식" }, d);
    const res = await handleEdgeSelect("s1", { action: "custom", text: "거래소 공시 RSS → 매일 크롤" }, d);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, any>;
    expect(body.status).toBe("spec_interview");
    expect(body.selected_edge_id).toBe("edge-custom");
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.keywords).toContain("공시");
    expect(d.sessions.get("s1")?.selectedEdge?.userProvided).toBe(true);
  });

  it("custom: 400 (recoverable) when the text is invalid", async () => {
    const d = deps();
    await handleEdgeGate("s1", { idea: "공시 기반 추천", domain: "주식" }, d);
    const res = await handleEdgeSelect("s1", { action: "custom", text: "" }, d);
    expect(res.status).toBe(400);
  });

  it("skip: proceeds with no edge", async () => {
    const d = deps();
    await handleEdgeGate("s1", { idea: "공시 기반 추천", domain: "주식" }, d);
    const res = await handleEdgeSelect("s1", { action: "skip" }, d);
    expect(res.status).toBe(200);
    expect((res.body as Record<string, any>).selected_edge_id).toBeNull();
    expect(d.sessions.get("s1")?.status).toBe("spec_interview");
  });
});
