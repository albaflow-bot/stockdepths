import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EdgeGateFallback } from "../EdgeGateFallback";
import type { EdgeCandidate, EdgeGateResult } from "../../types/edge";

function droppedCandidate(): EdgeCandidate {
  return {
    id: "edge-2",
    title: "유료 위성 영상",
    dataSource: "유료 위성 영상 데이터셋",
    automationPipeline: "위성 이미지로 점유율 추정",
    verificationLevel: "core",
    prohibitionTags: ["PaidExclusive"],
    recommended: false,
    dimensions: [],
  };
}

function notFound(withCandidates: boolean): EdgeGateResult {
  return {
    candidates: withCandidates ? [droppedCandidate()] : [],
    recommendedEdgeId: null,
    edgeFound: false,
    researchedAt: "2026-06-22T00:00:00.000Z",
    notFoundReason: "무료·공개 데이터 소스를 검증하지 못했습니다.",
  };
}

const noop = () => {};

describe("EdgeGateFallback", () => {
  it("renders nothing when not visible", () => {
    render(<EdgeGateFallback visible={false} result={notFound(true)} onSelectCandidate={noop} onSubmitCustom={noop} onSkip={noop} />);
    expect(screen.queryByTestId("edge-gate-fallback")).toBeNull();
  });

  it("shows the not-found reason and all three options when candidates exist", () => {
    render(<EdgeGateFallback visible result={notFound(true)} onSelectCandidate={noop} onSubmitCustom={noop} onSkip={noop} />);
    expect(screen.getByTestId("edge-gate-fallback")).toBeInTheDocument();
    expect(screen.getByText(/검증하지 못했습니다/)).toBeInTheDocument();
    expect(screen.getByTestId("fallback-option-candidate")).toBeInTheDocument();
    expect(screen.getByTestId("fallback-option-custom")).toBeInTheDocument();
    expect(screen.getByTestId("fallback-option-skip")).toBeInTheDocument();
  });

  it("hides the candidate option when there are zero candidates", () => {
    render(<EdgeGateFallback visible result={notFound(false)} onSelectCandidate={noop} onSubmitCustom={noop} onSkip={noop} />);
    expect(screen.queryByTestId("fallback-option-candidate")).toBeNull();
    expect(screen.getByTestId("fallback-option-custom")).toBeInTheDocument();
  });

  it("option 1: selecting a candidate then confirming calls onSelectCandidate", () => {
    const onSelectCandidate = vi.fn();
    render(<EdgeGateFallback visible result={notFound(true)} onSelectCandidate={onSelectCandidate} onSubmitCustom={noop} onSkip={noop} />);
    fireEvent.click(screen.getByText("① 제공된 후보에서 선택"));
    fireEvent.click(screen.getByTestId("fallback-candidate-edge-2"));
    fireEvent.click(screen.getByTestId("fallback-candidate-confirm"));
    expect(onSelectCandidate).toHaveBeenCalledWith("edge-2");
  });

  it("option 2: custom submit is disabled until min length, then sends trimmed text", () => {
    const onSubmitCustom = vi.fn();
    render(<EdgeGateFallback visible result={notFound(false)} onSelectCandidate={noop} onSubmitCustom={onSubmitCustom} onSkip={noop} />);
    fireEvent.click(screen.getByText("② 직접 엣지 입력"));

    // too short → submit disabled (no-op on click)
    fireEvent.change(screen.getByTestId("fallback-custom-input"), { target: { value: "a" } });
    fireEvent.click(screen.getByTestId("fallback-custom-submit"));
    expect(onSubmitCustom).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("fallback-custom-input"), { target: { value: "  거래소 공시 RSS  " } });
    fireEvent.click(screen.getByTestId("fallback-custom-submit"));
    expect(onSubmitCustom).toHaveBeenCalledWith("거래소 공시 RSS");
  });

  it("option 3: skip calls onSkip", () => {
    const onSkip = vi.fn();
    render(<EdgeGateFallback visible result={notFound(true)} onSelectCandidate={noop} onSubmitCustom={noop} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("③ 엣지 스킵 진행"));
    fireEvent.click(screen.getByTestId("fallback-skip-confirm"));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("disables all actions while busy", () => {
    const onSkip = vi.fn();
    render(<EdgeGateFallback visible busy result={notFound(true)} onSelectCandidate={noop} onSubmitCustom={noop} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("③ 엣지 스킵 진행"));
    fireEvent.click(screen.getByTestId("fallback-skip-confirm"));
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("blocks ESC (강제진행)", () => {
    render(<EdgeGateFallback visible result={notFound(true)} onSelectCandidate={noop} onSubmitCustom={noop} onSkip={noop} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("edge-gate-fallback")).toBeInTheDocument();
  });
});
