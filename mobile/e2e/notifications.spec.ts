import { test, expect } from "@playwright/test";

/**
 * CUF #5 — 알림함 탭 진입 → 다이제스트/알림 목록 확인 → 알림 탭 필터 → 항목 읽음 처리.
 * 알림은 기기 로컬에만 저장되므로 백엔드 없이 localStorage 시드로 검증합니다.
 */

const NOTIFICATIONS = [
  {
    id: "alert:NVDA:target_reached:2026-06-21T13:05:00Z",
    kind: "alert",
    category: "target_reached",
    symbol: "NVDA",
    title: "NVDA 목표가 도달",
    body: "NVDA 목표가 도달 (수익률 +22.1%). 흐름을 고려해 분할 매도를 검토하세요.",
    createdAt: "2026-06-21T13:05:00Z",
    read: false,
  },
  {
    id: "digest:2026-06-21",
    kind: "daily_digest",
    title: "오늘의 추천 (2026-06-21)",
    body: "NVDA, MSFT, AAPL · 기술주 강세.",
    createdAt: "2026-06-21T00:05:00Z",
    read: true,
    date: "2026-06-21",
    symbols: ["NVDA", "MSFT", "AAPL"],
  },
];

test("알림함 진입 → 목록 확인 → 필터 → 읽음 처리", async ({ page }) => {
  await page.addInitScript((items) => {
    window.localStorage.setItem(
      "bindesk:persona",
      JSON.stringify({ mode: "preset", profile: "neutral", targetReturnPct: 20, stopLossPct: 10, setAt: "t" }),
    );
    window.localStorage.setItem("bindesk:notifications", JSON.stringify(items));
  }, NOTIFICATIONS);

  await test.step("알림함 탭으로 이동한다", async () => {
    await page.goto("/");
    await page.getByRole("tab", { name: "알림함" }).click();
    await expect(page.getByText("NVDA 목표가 도달")).toBeVisible();
    await expect(page.getByText("오늘의 추천 (2026-06-21)")).toBeVisible();
  });

  await test.step("알림 필터로 다이제스트를 숨긴다", async () => {
    await page.getByRole("tab", { name: "알림" }).click();
    await expect(page.getByText("NVDA 목표가 도달")).toBeVisible();
    await expect(page.getByText("오늘의 추천 (2026-06-21)")).toHaveCount(0);
  });

  await test.step("모두 읽음 처리한다", async () => {
    await page.getByTestId("mark-all-read").click();
    await expect(page.getByTestId("mark-all-read")).toHaveCount(0);
  });
});
