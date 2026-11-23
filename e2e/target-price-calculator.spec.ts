import { expect, test, type Page } from "@playwright/test";

/** 새 컨텍스트의 뷰포트 높이. 너비 표본만 바꾸고 높이는 고정한다. */
const VIEWPORT_HEIGHT = 900;

type TabName = "손익" | "목표가";

/** 계산기 탭 패널. 화면 요소는 이 범위에서 찾는다(손익·목표가 탭 패널이 함께 마운트되어 있다). */
function panelOf(page: Page, tab: TabName) {
  return page.getByRole("tabpanel", { name: tab, exact: true });
}

/** 결과 카드(region `{계산기명} 결과`). 결과 라벨 `손익`·`목표가`는 탭·탭 패널 이름과 겹치므로 이 범위에서 찾는다. */
function resultCardOf(page: Page, tab: TabName) {
  return panelOf(page, tab).getByRole("region", { name: `${tab} 결과`, exact: true });
}

/** 탭 목록에서 탭을 선택하고, 선택 상태와 그 탭 패널이 보이는 것까지 기다린다. */
async function selectTab(page: Page, tab: TabName) {
  const tablist = page.getByRole("tablist");
  await tablist.getByRole("tab", { name: tab, exact: true }).click();
  await expect(tablist.getByRole("tab", { name: tab, exact: true, selected: true })).toBeVisible();
  await expect(panelOf(page, tab)).toBeVisible();
}

async function chooseSymbol(page: Page, tab: TabName, symbol: string) {
  const combobox = panelOf(page, tab).getByRole("combobox", { name: "심볼", exact: true });
  await combobox.click();
  // 옵션 목록은 포털로 탭 패널 밖에 그려지므로 열린 listbox 범위에서 찾는다
  await page.getByRole("listbox").getByRole("option", { name: symbol, exact: true }).click();
  await expect(combobox).toContainText(symbol);
}

function toggleOf(page: Page, tab: TabName, group: string, button: string) {
  return panelOf(page, tab)
    .getByRole("group", { name: group, exact: true })
    .getByRole("button", { name: button, exact: true });
}

function textboxOf(page: Page, tab: TabName, name: string) {
  return panelOf(page, tab).getByRole("textbox", { name, exact: true });
}

async function fillTextbox(page: Page, tab: TabName, name: string, value: string) {
  const textbox = textboxOf(page, tab, name);
  await textbox.clear();
  await textbox.fill(value);
  await expect(textbox).toHaveValue(value);
}

/** 키보드로 한 글자씩 입력한다(음수 목표 ROE의 `-` 키 입력 확인용). */
async function typeTextbox(page: Page, tab: TabName, name: string, value: string) {
  const textbox = textboxOf(page, tab, name);
  await textbox.clear();
  await textbox.pressSequentially(value);
}

type TargetCase = {
  symbol: string;
  side: "롱" | "숏";
  leverage: string;
  entry: string;
  targetRoe: string;
};

/** 기준 사례 T1 (스펙 3장 표) */
const T1: TargetCase = {
  symbol: "BTCUSDT",
  side: "롱",
  leverage: "10",
  entry: "65000",
  targetRoe: "34.62",
};

/** 기준 사례 T2 (스펙 3장 표) */
const T2: TargetCase = {
  symbol: "BTCUSDT",
  side: "숏",
  leverage: "20",
  entry: "98765.4",
  targetRoe: "-24.99",
};

/** 목표가 탭에 심볼·방향·레버리지·진입가를 넣는다. 목표 ROE는 호출하는 쪽이 넣는다. */
async function enterTargetPosition(page: Page, c: TargetCase) {
  await chooseSymbol(page, "목표가", c.symbol);
  await toggleOf(page, "목표가", "방향", c.side).click();
  await fillTextbox(page, "목표가", "레버리지", c.leverage);
  await fillTextbox(page, "목표가", "진입가", c.entry);
}

