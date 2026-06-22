import { test, expect } from "@playwright/test";

/**
 * CUF (크리티컬 유저 플로우) #1 — 홈 진입 → 참고-조언 디스클레이머 확인 →
 * 추천 카드 표시 → '5년 백테스트 결과' 펼쳐 초과수익 확인.
 *
 * 외부 의존성(추천 API)은 route 가로채기로 고정 응답을 주입해 결정론적으로 검증합니다
 * (E2E 하네스 계약). role+name / text 시맨틱 셀렉터만 사용합니다.
 */

const ARTIFACT = {
  market: "US",
  date: "2026-06-21",
  generatedAt: "2026-06-21T00:05:00.000Z",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  disclaimer: "AI는 보장이 아닌 참고 조언입니다. 투자 판단과 책임은 본인에게 있습니다.",
  marketContext: "기술주 중심으로 반등 흐름이 이어지고 있습니다.",
  universe: ["NVDA", "MSFT"],
  picks: [
    {
      symbol: "NVDA",
      companyName: "NVIDIA",
      rationale: "5년 추세가 견조하고 최근 모멘텀이 강합니다.",
      confidence: "high",
      risk: "high",
      backtest: {
        symbol: "NVDA",
        strategy: "trend-momentum(sma50/200)",
        from: "2021-06-21",
        to: "2026-06-18",
        dataPoints: 1255,
        trades: 18,
        winRatePct: 38.89,
        avgTradeReturnPct: 6.2,
        cumulativeReturnPct: 142.3,
        benchmarkSymbol: "SPY",
        benchmarkReturnPct: 89.8,
        excessReturnPct: 52.5,
        maxDrawdownPct: -31.4,
      },
    },
  ],
};

test("홈 진입 → 디스클레이머 확인 → 백테스트 펼치기", async ({ page }) => {
  await test.step("추천 API를 고정 응답으로 가로챈다", async () => {
    await page.route("**/api/picks/today*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ARTIFACT),
      });
    });
  });

  await test.step("성향 게이트를 통과하도록 로컬에 성향을 심는다", async () => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "bindesk:persona",
        JSON.stringify({ mode: "preset", profile: "neutral", targetReturnPct: 20, stopLossPct: 10, setAt: "t" }),
      );
    });
  });

  await test.step("홈 화면에 진입한다", async () => {
    await page.goto("/");
    await expect(page.getByText("오늘의 추천")).toBeVisible();
  });

  await test.step("참고 조언 디스클레이머가 예측 위에 보인다", async () => {
    await expect(page.getByText("AI는 보장이 아닌 참고 조언입니다.")).toBeVisible();
  });

  await test.step("추천 종목 카드가 보인다", async () => {
    await expect(page.getByText("NVDA")).toBeVisible();
    await expect(page.getByText("신뢰도 높음")).toBeVisible();
    await expect(page.getByText("리스크 높음")).toBeVisible();
  });

  await test.step("'5년 백테스트 결과'를 펼치면 초과수익이 표시된다", async () => {
    await page.getByRole("button", { name: /5년 백테스트 결과/ }).first().click();
    await expect(page.getByText("벤치마크 대비 초과수익")).toBeVisible();
    await expect(page.getByText("+52.5%")).toBeVisible();
  });
});
