import { expect, test, type Page } from "@playwright/test";

/** 청산가 계산기가 들어 있는 이름 `청산가` 탭 패널. 화면 요소는 이 범위에서 찾는다. */
function liquidationPanelOf(page: Page) {
  return page.getByRole("tabpanel", { name: "청산가", exact: true });
}

/** 결과 카드(region `청산가 결과`). 결과 행은 이 범위에서 찾는다. */
function resultCardOf(page: Page) {
  return liquidationPanelOf(page).getByRole("region", { name: "청산가 결과", exact: true });
}

/** `/`를 열고 탭 목록에서 `청산가` 탭을 눌러 청산가 탭 패널이 보일 때까지 기다린다. */
async function openLiquidationTab(page: Page) {
  await page.goto("/");
  await page.getByRole("tablist").getByRole("tab", { name: "청산가", exact: true }).click();
  await expect(liquidationPanelOf(page)).toBeVisible();
}

function toggleOf(page: Page, group: string, name: string) {
  return liquidationPanelOf(page)
    .getByRole("group", { name: group, exact: true })
    .getByRole("button", { name, exact: true });
}

/** @given의 초기 상태(심볼 BTCUSDT, 방향 롱, 레버리지 10, 마진 모드 격리)를 확인한다. */
async function expectInitialState(page: Page) {
  const panel = liquidationPanelOf(page);
  await expect(panel.getByRole("combobox", { name: "심볼", exact: true })).toContainText("BTCUSDT");
  await expect(toggleOf(page, "방향", "롱")).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("textbox", { name: "레버리지", exact: true })).toHaveValue("10");
  await expect(toggleOf(page, "마진 모드", "격리")).toHaveAttribute("aria-pressed", "true");
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: ReturnType<Page["locator"]>): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, "bounding box를 읽을 수 없다(화면에 보이지 않음)").not.toBeNull();
  return box as Box;
}

async function fillTextbox(page: Page, name: string, value: string) {
  const textbox = liquidationPanelOf(page).getByRole("textbox", { name, exact: true });
  await textbox.clear();
  await textbox.fill(value);
  await expect(textbox).toHaveValue(value);
}