test.describe("목표가 계산 — 목표가 탭에서 포지션과 목표 ROE를 입력하면 계산 버튼 없이 목표가와 가격 변동률이 보인다", () => {
  test.describe("롱 포지션", () => {
    /**
     * @spec DoD-16
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다 — 너비 표본 768px·1280px마다 그 너비를 지정한 새 컨텍스트를 하나씩 쓴다
     * @when "목표가" 탭을 선택하고 심볼 BTCUSDT, 방향 롱, 레버리지 10을 고른 뒤 진입가 65000, 목표 ROE 34.62를 입력한다(기준 사례 T1)
     * @then 각 너비에서 `목표가 결과` 카드의 목표가가 DoD-10 형식(BTCUSDT 2자리)의 `67,250.30`으로 보인다
     * @then 각 너비에서 `목표가 결과` 카드의 가격 변동률이 DoD-11 형식의 `+3.46%`로 보인다
     */
    test("[DoD-16] 너비 768px·1280px에서 롱 기준 사례 T1을 입력하면 목표가·가격 변동률이 기대값으로 보인다", async ({
      browser,
    }) => {
      for (const width of [768, 1280]) {
        await test.step(`너비 ${width}px`, async () => {
          const context = await browser.newContext({
            viewport: { width, height: VIEWPORT_HEIGHT },
          });
          try {
            const page = await context.newPage();
            await page.goto("/");

            await selectTab(page, "목표가");
            await enterTargetPosition(page, T1);
            await fillTextbox(page, "목표가", "목표 ROE", T1.targetRoe);

            const resultCard = resultCardOf(page, "목표가");
            await expect(resultCard.getByLabel("목표가", { exact: true })).toHaveText("67,250.30");
            await expect(resultCard.getByLabel("가격 변동률", { exact: true })).toHaveText(
              "+3.46%",
            );
          } finally {
            await context.close();
          }
        });
      }
    });
  });

  test.describe("숏 포지션 — 음수 목표 ROE", () => {
    /**
     * @spec DoD-17
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다 — 너비 표본 768px·1280px마다 그 너비를 지정한 새 컨텍스트를 하나씩 쓴다
     * @when "목표가" 탭을 선택하고 심볼 BTCUSDT, 방향 숏, 레버리지 20을 고른 뒤 진입가 98765.4를 입력하고, 목표 ROE 입력란에 `-24.99`를 키보드로 한 글자씩 입력한다(기준 사례 T2)
     * @then 각 너비에서 목표 ROE 입력란의 값이 `-24.99`다
     * @then 각 너비에서 `목표가 결과` 카드의 목표가가 DoD-10 형식(BTCUSDT 2자리)의 `99,999.40`으로 보인다
     * @then 각 너비에서 `목표가 결과` 카드의 가격 변동률이 DoD-11 형식의 `+1.24%`로 보인다
     */
    test("[DoD-17] 너비 768px·1280px에서 음수 목표 ROE를 키 입력한 숏 기준 사례 T2의 목표가·가격 변동률이 기대값으로 보인다", async ({
      browser,
    }) => {
      for (const width of [768, 1280]) {
        await test.step(`너비 ${width}px`, async () => {
          const context = await browser.newContext({
            viewport: { width, height: VIEWPORT_HEIGHT },
          });
          try {
            const page = await context.newPage();
            await page.goto("/");

            await selectTab(page, "목표가");
            await enterTargetPosition(page, T2);
            // `-`부터 한 글자씩 키 입력한다(fill로 값을 한 번에 넣지 않는다)
            await typeTextbox(page, "목표가", "목표 ROE", T2.targetRoe);

            await expect(textboxOf(page, "목표가", "목표 ROE")).toHaveValue("-24.99");

            const resultCard = resultCardOf(page, "목표가");
            await expect(resultCard.getByLabel("목표가", { exact: true })).toHaveText("99,999.40");
            await expect(resultCard.getByLabel("가격 변동률", { exact: true })).toHaveText(
              "+1.24%",
            );
          } finally {
            await context.close();
          }
        });
      }
    });
  });
});

