import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuditFlow } from "../AuditFlow";
import type { AuditFlowController, AuditFlowState } from "../../state/auditSession";
import type { EdgeGateResult, SpecInterviewResponse } from "../../types/edge";

const baseState = (over: Partial<AuditFlowState>): AuditFlowState => ({
  sessionId: "s1",
  phase: "phase77",
  busy: false,
  error: null,
  gate: null,
  interview: null,
  rollbackPhase: null,
  ...over,
});

function controllerFor(state: AuditFlowState, fns: Partial<AuditFlowController> = {}): AuditFlowController {
  return {
    state,
    completePhase77: vi.fn(async () => {}),
    loadGate: vi.fn(async () => {}),
    accept: vi.fn(async () => {}),
    override: vi.fn(async () => {}),
    skip: vi.fn(async () => {}),
    submitCustom: vi.fn(async () => {}),
    ...fns,
  };
}

const gateFound: EdgeGateResult = {
  candidates: [
    {
      id: "edge-1",
      title: "공시 RSS",
      dataSource: "DART 공시 RSS",
      automationPipeline: "매일 크롤",
      dimensions: [],
      verificationLevel: "full",
      prohibitionTags: [],
      recommended: true,
    },
  ],
  recommendedEdgeId: "edge-1",
  edgeFound: true,
  researchedAt: "t",
};

const gateNotFound: EdgeGateResult = {
  candidates: [],
  recommendedEdgeId: null,
  edgeFound: false,
  researchedAt: "t",
  notFoundReason: "검증 실패",
};

const props = { sessionId: "s1", idea: "공시 기반 추천", domain: "주식" };

describe("AuditFlow", () => {
  it("phase77: shows the forced-question step and triggers completePhase77", () => {
    const ctrl = controllerFor(baseState({ phase: "phase77" }));
    render(<AuditFlow {...props} controller={ctrl} />);
    expect(screen.getByTestId("phase77-step")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("phase77-complete"));
    expect(ctrl.completePhase77).toHaveBeenCalledOnce();
  });

  it("edge_gate: renders the EdgeGateModal when an edge was found", () => {
    const ctrl = controllerFor(baseState({ phase: "edge_gate", gate: gateFound }));
    render(<AuditFlow {...props} controller={ctrl} />);
    expect(screen.getByTestId("edge-gate-modal")).toBeInTheDocument();
  });

  it("edge_gate: renders the fallback when no edge was found", () => {
    const ctrl = controllerFor(baseState({ phase: "edge_gate", gate: gateNotFound }));
    render(<AuditFlow {...props} controller={ctrl} />);
    expect(screen.getByTestId("edge-gate-fallback")).toBeInTheDocument();
  });

  it("edge_gate: shows the retryable error view when the gate failed to load", () => {
    const ctrl = controllerFor(baseState({ phase: "edge_gate", error: "네트워크" }));
    render(<AuditFlow {...props} controller={ctrl} />);
    expect(screen.getByTestId("state-error")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("retry-button"));
    expect(ctrl.loadGate).toHaveBeenCalledOnce();
  });

  it("spec_interview: lists the edge-aware questions once the interview is loaded", () => {
    const iv: SpecInterviewResponse = {
      sessionId: "s1",
      status: "spec_interview",
      selectedEdgeId: "edge-1",
      questions: [{ id: "edge-usage", prompt: "이 데이터를 어떻게 활용?", edgeAware: true }],
      embeddedSpec: null,
      keywords: [],
    };
    const ctrl = controllerFor(baseState({ phase: "spec_interview", gate: gateFound, interview: iv }));
    render(<AuditFlow {...props} controller={ctrl} />);
    expect(screen.getByTestId("spec-interview-step")).toBeInTheDocument();
    expect(screen.getByTestId("spec-question-edge-usage")).toHaveTextContent("이 데이터를 어떻게 활용?");
  });

  it("spec_interview (optimistic, interview not yet loaded): shows a loading view", () => {
    const ctrl = controllerFor(baseState({ phase: "spec_interview", busy: true, gate: gateFound, interview: null }));
    render(<AuditFlow {...props} controller={ctrl} />);
    expect(screen.getByTestId("state-loading")).toBeInTheDocument();
  });

  it("shows the error banner when a select failed but the gate is still present", () => {
    const ctrl = controllerFor(baseState({ phase: "edge_gate", gate: gateFound, error: "서버 오류" }));
    render(<AuditFlow {...props} controller={ctrl} />);
    expect(screen.getByTestId("audit-error-banner")).toHaveTextContent("서버 오류");
  });
});
