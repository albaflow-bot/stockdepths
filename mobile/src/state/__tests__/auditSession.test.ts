import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  auditReducer,
  initialAuditState,
  useAuditFlow,
  type AuditFlowClient,
  type AuditFlowState,
} from "../auditSession";
import type { EdgeGateResult, SpecInterviewResponse } from "../../types/edge";

const gate = (edgeFound: boolean): EdgeGateResult => ({
  candidates: [],
  recommendedEdgeId: edgeFound ? "edge-1" : null,
  edgeFound,
  researchedAt: "t",
});

const interview = (status: SpecInterviewResponse["status"]): SpecInterviewResponse => ({
  sessionId: "s1",
  status,
  selectedEdgeId: status === "spec_interview" ? "edge-1" : null,
  questions: [{ id: "edge-usage", prompt: "?", edgeAware: true }],
  embeddedSpec: status === "spec_finalized" ? "### 5.6" : null,
  keywords: [],
});

describe("auditReducer (pure)", () => {
  const base = initialAuditState("s1");

  it("enterEdgeGate advances only from phase77 (idempotent)", () => {
    expect(auditReducer(base, { type: "enterEdgeGate" }).phase).toBe("edge_gate");
    const inGate: AuditFlowState = { ...base, phase: "edge_gate" };
    expect(auditReducer(inGate, { type: "enterEdgeGate" })).toBe(inGate); // no-op
  });

  it("gate load lifecycle sets busy then stores the gate", () => {
    let s = auditReducer({ ...base, phase: "edge_gate" }, { type: "gatePending" });
    expect(s.busy).toBe(true);
    s = auditReducer(s, { type: "gateLoaded", gate: gate(true) });
    expect(s.busy).toBe(false);
    expect(s.gate?.edgeFound).toBe(true);
  });

  it("selectPending optimistically jumps to spec_interview and records rollback", () => {
    const inGate: AuditFlowState = { ...base, phase: "edge_gate", gate: gate(true) };
    const s = auditReducer(inGate, { type: "selectPending" });
    expect(s.phase).toBe("spec_interview"); // optimistic
    expect(s.rollbackPhase).toBe("edge_gate");
    expect(s.busy).toBe(true);
  });

  it("selectDone commits the interview and adopts its status", () => {
    const optimistic: AuditFlowState = { ...base, phase: "spec_interview", rollbackPhase: "edge_gate", busy: true };
    const s = auditReducer(optimistic, { type: "selectDone", interview: interview("spec_interview") });
    expect(s.phase).toBe("spec_interview");
    expect(s.interview?.questions).toHaveLength(1);
    expect(s.rollbackPhase).toBeNull();
  });

  it("opFailed rolls the phase back to the optimistic rollbackPhase (error recovery)", () => {
    const optimistic: AuditFlowState = { ...base, phase: "spec_interview", rollbackPhase: "edge_gate", busy: true };
    const s = auditReducer(optimistic, { type: "opFailed", error: "boom" });
    expect(s.phase).toBe("edge_gate"); // rolled back
    expect(s.error).toBe("boom");
    expect(s.rollbackPhase).toBeNull();
  });

  it("opFailed without a rollbackPhase keeps the current phase (gate-load failure)", () => {
    const loading: AuditFlowState = { ...base, phase: "edge_gate", busy: true };
    const s = auditReducer(loading, { type: "opFailed", error: "net" });
    expect(s.phase).toBe("edge_gate");
    expect(s.error).toBe("net");
  });
});

function stubClient(over: Partial<AuditFlowClient> = {}): AuditFlowClient {
  return {
    runEdgeGate: vi.fn(async () => gate(true)),
    submitEdgeSelection: vi.fn(async () => interview("spec_interview")),
    submitCustomEdge: vi.fn(async () => interview("spec_interview")),
    ...over,
  };
}

describe("useAuditFlow", () => {
  const opts = { sessionId: "s1", idea: "공시 기반 추천", domain: "주식" };

  it("completePhase77 enters edge_gate and loads the gate", async () => {
    const client = stubClient();
    const { result } = renderHook(() => useAuditFlow({ ...opts, client }));
    await act(async () => {
      await result.current.completePhase77();
    });
    expect(result.current.state.phase).toBe("edge_gate");
    expect(result.current.state.gate?.edgeFound).toBe(true);
    expect(client.runEdgeGate).toHaveBeenCalledWith("s1", "공시 기반 추천", "주식");
  });

  it("accept optimistically advances to spec_interview and commits the interview", async () => {
    const client = stubClient();
    const { result } = renderHook(() => useAuditFlow({ ...opts, phase: "edge_gate", client }));
    await act(async () => {
      await result.current.accept("edge-1");
    });
    expect(result.current.state.phase).toBe("spec_interview");
    expect(result.current.state.interview?.selectedEdgeId).toBe("edge-1");
    expect(client.submitEdgeSelection).toHaveBeenCalledWith("s1", "accept", "edge-1");
  });

  it("rolls back to edge_gate and surfaces the error when a selection fails", async () => {
    const client = stubClient({
      submitEdgeSelection: vi.fn(async () => {
        throw new Error("서버 오류");
      }),
    });
    const { result } = renderHook(() => useAuditFlow({ ...opts, phase: "edge_gate", client }));
    await act(async () => {
      await result.current.skip();
    });
    await waitFor(() => expect(result.current.state.phase).toBe("edge_gate"));
    expect(result.current.state.error).toBe("서버 오류");
  });

  it("submitCustom posts the typed edge", async () => {
    const client = stubClient();
    const { result } = renderHook(() => useAuditFlow({ ...opts, phase: "edge_gate", client }));
    await act(async () => {
      await result.current.submitCustom("거래소 공시 RSS");
    });
    expect(client.submitCustomEdge).toHaveBeenCalledWith("s1", "거래소 공시 RSS");
    expect(result.current.state.phase).toBe("spec_interview");
  });
});
