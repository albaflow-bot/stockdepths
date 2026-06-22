import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TodaysPicksScreen } from "../TodaysPicksScreen";
import { SAMPLE_ARTIFACT } from "../../data/sampleArtifact";
import type { DailyPicksArtifact } from "../../types/picks";
import type { PersonaConfig } from "../../persona/types";

describe("TodaysPicksScreen", () => {
  it("always shows the disclaimer above predictions and renders the picks when ready", async () => {
    render(<TodaysPicksScreen loader={async () => SAMPLE_ARTIFACT} />);
    // Disclaimer is present immediately (above predictions).
    expect(screen.getByTestId("disclaimer-banner")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("오늘의 시장")).toBeInTheDocument());
    // 3 picks rendered as cards.
    expect(screen.getByTestId("pick-card-NVDA")).toBeInTheDocument();
    expect(screen.getByTestId("pick-card-MSFT")).toBeInTheDocument();
    expect(screen.getByTestId("pick-card-AAPL")).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_ARTIFACT.marketContext)).toBeInTheDocument();
  });

  it("shows a friendly error state with retry when the loader fails", async () => {
    let attempts = 0;
    const loader = async (): Promise<DailyPicksArtifact> => {
      attempts++;
      if (attempts === 1) throw new Error("추천 서버가 아직 연결되지 않았습니다.");
      return SAMPLE_ARTIFACT;
    };
    render(<TodaysPicksScreen loader={loader} />);

    await waitFor(() => expect(screen.getByTestId("state-error")).toBeInTheDocument());
    expect(screen.getByText("추천 서버가 아직 연결되지 않았습니다.")).toBeInTheDocument();
    // The disclaimer is still shown even in the error state.
    expect(screen.getByTestId("disclaimer-banner")).toBeInTheDocument();

    // Retry recovers to the ready state.
    fireEvent.click(screen.getByTestId("retry-button"));
    await waitFor(() => expect(screen.getByTestId("pick-card-NVDA")).toBeInTheDocument());
  });

  it("shows the empty state when there are no picks", async () => {
    render(<TodaysPicksScreen loader={async () => ({ ...SAMPLE_ARTIFACT, picks: [] })} />);
    await waitFor(() => expect(screen.getByTestId("state-empty")).toBeInTheDocument());
    expect(screen.getByTestId("disclaimer-banner")).toBeInTheDocument();
  });

  it("tags picks by persona volatility match when a persona is provided", async () => {
    // Conservative persona accepts only low-risk picks.
    const conservative: PersonaConfig = {
      mode: "preset",
      profile: "conservative",
      targetReturnPct: 10,
      stopLossPct: 5,
      setAt: "t",
    };
    render(<TodaysPicksScreen loader={async () => SAMPLE_ARTIFACT} personaConfig={conservative} />);
    await waitFor(() => expect(screen.getByTestId("pick-card-MSFT")).toBeInTheDocument());
    // MSFT is low risk → 적합; NVDA is high risk → 주의.
    expect(screen.getByTestId("persona-match-MSFT")).toHaveTextContent("성향 적합");
    expect(screen.getByTestId("persona-match-NVDA")).toHaveTextContent("성향 주의");
  });
});
