import { test, expect } from "@playwright/test";

/**
 * CUF #2 — 관심·보유 탭 진입 → 보유 종목(매수가) 추가 → 수익률(%) 확인.
 *
 * 시세 API는 route 가로채기로 고정 응답을 주입해 결정론적으로 검증합니다.
 * 개인 데이터는 기기 로컬에만 저장되므로 백엔드 없이도 동작합니다.
 */

test("관심·보유 진입 → 보유 추가 → 수익률 확인", async ({ page }) => {
  await test.step("시세 API를 고정 응답으로 가로챈다", async () => {
    await page.route("**/api/quotes*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ symbol: "AAPL", price: 120, changePercent: 1.5 }]),
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

  await test.step("앱을 열고 관심·보유 탭으로 이동한다", async () => {
    await page.goto("/");
    await page.getByRole("tab", { name: "관심·보유" }).click();
    await expect(page.getByText(/이 기기에만 저장됩니다/)).toBeVisible();
  });

  await test.step("매수가 100으로 AAPL 보유를 추가한다", async () => {
    await page.getByLabel("종목").fill("AAPL");
    await page.getByLabel("매수가").fill("100");
    await page.getByLabel("수량 (선택)").fill("10");
    await page.getByRole("button", { name: "보유 추가" }).click();
  });

  await test.step("현재가 120 기준 수익률 +20%가 표시된다", async () => {
    await expect(page.getByText("+20%")).toBeVisible();
    await expect(page.getByText("+$200.00")).toBeVisible();
  });
});
