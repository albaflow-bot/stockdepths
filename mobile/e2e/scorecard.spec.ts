import { test, expect } from "@playwright/test";

/**
 * CUF #4 — 성적표 탭 진입 → 벤치마크 대비 초과수익 헤드라인 확인 → 기간 필터(3M) 전환.
 * 성적표 API는 route 가로채기로 고정 응답을 주입해 결정론적으로 검증합니다.
 */

const SCORECARD = {
  asOf: "2026-06-21",
  benchmarkSymbol: "SPY",
  totalRecommendations: 12,
  periods: [
    {
      period: "1M",
      periodStart: "2026-05-21",
      asOf: "2026-06-21",
      recommendations: 6,
      evaluated: 6,
      winRatePct: 66.67,
      avgTradeReturnPct: 3.8,
      cumulativeReturnPct: 4.1,
      benchmarkReturnPct: 2.5,
      excessReturnPct: 1.6,
      maxDrawdownPct: -5.2,
      best: { symbol: "NVDA", date: "2026-05-28", returnPct: 12.4 },
      worst: { symbol: "TSLA", date: "2026-05-23", returnPct: -6.1 },
      backtest: { excessReturnPct: 3.2, winRatePct: 41, avgTradeReturnPct: 5.4, maxDrawdownPct: -22, sampleSize: 6 },
    },
    {
      period: "3M",
      periodStart: "2026-03-21",
      asOf: "2026-06-21",
      recommendations: 12,
      evaluated: 11,
      winRatePct: 54.5,
      avgTradeReturnPct: 2.2,
      cumulativeReturnPct: 8.9,
      benchmarkReturnPct: 11.4,
      excessReturnPct: -2.5,
      maxDrawdownPct: -9.7,
      backtest: { excessReturnPct: 6.1, winRatePct: 44, avgTradeReturnPct: 4.9, maxDrawdownPct: -28.5, sampleSize: 11 },
    },
  ],
};

test("성적표 진입 → 초과수익 헤드라인 → 기간 필터 전환", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "bindesk:persona",
      JSON.stringify({ mode: "preset", profile: "neutral", targetReturnPct: 20, stopLossPct: 10, setAt: "t" }),
    );
  });
  await page.route("**/api/scorecard*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SCORECARD) });
  });

  await test.step("성적표 탭으로 이동한다", async () => {
    await page.goto("/");
    await page.getByRole("tab", { name: "성적표" }).click();
    await expect(page.getByText("벤치마크 대비 누적 초과수익")).toBeVisible();
  });

  await test.step("기본(1M) 초과수익과 실제/백테스트 비교가 보인다", async () => {
    await expect(page.getByText("+1.6%").first()).toBeVisible();
    await expect(page.getByText("실제 성과 vs 5년 백테스트")).toBeVisible();
  });

  await test.step("3M으로 전환하면 해당 기간 수치(음의 초과수익)가 보인다", async () => {
    await page.getByRole("tab", { name: "3M" }).click();
    await expect(page.getByText("-2.5%").first()).toBeVisible();
  });
});
