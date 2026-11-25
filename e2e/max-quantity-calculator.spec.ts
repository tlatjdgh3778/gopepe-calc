import { expect, test, type Page } from "@playwright/test";

/** 새 컨텍스트의 뷰포트 높이. 너비 표본만 바꾸고 높이는 고정한다. */
const VIEWPORT_HEIGHT = 900;

type TabName = "손익" | "최대 수량";

/** 계산기 탭 패널. 화면 요소는 이 범위에서 찾는다(모든 계산기 탭 패널이 함께 마운트되어 있다). */
function panelOf(page: Page, tab: TabName) {
  return page.getByRole("tabpanel", { name: tab, exact: true });
}

/** 결과 카드(region `{계산기명} 결과`). 결과 라벨 `최대 수량`·`손익`은 탭·탭 패널 이름과 겹치므로 이 범위에서 찾는다. */
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

function symbolComboboxOf(page: Page, tab: TabName) {
  return panelOf(page, tab).getByRole("combobox", { name: "심볼", exact: true });
}

async function chooseSymbol(page: Page, tab: TabName, symbol: string) {
  const combobox = symbolComboboxOf(page, tab);
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

type MaxQuantityCase = {
  symbol: string;
  leverage: string;
  entry: string;
  balance: string;
};

/** 기준 사례 M1 (스펙 3장 표) */
const M1: MaxQuantityCase = {
  symbol: "BTCUSDT",
  leverage: "10",
  entry: "65000",
  balance: "1000",
};

/** 기준 사례 M3 (스펙 3장 표) */
const M3: MaxQuantityCase = {
  symbol: "ETHUSDT",
  leverage: "25",
  entry: "3456.78",
  balance: "800",
};

/** 최대 수량 탭에 심볼·레버리지·진입가·사용 가능 잔고를 넣는다. */
async function enterMaxQuantityCase(page: Page, c: MaxQuantityCase) {
  await chooseSymbol(page, "최대 수량", c.symbol);
  await fillTextbox(page, "최대 수량", "레버리지", c.leverage);
  await fillTextbox(page, "최대 수량", "진입가", c.entry);
  await fillTextbox(page, "최대 수량", "사용 가능 잔고", c.balance);
}

test.describe("최대 수량 계산 — 최대 수량 탭에서 잔고·레버리지·진입가를 입력하면 계산 버튼 없이 최대 수량과 포지션 가치가 보인다", () => {
  test.describe("기준 사례 입력 — 화면 너비별", () => {
    /**
     * @spec DoD-14
     * @given 프로덕션 빌드의 실제 브라우저에서 너비 768px·1280px 표본을 하나씩 새 컨텍스트로 열고 `/`의 최대 수량 탭을 선택했다
     * @when 기준 사례 M1(심볼 BTCUSDT, 레버리지 10, 진입가 65000, 사용 가능 잔고 1000)을 입력한다
     * @then `최대 수량 결과` 카드의 최대 수량이 `0.153 BTC`로 보인다
     * @then `최대 수량 결과` 카드의 포지션 가치가 `9,945.00 USDT`로 보인다
     */
    test("[DoD-14] 너비 768px·1280px에서 기준 사례 M1을 입력하면 최대 수량·포지션 가치가 기대값으로 보인다", async ({
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

            await selectTab(page, "최대 수량");
            await enterMaxQuantityCase(page, M1);

            const resultCard = resultCardOf(page, "최대 수량");
            await expect(resultCard.getByLabel("최대 수량", { exact: true })).toHaveText(
              "0.153 BTC",
            );
            await expect(resultCard.getByLabel("포지션 가치", { exact: true })).toHaveText(
              "9,945.00 USDT",
            );
          } finally {
            await context.close();
          }
        });
      }
    });
  });
});