test.describe("청산가 계산 — 청산가 탭에서 포지션을 입력하면 추정 청산가와 거리, 손절 전 청산 경고가 보인다", () => {
  test.describe("탭 이동 — 손익 탭 뒤의 청산가 탭", () => {
    /**
     * @spec DoD-1
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다
     * @when 탭 목록에서 `청산가` 탭을 선택한다
     * @then 탭 목록에서 `청산가` 탭이 `손익` 탭 뒤에 있다(`목표가` 탭이 등록돼 있으면 `목표가` 탭 뒤에 있다)
     * @then `청산가` 탭이 선택되고 이름이 `청산가`인 탭 패널이 보인다
     * @then 이름이 `청산가`인 탭 패널 안에 청산가 계산기(`청산가 입력`·`청산가 결과` 영역)가 보인다
     */
    test("[DoD-1] 청산가 탭은 손익 탭 뒤에 있고 선택하면 청산가 탭 패널에 청산가 계산기가 보인다", async ({
      page,
    }) => {
      // 1. / 로 이동한다(baseURL만 사용)
      await page.goto("/");

      // 2. 탭 목록에서 탭 순서를 읽는다
      const tablist = page.getByRole("tablist");
      const liquidationTab = tablist.getByRole("tab", { name: "청산가", exact: true });
      await expect(tablist.getByRole("tab", { name: "손익", exact: true })).toBeVisible();
      await expect(liquidationTab).toBeVisible();
      const labels = (await tablist.getByRole("tab").allInnerTexts()).map((label) => label.trim());
      const pnlIndex = labels.indexOf("손익");
      const liquidationIndex = labels.indexOf("청산가");
      // `목표가` 탭이 없으면 -1이므로 기준은 `손익` 탭이 된다
      const targetIndex = labels.indexOf("목표가");
      expect(pnlIndex, `탭 순서: ${labels.join(", ")}`).toBeGreaterThanOrEqual(0);
      expect(liquidationIndex, `탭 순서: ${labels.join(", ")}`).toBeGreaterThan(
        Math.max(pnlIndex, targetIndex),
      );

      // 3. `청산가` 탭을 누른다
      await liquidationTab.click();

      // 4. `청산가` 탭이 선택되고 이름이 `청산가`인 탭 패널이 보인다
      await expect(
        tablist.getByRole("tab", { name: "청산가", exact: true, selected: true }),
      ).toBeVisible();
      const panel = liquidationPanelOf(page);
      await expect(panel).toBeVisible();

      // 5. 그 탭 패널 안에 청산가 계산기(`청산가 입력`·`청산가 결과` 영역)가 보인다
      await expect(panel.getByRole("region", { name: "청산가 입력", exact: true })).toBeVisible();
      await expect(panel.getByRole("region", { name: "청산가 결과", exact: true })).toBeVisible();
    });
  });

  test.describe("격리 모드 — 진입가·수량으로 청산가 계산", () => {
    /**
     * @spec DoD-29
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 `청산가` 탭으로 이동한다(초기 상태: 심볼 BTCUSDT, 방향 롱, 레버리지 10, 마진 모드 격리)
     * @when 마진 모드를 `격리`로 둔 채 진입가 100000, 수량 0.1을 입력한다
     * @then `청산가 결과` 카드의 `추정 청산가`가 `90,298.00`으로 보인다
     * @then `청산가 결과` 카드의 `청산가까지 거리`가 `9.70%`로 보인다
     */
    test("[DoD-29] 격리 모드로 진입가·수량을 입력하면 추정 청산가와 청산가까지 거리가 보인다", async ({
      page,
    }) => {
      // 1. / 로 이동해 `청산가` 탭을 누르고 초기 상태를 확인한다
      await openLiquidationTab(page);
      await expectInitialState(page);

      // 2. 마진 모드가 `격리`인 채로 진입가 100000, 수량 0.1을 입력한다
      await fillTextbox(page, "진입가", "100000");
      await fillTextbox(page, "수량", "0.1");
      await expect(toggleOf(page, "마진 모드", "격리")).toHaveAttribute("aria-pressed", "true");

      // 3. `청산가 결과` 카드의 `추정 청산가`·`청산가까지 거리`
      //   담보 100000 × 0.1 ÷ 10 = 1000, (10000 − 1000) ÷ (0.1 × (1 − 0.0033)) = 90297.98… → 롱 틱 0.1 올림 90298.0
      //   거리 |90298.0 − 100000| ÷ 100000 × 100 = 9.702 → 버림 2자리
      await expect(resultCardOf(page).getByLabel("추정 청산가", { exact: true })).toHaveText(
        "90,298.00",
      );
      await expect(resultCardOf(page).getByLabel("청산가까지 거리", { exact: true })).toHaveText(
        "9.70%",
      );
    });
  });

  test.describe("교차 모드 — 계좌 잔고로 청산가 계산", () => {
    /**
     * @spec DoD-30
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 `청산가` 탭으로 이동해 진입가 100000, 수량 0.1을 입력한다(초기 상태: 심볼 BTCUSDT, 방향 롱, 레버리지 10)
     * @when 마진 모드를 `교차`로 바꾸고 계좌 잔고 2000을 입력한다
     * @then `청산가 결과` 카드의 `추정 청산가`가 교차 기준 값 `80,264.90`으로 보인다
     */
    test("[DoD-30] 마진 모드를 교차로 바꾸고 계좌 잔고를 입력하면 교차 기준 추정 청산가가 보인다", async ({
      page,
    }) => {
      // 1. / 로 이동해 `청산가` 탭을 누르고 초기 상태를 확인한다
      await openLiquidationTab(page);
      await expectInitialState(page);

      // 2. 진입가 100000, 수량 0.1을 입력한다
      await fillTextbox(page, "진입가", "100000");
      await fillTextbox(page, "수량", "0.1");

      // 3. `마진 모드` 그룹에서 `교차`를 누르고 계좌 잔고 2000을 입력한다
      await toggleOf(page, "마진 모드", "교차").click();
      await expect(toggleOf(page, "마진 모드", "교차")).toHaveAttribute("aria-pressed", "true");
      await fillTextbox(page, "계좌 잔고", "2000");

      // 4. `청산가 결과` 카드의 `추정 청산가`
      //   (10000 − 2000) ÷ (0.1 × (1 − 0.0033)) = 80264.87… → 롱 틱 0.1 올림 80264.9
      await expect(resultCardOf(page).getByLabel("추정 청산가", { exact: true })).toHaveText(
        "80,264.90",
      );
    });
  });

  test.describe("손절가 — 손절 전에 청산되는 경우 경고", () => {
    /**
     * @spec DoD-24
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 `청산가` 탭으로 이동해 격리 모드로 진입가 100000, 수량 0.1을 입력한다(초기 상태: 심볼 BTCUSDT, 방향 롱, 레버리지 10 — 틱에 맞춘 청산가 90,298.00)
     * @when 손절가 90000(롱에서 틱에 맞춘 청산가 90298.0 이하)을 입력한다
     * @then 손절가 입력란 아래에 `⚠ 손절 전에 청산됩니다.`가 보인다
     * @then `⚠ 손절 전에 청산됩니다.`가 손절가 입력란과 `aria-describedby`로 연결돼 입력란의 접근 가능한 설명에 포함된다
     */
    test("[DoD-24] 롱에서 손절가가 청산가 이하이면 손절가 입력란 아래에 손절 전 청산 경고가 보이고 입력란과 연결된다", async ({
      page,
    }) => {
      // 1. / 로 이동해 `청산가` 탭을 누르고 초기 상태를 확인한다
      await openLiquidationTab(page);
      await expectInitialState(page);

      // 2. 격리 모드로 진입가 100000, 수량 0.1을 입력하고 틱에 맞춘 청산가 90,298.00이 보일 때까지 기다린다
      await fillTextbox(page, "진입가", "100000");
      await fillTextbox(page, "수량", "0.1");
      await expect(resultCardOf(page).getByLabel("추정 청산가", { exact: true })).toHaveText(
        "90,298.00",
      );

      // 3. 손절가 90000을 입력한다(90000 ≤ 90298.0)
      await fillTextbox(page, "손절가", "90000");

      // 4. 경고 문구가 보이고, 실제 화면 좌표로 손절가 입력란 아래에 놓인다
      const stopInput = liquidationPanelOf(page).getByRole("textbox", {
        name: "손절가",
        exact: true,
      });
      const warning = liquidationPanelOf(page).getByText("⚠ 손절 전에 청산됩니다.", {
        exact: true,
      });
      await expect(warning).toBeVisible();
      const inputBox = await boxOf(stopInput);
      const warningBox = await boxOf(warning);
      expect(warningBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);

      // 5. 경고 문구가 `aria-describedby`로 연결돼 입력란의 접근 가능한 설명이 된다
      await expect(stopInput).toHaveAccessibleDescription("⚠ 손절 전에 청산됩니다.");
    });
  });
});
