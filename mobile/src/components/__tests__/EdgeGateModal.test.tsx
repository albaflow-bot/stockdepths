import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EdgeGateModal } from "../EdgeGateModal";
import type { EdgeCandidate, EdgeGateResult } from "../../types/edge";

function verifiedDim(level: "full" | "core") {
  return {
    key: "dataExistence" as const,
    nature: "verifiable" as const,
    assessment: "무료·공개 데이터 소스 확인됨",
    verification: {
      level,
      badge: "verified" as const,
      verified: true,
      sourceUrl: "https://opendart.fss.or.kr",
      snippet: "free public open data RSS",
    },
  };
}

function recommendedCandidate(): EdgeCandidate {
  return {
    id: "edge-1",
    title: "거래소 공시 RSS 묶기",
    dataSource: "DART 공시 RSS 피드",
    automationPipeline: "매일 공시 RSS 크롤·정규화",
    verificationLevel: "full",
    prohibitionTags: [],
    recommended: true,
    recommendationReason: "무료 소스 풀검증됨",
    dimensions: [
      verifiedDim("full"),
      { key: "buildDifficulty", nature: "judgment", assessment: "RSS 익숙", score: 4 },
      { key: "defensibility", nature: "judgment", assessment: "유지보수 노가다 해자", score: 5 },
      {
        key: "dataCost",
        nature: "verifiable",
        assessment: "무료 티어 확인",
        verification: { level: "full", badge: "verified", verified: true, sourceUrl: "https://opendart.fss.or.kr", snippet: "무료 티어" },
      },
    ],
  };
}

function otherCandidate(): EdgeCandidate {
  return {
    id: "edge-2",
    title: "유료 위성 영상",
    dataSource: "유료 위성 영상 데이터셋",
    automationPipeline: "위성 이미지로 주차장 점유율 추정",
    verificationLevel: "core",
    prohibitionTags: ["PaidExclusive"],
    recommended: false,
    dimensions: [
      { ...verifiedDim("core"), verification: { level: "core", badge: "warn", verified: false } },
      { key: "buildDifficulty", nature: "judgment", assessment: "가능", score: 3 },
      { key: "defensibility", nature: "judgment", assessment: "강함", score: 5 },
      { key: "dataCost", nature: "verifiable", assessment: "비용 미검증", verification: { level: "core", badge: "unverified", verified: false } },
    ],
  };
}

function foundResult(): EdgeGateResult {
  return {
    candidates: [recommendedCandidate(), otherCandidate()],
    recommendedEdgeId: "edge-1",
    edgeFound: true,
    researchedAt: "2026-06-22T00:00:00.000Z",
  };
}

function notFoundResult(): EdgeGateResult {
  return {
    candidates: [otherCandidate()],
    recommendedEdgeId: null,
    edgeFound: false,
    researchedAt: "2026-06-22T00:00:00.000Z",
    notFoundReason: "무료·공개 데이터 소스를 검증하지 못했습니다.",
  };
}

const noop = () => {};

