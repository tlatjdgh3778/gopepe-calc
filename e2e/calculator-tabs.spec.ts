import { expect, test } from "@playwright/test";

test.describe("계산기 탭 — 처음 열면 손익 탭에서 손익 계산기를 바로 쓸 수 있다", () => {
  test.describe("처음 열었을 때 — 기본 탭과 손익 계산기 카드 이름", () => {
    /**
     * @spec DoD-18 DoD-19
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다
     * @when 첫 화면을 조작 없이 그대로 본다
     * @then 화면에 탭 목록이 있다
     * @then 탭 목록에서 `손익` 탭이 선택되어 있다
     * @then 이름이 `손익`인 탭 패널 안에 `손익 입력`·`손익 결과` 영역이 보인다
     * @then 손익 계산기의 입력 카드 제목이 `손익 입력`이고 그 region 접근 이름도 `손익 입력`이다
     * @then 손익 계산기의 결과 카드 제목이 `손익 결과`이고 그 region 접근 이름도 `손익 결과`다
     */
    test("[DoD-18][DoD-19] 처음 열면 손익 탭이 선택되어 손익 탭 패널에 손익 입력·손익 결과 카드가 보인다", async ({
      page,
    }) => {
      // 1. / 로 이동한다(baseURL만 사용)
      await page.goto("/");

      // 2. 탭 목록이 보인다
      const tablist = page.getByRole("tablist");
      await expect(tablist).toBeVisible();

      // 3. `손익` 탭이 선택 상태다
      await expect(
        tablist.getByRole("tab", { name: "손익", exact: true, selected: true }),
      ).toBeVisible();

      // 4. 이름이 `손익`인 탭 패널 안에 `손익 입력`·`손익 결과` 영역이 보인다
      const panel = page.getByRole("tabpanel", { name: "손익", exact: true });
      await expect(panel).toBeVisible();
      const inputCard = panel.getByRole("region", { name: "손익 입력", exact: true });
      const resultCard = panel.getByRole("region", { name: "손익 결과", exact: true });
      await expect(inputCard).toBeVisible();
      await expect(resultCard).toBeVisible();

      // 5. 입력 카드 제목 `손익 입력`(region 이름은 4에서 확인)
      await expect(inputCard.getByText("손익 입력", { exact: true })).toBeVisible();

      // 6. 결과 카드 제목 `손익 결과`(region 이름은 4에서 확인)
      await expect(resultCard.getByText("손익 결과", { exact: true })).toBeVisible();
    });
  });
});
