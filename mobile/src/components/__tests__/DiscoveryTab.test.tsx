import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DiscoveryTab } from "../DiscoveryTab";
import type { DiscoveryArtifact, DiscoveryItem } from "../../types/discovery";
import type { DailyPicksArtifact } from "../../types/picks";

function picksArtifact(market: "US" | "KR"): DailyPicksArtifact {
  return {
    market,
    date: "2026-06-24",
    generatedAt: "2026-06-24T21:00:00Z",
    picks: [
      {
        symbol: market === "US" ? "NVDA" : "005930",
        companyName: market === "US" ? "NVIDIA" : "삼성전자",
        rationale: "데이터센터 수요 강세",
        confidence: "high",
        risk: "medium",
        action: "분할 매수 검토",
      },
    ],
    marketContext: "지수 강보합",
    provider: "anthropic",
    model: "claude",
    disclaimer: "참고용",
    universe: [],
  };
}

function item(over: Partial<DiscoveryItem> & Pick<DiscoveryItem, "category" | "code">): DiscoveryItem {
  return {
    market: "NASDAQ",
    name_ko: null,
    name_en: over.code,
    last: 120,
    change_pct: 8.2,
    direction: "up",
    rvol: 4.1,
    rsi14: 60,
    weekly: [110, 112, 115, 117, 118, 119, 120],
    signal: { label: "매수 적정", reason: "거래 폭증" },
    isLargeCap: false,
    unusual: false,
    ...over,
  };
}

function artifact(market: "US" | "KR"): DiscoveryArtifact {
  return {
    market,
    asof: "2026-06-24",
    generatedAt: "2026-06-24T21:00:00Z",
    provider: "deterministic",
    categories: {
      gainers: [item({ category: "gainers", code: market === "US" ? "MOVR" : "005930" })],
      unusual_value: [
        item({ category: "unusual_value", code: "MEGA", isLargeCap: true, unusual: true, name_en: "MegaCap" }),
      ],
      // 나머지 카테고리는 빈 배열(섹션은 그래도 렌더 + "없음" 표시).
      losers: [],
    },
    stats: { scanned: 100, afterNoiseFilter: 80, largeCapsExcluded: 50, candidates: 12 },
  };
}