describe("EdgeGateModal", () => {
  it("renders nothing when not visible", () => {
    render(<EdgeGateModal visible={false} result={foundResult()} onAccept={noop} onOverride={noop} onSkip={noop} />);
    expect(screen.queryByTestId("edge-gate-modal")).toBeNull();
  });

  it("renders 2 candidate cards and stars the pre-selected recommendation", () => {
    render(<EdgeGateModal visible result={foundResult()} onAccept={noop} onOverride={noop} onSkip={noop} />);
    expect(screen.getByTestId("edge-candidate-edge-1")).toBeInTheDocument();
    expect(screen.getByTestId("edge-candidate-edge-2")).toBeInTheDocument();
    expect(screen.getByText(/⭐ 거래소 공시 RSS 묶기/)).toBeInTheDocument();
    expect(screen.getByText("추천 (pre-selected)")).toBeInTheDocument();
  });

  it("shows ✓검증됨 for the full-verified recommendation and ❌드롭됨 for the paid candidate", () => {
    render(<EdgeGateModal visible result={foundResult()} onAccept={noop} onOverride={noop} onSkip={noop} />);
    expect(screen.getByTestId("edge-candidate-badge-edge-1")).toHaveTextContent("✓검증됨");
    expect(screen.getByTestId("edge-candidate-badge-edge-2")).toHaveTextContent("❌드롭됨");
    expect(screen.getByTestId("edge-candidate-drop-edge-2")).toHaveTextContent("유료·독점 데이터");
  });

  it("expands the recommendation's evaluation table by default with the 4 dimensions", () => {
    render(<EdgeGateModal visible result={foundResult()} onAccept={noop} onOverride={noop} onSkip={noop} />);
    const table = screen.getByTestId("edge-eval-table-edge-1");
    expect(table).toBeInTheDocument();
    expect(screen.getAllByText("데이터 존재·무료·접근성").length).toBeGreaterThan(0);
    expect(screen.getByText("구축 난이도")).toBeInTheDocument();
    expect(screen.getByText("방어성")).toBeInTheDocument();
    // judgment dim shows a score, not a badge
    expect(screen.getByText("4/5")).toBeInTheDocument();
  });

  it("opens the source link in an external window via the injected opener", () => {
    const onOpenLink = vi.fn();
    render(<EdgeGateModal visible result={foundResult()} onAccept={noop} onOverride={noop} onSkip={noop} onOpenLink={onOpenLink} />);
    fireEvent.click(screen.getByTestId("edge-source-link-edge-1-dataExistence"));
    expect(onOpenLink).toHaveBeenCalledWith("https://opendart.fss.or.kr");
  });

  it("Accept commits the recommended edge id", () => {
    const onAccept = vi.fn();
    render(<EdgeGateModal visible result={foundResult()} onAccept={onAccept} onOverride={noop} onSkip={noop} />);
    fireEvent.click(screen.getByTestId("edge-gate-accept"));
    expect(onAccept).toHaveBeenCalledWith("edge-1");
  });

  it("Override is disabled until a different candidate is selected, then commits it", () => {
    const onOverride = vi.fn();
    render(<EdgeGateModal visible result={foundResult()} onAccept={noop} onOverride={onOverride} onSkip={noop} />);
    // Initially the recommendation is selected → override disabled, click is a no-op.
    fireEvent.click(screen.getByTestId("edge-gate-override"));
    expect(onOverride).not.toHaveBeenCalled();

    // Select the other candidate, then override commits it (informed override §5.4).
    fireEvent.click(screen.getByTestId("edge-candidate-select-edge-2"));
    fireEvent.click(screen.getByTestId("edge-gate-override"));
    expect(onOverride).toHaveBeenCalledWith("edge-2");
  });

  it("Skip calls onSkip (엣지 미감)", () => {
    const onSkip = vi.fn();
    render(<EdgeGateModal visible result={foundResult()} onAccept={noop} onOverride={noop} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId("edge-gate-skip"));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("when no edge is found: shows the not-found notice and disables Accept", () => {
    const onAccept = vi.fn();
    render(<EdgeGateModal visible result={notFoundResult()} onAccept={onAccept} onOverride={noop} onSkip={noop} />);
    expect(screen.getByTestId("edge-gate-not-found")).toHaveTextContent("검증하지 못했습니다");
    // Accept disabled → clicking does nothing.
    fireEvent.click(screen.getByTestId("edge-gate-accept"));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("blocks ESC from dismissing the modal (강제진행)", () => {
    const onSkip = vi.fn();
    render(<EdgeGateModal visible result={foundResult()} onAccept={noop} onOverride={noop} onSkip={onSkip} />);
    fireEvent.keyDown(document, { key: "Escape" });
    // Still mounted, and no action fired by ESC.
    expect(screen.getByTestId("edge-gate-modal")).toBeInTheDocument();
    expect(onSkip).not.toHaveBeenCalled();
  });
});
