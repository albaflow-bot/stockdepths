import { test, expect } from "@playwright/test";

/**
 * CUF #3 — 첫 실행 시 투자 성향 게이트(건너뛰기 불가) → 성향 선택 후 앱 진입.
 *
 * 성향은 기기 로컬에만 저장되며 백엔드가 필요 없습니다. 새 브라우저 컨텍스트는
 * localStorage 가 비어 있어 매번 게이트가 먼저 뜹니다.
 */

test("첫 실행 게이트 → 성향 선택 → 앱 진입", async ({ page }) => {
  await test.step("앱을 처음 열면 성향 설정 게이트가 뜬다 (건너뛸 수 없음)", async () => {
    await page.goto("/");
    await expect(page.getByText("투자 성향 설정")).toBeVisible();
    await expect(page.getByText(/건너뛸 수 없습니다/)).toBeVisible();
    // 앱 탭은 아직 보이지 않는다.
    await expect(page.getByRole("tab", { name: "관심·보유" })).toHaveCount(0);
  });

  await test.step("중립형을 선택하고 시작한다", async () => {
    await page.getByRole("radio", { name: "중립형" }).click();
    await page.getByRole("button", { name: "시작하기" }).click();
  });

  await test.step("게이트가 열리고 앱 탭이 보인다", async () => {
    await expect(page.getByRole("tab", { name: "관심·보유" })).toBeVisible();
    await expect(page.getByText("오늘의 추천")).toBeVisible();
  });
});