describe("DiscoveryTab (6 카테고리 섹션)", () => {
  it("로드 후 6 카테고리 섹션을 모두 렌더한다", async () => {
    render(<DiscoveryTab loader={async () => artifact("US")} onAddWatch={() => {}} onAddHolding={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("discovery-tab-sections")).toBeInTheDocument());
    for (const cat of ["gainers", "volume_surge", "breakout", "unusual_value", "oversold_bounce", "losers"]) {
      expect(screen.getByTestId(`discovery-section-${cat}`)).toBeInTheDocument();
    }
  });

  it("모멘텀 카테고리는 '상위 N 제외' 대형주 배제를 UI 에 명시", async () => {
    render(<DiscoveryTab loader={async () => artifact("US")} onAddWatch={() => {}} onAddHolding={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("discovery-section-gainers")).toBeInTheDocument());
    expect(screen.getByTestId("discovery-section-gainers-largecap-note").textContent).toMatch(/상위 50 종목 제외/);
    // 대금집중은 초대형주 이례신호 규칙을 표기.
    expect(screen.getByTestId("discovery-section-unusual_value-largecap-note").textContent).toMatch(/이례신호/);
  });

  it("이례신호 있는 초대형주에 배지 표시", async () => {
    render(<DiscoveryTab loader={async () => artifact("US")} onAddWatch={() => {}} onAddHolding={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("discovery-card-unusual_value-MEGA")).toBeInTheDocument());
    expect(screen.getByText(/이례신호 초대형주/)).toBeInTheDocument();
  });

  it("빈 카테고리는 '해당 종목이 없습니다' 표시", async () => {
    render(<DiscoveryTab loader={async () => artifact("US")} onAddWatch={() => {}} onAddHolding={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("discovery-section-losers")).toBeInTheDocument());
    const losers = screen.getByTestId("discovery-section-losers");
    expect(losers.textContent).toMatch(/해당 종목이 없습니다/);
  });

  it("시장 토글 → 다른 시장 재조회", async () => {
    const loader = vi.fn(async (m: "US" | "KR") => artifact(m));
    render(<DiscoveryTab loader={loader} onAddWatch={() => {}} onAddHolding={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("discovery-tab-sections")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("discovery-tab-market-KR"));
    await waitFor(() => expect(loader).toHaveBeenCalledWith("KR"));
    expect(screen.getByTestId("discovery-card-gainers-005930")).toBeInTheDocument();
  });

  it("＋관심 클릭 → 콜백에 해당 종목 전달", async () => {
    const onAddWatch = vi.fn();
    render(<DiscoveryTab loader={async () => artifact("US")} onAddWatch={onAddWatch} onAddHolding={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("discovery-card-gainers-MOVR")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("discovery-card-gainers-MOVR-watch"));
    expect(onAddWatch).toHaveBeenCalledWith(expect.objectContaining({ code: "MOVR" }));
  });

  it("미생성/오류 → 메시지 + 다시 시도", async () => {
    render(
      <DiscoveryTab
        loader={async () => {
          throw new Error("오늘의 발굴 결과가 아직 준비되지 않았습니다.");
        }}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("discovery-tab-error")).toBeInTheDocument());
    expect(screen.getByTestId("discovery-tab-retry")).toBeInTheDocument();
  });
});

describe("DiscoveryTab — 오늘의 추천(LLM 픽) 섹션", () => {
  it("onAddPickWatch 주입 시 픽 섹션을 카테고리 위에 렌더한다", async () => {
    render(
      <DiscoveryTab
        loader={async () => artifact("US")}
        picksLoader={async () => picksArtifact("US")}
        onAddPickWatch={() => {}}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("discovery-tab-picks-list")).toBeInTheDocument());
    expect(screen.getByTestId("discovery-tab-picks-card-NVDA")).toBeInTheDocument();
    // 디스클레이머 1줄 고정.
    expect(screen.getByTestId("discovery-tab-picks-disclaimer").textContent).toMatch(/투자 책임은 본인/);
  });

  it("onAddPickWatch 미주입 시 픽 섹션을 렌더하지 않는다", async () => {
    render(<DiscoveryTab loader={async () => artifact("US")} onAddWatch={() => {}} onAddHolding={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("discovery-tab-sections")).toBeInTheDocument());
    expect(screen.queryByTestId("discovery-tab-picks")).not.toBeInTheDocument();
  });

  it("＋관심 클릭 → symbol 을 콜백에 전달", async () => {
    const onAddPickWatch = vi.fn();
    render(
      <DiscoveryTab
        loader={async () => artifact("US")}
        picksLoader={async () => picksArtifact("US")}
        onAddPickWatch={onAddPickWatch}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("discovery-tab-picks-card-NVDA")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("discovery-tab-picks-card-NVDA-watch"));
    expect(onAddPickWatch).toHaveBeenCalledWith("NVDA");
  });

  it("이미 담긴 종목은 '관심 담김 ✓' 표기", async () => {
    render(
      <DiscoveryTab
        loader={async () => artifact("US")}
        picksLoader={async () => picksArtifact("US")}
        onAddPickWatch={() => {}}
        watchedCodes={new Set(["NVDA"])}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("discovery-tab-picks-card-NVDA-watch")).toBeInTheDocument());
    expect(screen.getByTestId("discovery-tab-picks-card-NVDA-watch").textContent).toMatch(/관심 담김/);
  });

  it("시장 토글 → 픽도 해당 시장으로 재조회", async () => {
    const picksLoader = vi.fn(async (m: "US" | "KR") => picksArtifact(m));
    render(
      <DiscoveryTab
        loader={async (m) => artifact(m)}
        picksLoader={picksLoader}
        onAddPickWatch={() => {}}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("discovery-tab-picks-card-NVDA")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("discovery-tab-market-KR"));
    await waitFor(() => expect(picksLoader).toHaveBeenCalledWith("KR"));
    expect(screen.getByTestId("discovery-tab-picks-card-005930")).toBeInTheDocument();
  });

  it("픽 로드 실패해도 카테고리 섹션은 그대로 보인다", async () => {
    render(
      <DiscoveryTab
        loader={async () => artifact("US")}
        picksLoader={async () => {
          throw new Error("추천을 불러오지 못했습니다.");
        }}
        onAddPickWatch={() => {}}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("discovery-tab-picks-error")).toBeInTheDocument());
    // 픽은 조용히 실패하되, 카테고리 섹션은 정상 렌더.
    expect(screen.getByTestId("discovery-section-gainers")).toBeInTheDocument();
  });
});
