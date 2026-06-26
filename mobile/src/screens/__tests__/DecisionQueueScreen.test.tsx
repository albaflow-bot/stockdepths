import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DecisionQueueScreen } from "../DecisionQueueScreen";
import { DecisionRepository } from "../../decisions/repository";
import { createMemoryStorage } from "../../data/storage";

function makeRepo() {
  return new DecisionRepository({ storage: createMemoryStorage() });
}

describe("DecisionQueueScreen", () => {
  it("surfaces the three delta decisions as actionable cards", async () => {
    render(<DecisionQueueScreen repository={makeRepo()} />);
    await waitFor(() => expect(screen.getByTestId("decision-DQ-1")).toBeInTheDocument());
    expect(screen.getByText("KR 무료·합법 시장 데이터 경로 실증")).toBeInTheDocument();
    expect(screen.getByText("실시간(틱) 시세 스트리밍 분리")).toBeInTheDocument();
    expect(screen.getByText("뉴스 RSS 화이트리스트 확정 목록")).toBeInTheDocument();
  });

  it("offers three separated actions (승인/보류/거부) per item", async () => {
    render(<DecisionQueueScreen repository={makeRepo()} />);
    await waitFor(() => expect(screen.getByTestId("decision-DQ-1")).toBeInTheDocument());
    expect(screen.getByTestId("decision-DQ-1-action-approved")).toBeInTheDocument();
    expect(screen.getByTestId("decision-DQ-1-action-deferred")).toBeInTheDocument();
    expect(screen.getByTestId("decision-DQ-1-action-rejected")).toBeInTheDocument();
  });

  it("records a decision and reflects it in the status badge", async () => {
    render(<DecisionQueueScreen repository={makeRepo()} />);
    // 시드 전부 일괄 승인 → 미결정 0건.
    await waitFor(() => expect(screen.getByTestId("decision-open-count")).toHaveTextContent("결정 대기 0건"));

    fireEvent.click(screen.getByTestId("decision-DQ-1-action-deferred"));
    await waitFor(() => expect(screen.getByTestId("decision-DQ-1-status")).toHaveTextContent("보류됨"));
  });

  it("seeds all delta decisions as 승인됨 (일괄 승인)", async () => {
    render(<DecisionQueueScreen repository={makeRepo()} />);
    await waitFor(() => expect(screen.getByTestId("decision-DQ-2-status")).toHaveTextContent("승인됨"));
  });
});