test.describe("계산기 탭 전환 — 손익 탭과 최대 수량 탭은 각자 입력값과 결과를 유지한다", () => {
  test.describe("두 탭에 각각 입력한 뒤 탭을 오갈 때", () => {
    /**
     * @spec DoD-15
     * @given 손익 탭에 F-1 기준 사례 C1(BTCUSDT, 롱, 레버리지 10, 진입가 65000, 종료가 67250.5, 수량 0.12 코인)을, 최대 수량 탭에 기준 사례 M3(ETHUSDT, 레버리지 25, 진입가 3456.78, 사용 가능 잔고 800)을 입력했다
     * @when 최대 수량 탭과 손익 탭 사이를 두 번 오간다
     * @then 손익 탭의 입력값이 C1 그대로(BTCUSDT, 롱, 10, 65000, 67250.5, 0.12)이고 결과가 화면 표시 문자열과 정확히 일치하게 필요 증거금 `780.00 USDT`, 손익 `+270.0600 USDT`, ROE `+34.62%`로 유지된다
     * @then 최대 수량 탭의 입력값이 M3 그대로(ETHUSDT, 25, 3456.78, 800)이고 결과가 최대 수량 `5.78 ETH`, 포지션 가치 `19,980.18 USDT`로 유지된다
     */
    test("[DoD-15] 손익 탭과 최대 수량 탭에 각각 입력하고 탭을 두 번 오가도 두 계산기의 입력값과 결과가 각자 유지된다", async ({
      page,
    }) => {
      await page.goto("/");

      // 손익 탭에 F-1 기준 사례 C1을 입력한다
      await selectTab(page, "손익");
      await chooseSymbol(page, "손익", "BTCUSDT");
      await toggleOf(page, "손익", "방향", "롱").click();
      await fillTextbox(page, "손익", "레버리지", "10");
      await toggleOf(page, "손익", "수량 단위", "코인").click();
      await fillTextbox(page, "손익", "진입가", "65000");
      await fillTextbox(page, "손익", "종료가", "67250.5");
      await fillTextbox(page, "손익", "수량", "0.12");

      // 최대 수량 탭에 기준 사례 M3을 입력한다
      await selectTab(page, "최대 수량");
      await enterMaxQuantityCase(page, M3);

      async function expectPnlKept() {
        await expect(symbolComboboxOf(page, "손익")).toContainText("BTCUSDT");
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

        // 표시 문자열과 정확히 일치하는지 본다(toHaveText에 문자열을 넘기면 전체 일치 비교다)
        const resultCard = resultCardOf(page, "손익");
        await expect(resultCard.getByLabel("필요 증거금", { exact: true })).toHaveText(
          "780.00 USDT",
        );
        await expect(resultCard.getByLabel("손익", { exact: true })).toHaveText("+270.0600 USDT");
        await expect(resultCard.getByLabel("ROE", { exact: true })).toHaveText("+34.62%");
      }

      async function expectMaxQuantityKept() {
        await expect(symbolComboboxOf(page, "최대 수량")).toContainText("ETHUSDT");
        await expect(textboxOf(page, "최대 수량", "레버리지")).toHaveValue("25");
        await expect(textboxOf(page, "최대 수량", "진입가")).toHaveValue("3456.78");
        await expect(textboxOf(page, "최대 수량", "사용 가능 잔고")).toHaveValue("800");

        const resultCard = resultCardOf(page, "최대 수량");
        await expect(resultCard.getByLabel("최대 수량", { exact: true })).toHaveText("5.78 ETH");
        await expect(resultCard.getByLabel("포지션 가치", { exact: true })).toHaveText(
          "19,980.18 USDT",
        );
      }

      // 손익 → 최대 수량 왕복을 두 번 하며, 탭을 선택할 때마다 그 탭의 입력값과 결과를 본다
      for (const round of [1, 2]) {
        await test.step(`왕복 ${round}`, async () => {
          await selectTab(page, "손익");
          await expectPnlKept();
          await selectTab(page, "최대 수량");
          await expectMaxQuantityKept();
        });
      }
    });
  });
});
