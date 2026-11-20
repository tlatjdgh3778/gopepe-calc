import { expect, test } from "@playwright/test";

/**
 * @spec DoD-3
 * @given 프로덕션 빌드(build 후 start)로 띄운 앱이 baseURL에서 응답한다
 * @when 사용자가 루트 경로(/)로 이동한다
 * @then level 1 heading이 화면에 보인다
 */
test("홈 페이지에서 level 1 제목이 보인다", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