test.describe("계산기 탭 전환 — 손익 탭과 목표가 탭은 각자 입력값과 결과를 유지한다", () => {
  test.describe("두 탭에 각각 입력한 뒤 탭을 오갈 때", () => {
    /**
     * @spec DoD-18
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다
     * @when "손익" 탭에 F-1 사례 C1(심볼 BTCUSDT, 방향 롱, 레버리지 10, 수량 단위 코인, 진입가 65000, 종료가 67250.5, 수량 0.12)을 입력하고, "목표가" 탭에 기준 사례 T2(심볼 BTCUSDT, 방향 숏, 레버리지 20, 진입가 98765.4, 목표 ROE -24.99)를 입력한 뒤, "손익" 탭과 "목표가" 탭 사이를 두 번 오가고 각 탭을 선택해 본다
     * @then "손익" 탭의 입력값이 목표가 탭 값이 아닌 자기 값 그대로다 — 심볼 BTCUSDT, 방향 롱, 레버리지 10, 수량 단위 코인, 진입가 65000, 종료가 67250.5, 수량 0.12
     * @then "손익" 탭의 `손익 결과` 카드에 필요 증거금 `780.00 USDT`, 손익 `+270.0600 USDT`, ROE `+34.62%`가 그대로 보인다
     * @then "목표가" 탭의 입력값이 손익 탭 값이 아닌 자기 값 그대로다 — 심볼 BTCUSDT, 방향 숏, 레버리지 20, 진입가 98765.4, 목표 ROE -24.99
     * @then "목표가" 탭의 `목표가 결과` 카드에 목표가 `99,999.40`, 가격 변동률 `+1.24%`가 그대로 보인다
     */
    test("[DoD-18] 손익 탭과 목표가 탭에 각각 입력하고 탭을 두 번 오가도 두 계산기의 입력값과 결과가 각자 유지된다", async ({
      page,
    }) => {
      await page.goto("/");

      // 손익 탭에 F-1 사례 C1을 입력한다
      await selectTab(page, "손익");
      await chooseSymbol(page, "손익", "BTCUSDT");
      await toggleOf(page, "손익", "방향", "롱").click();
      await fillTextbox(page, "손익", "레버리지", "10");
      await toggleOf(page, "손익", "수량 단위", "코인").click();
      await fillTextbox(page, "손익", "진입가", "65000");
      await fillTextbox(page, "손익", "종료가", "67250.5");
      await fillTextbox(page, "손익", "수량", "0.12");

      // 목표가 탭에 기준 사례 T2를 입력한다
      await selectTab(page, "목표가");
      await enterTargetPosition(page, T2);
      await fillTextbox(page, "목표가", "목표 ROE", T2.targetRoe);

      async function expectPnlKept() {
        await expect(
          panelOf(page, "손익").getByRole("combobox", { name: "심볼", exact: true }),
        ).toContainText("BTCUSDT");
        await expect(toggleOf(page, "손익", "방향", "롱")).toHaveAttribute("aria-pressed", "true");
        await expect(toggleOf(page, "손익", "방향", "숏")).toHaveAttribute("aria-pressed", "false");
        await expect(textboxOf(page, "손익", "레버리지")).toHaveValue("10");
        await expect(toggleOf(page, "손익", "수량 단위", "코인")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(textboxOf(page, "손익", "진입가")).toHaveValue("65000");
        await expect(textboxOf(page, "손익", "종료가")).toHaveValue("67250.5");
        await expect(textboxOf(page, "손익", "수량")).toHaveValue("0.12");

        const resultCard = resultCardOf(page, "손익");
        await expect(resultCard.getByLabel("필요 증거금", { exact: true })).toHaveText(
          "780.00 USDT",
        );
        await expect(resultCard.getByLabel("손익", { exact: true })).toHaveText("+270.0600 USDT");
        await expect(resultCard.getByLabel("ROE", { exact: true })).toHaveText("+34.62%");
      }

      async function expectTargetKept() {
        await expect(
          panelOf(page, "목표가").getByRole("combobox", { name: "심볼", exact: true }),
        ).toContainText("BTCUSDT");
        await expect(toggleOf(page, "목표가", "방향", "숏")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(toggleOf(page, "목표가", "방향", "롱")).toHaveAttribute(
          "aria-pressed",
          "false",
        );
        await expect(textboxOf(page, "목표가", "레버리지")).toHaveValue("20");
        await expect(textboxOf(page, "목표가", "진입가")).toHaveValue("98765.4");
        await expect(textboxOf(page, "목표가", "목표 ROE")).toHaveValue("-24.99");

        const resultCard = resultCardOf(page, "목표가");
        await expect(resultCard.getByLabel("목표가", { exact: true })).toHaveText("99,999.40");
        await expect(resultCard.getByLabel("가격 변동률", { exact: true })).toHaveText("+1.24%");
      }

      // 손익 → 목표가 왕복을 두 번 하며, 탭을 선택할 때마다 그 탭의 입력값과 결과를 본다
      for (const round of [1, 2]) {
        await test.step(`왕복 ${round}`, async () => {
          await selectTab(page, "손익");
          await expectPnlKept();
          await selectTab(page, "목표가");
          await expectTargetKept();
        });
      }
    });
  });
});
