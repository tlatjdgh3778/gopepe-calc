import { expect, test, type Page } from "@playwright/test";

/** 새 컨텍스트의 뷰포트 높이. 너비 표본만 바꾸고 높이는 고정한다. */
const VIEWPORT_HEIGHT = 900;

type TabName = "손익" | "평균 진입가";

/** 계산기 탭 패널. 화면 요소는 이 범위에서 찾는다(모든 탭 패널이 함께 마운트되어 있을 수 있다). */
function panelOf(page: Page, tab: TabName) {
  return page.getByRole("tabpanel", { name: tab, exact: true });
}

/** 결과 카드(region `평균 진입가 결과`). 결과 라벨 `평균 진입가`가 탭 이름과 겹치므로 이 범위에서 찾는다. */
function resultCardOf(page: Page) {
  return panelOf(page, "평균 진입가").getByRole("region", {
    name: "평균 진입가 결과",
    exact: true,
  });
}

/** 탭 목록에서 탭을 선택하고, 선택 상태와 그 탭 패널이 보이는 것까지 기다린다. */
async function selectTab(page: Page, tab: TabName) {
  const tablist = page.getByRole("tablist");
  await tablist.getByRole("tab", { name: tab, exact: true }).click();
  await expect(tablist.getByRole("tab", { name: tab, exact: true, selected: true })).toBeVisible();
  await expect(panelOf(page, tab)).toBeVisible();
}

function symbolOf(page: Page) {
  return panelOf(page, "평균 진입가").getByRole("combobox", { name: "심볼", exact: true });
}

async function chooseSymbol(page: Page, symbol: string) {
  const combobox = symbolOf(page);
  await combobox.click();
  // 옵션 목록은 포털로 탭 패널 밖에 그려지므로 열린 listbox 범위에서 찾는다
  await page.getByRole("listbox").getByRole("option", { name: symbol, exact: true }).click();
  await expect(combobox).toContainText(symbol);
}

function textboxOf(page: Page, name: string) {
  return panelOf(page, "평균 진입가").getByRole("textbox", { name, exact: true });
}

function buttonOf(page: Page, name: string) {
  return panelOf(page, "평균 진입가").getByRole("button", { name, exact: true });
}

async function fillTextbox(page: Page, name: string, value: string) {
  const textbox = textboxOf(page, name);
  await textbox.clear();
  await textbox.fill(value);
  await expect(textbox).toHaveValue(value);
}

type Entry = { price: string; qty: string };

/** 행 번호 1부터 (진입가, 수량)을 입력한다. 행은 이미 있어야 한다. */
async function fillRows(page: Page, entries: Entry[]) {
  for (const [index, entry] of entries.entries()) {
    const n = index + 1;
    await fillTextbox(page, `진입가 ${n}`, entry.price);
    await fillTextbox(page, `수량 ${n}`, entry.qty);
  }
}

/** 각 행의 진입가·수량 값이 기대값과 같은지 본다. */
async function expectRows(page: Page, entries: Entry[]) {
  for (const [index, entry] of entries.entries()) {
    const n = index + 1;
    await expect(textboxOf(page, `진입가 ${n}`)).toHaveValue(entry.price);
    await expect(textboxOf(page, `수량 ${n}`)).toHaveValue(entry.qty);
  }
}

/** 평균 진입가 탭의 행 수(진입가 입력란 수). */
function priceFieldsOf(page: Page) {
  return panelOf(page, "평균 진입가").getByRole("textbox", { name: /^진입가 \d+$/ });
}

/** 기준 사례 A4 (스펙 3장 표) */
const A4 = {
  symbol: "SOLUSDT",
  entries: [
    { price: "150", qty: "10" },
    { price: "140", qty: "5" },
    { price: "120", qty: "5" },
  ] satisfies Entry[],
};

/** 평균 진입가 탭을 열고 `행 추가`로 3행을 만든 뒤 A4의 (진입가, 수량)을 입력한다. */
async function enterThreeRows(page: Page) {
  await selectTab(page, "평균 진입가");
  await buttonOf(page, "행 추가").click();
  await expect(priceFieldsOf(page)).toHaveCount(3);
  await fillRows(page, A4.entries);
}

/** 기준 사례 A4를 입력한다: 심볼 변경, 1·2행 입력, `행 추가`, 3행 입력. */
async function enterA4(page: Page) {
  await selectTab(page, "평균 진입가");
  await chooseSymbol(page, A4.symbol);
  await fillRows(page, A4.entries.slice(0, 2));
  await buttonOf(page, "행 추가").click();
  await expect(priceFieldsOf(page)).toHaveCount(3);
  await fillTextbox(page, "진입가 3", A4.entries[2].price);
  await fillTextbox(page, "수량 3", A4.entries[2].qty);
}

async function expectA4Result(page: Page) {
  const resultCard = resultCardOf(page);
  await expect(resultCard.getByLabel("평균 진입가", { exact: true })).toHaveText("140.000");
  await expect(resultCard.getByLabel("총 수량", { exact: true })).toHaveText("20.0 SOL");
}

/**
 * 입력란을 한 번 클릭해 포커스한 뒤 키보드로 한 글자씩 누른다.
 * 글자마다 포커스가 그 입력란에 머물고 지금까지 누른 글자가 모두 들어가 있는지 본다.
 * (pressSequentially는 누르기 전에 입력란에 다시 포커스하므로 글자 사이의 포커스 이탈을 가릴 수 있어 쓰지 않는다)
 */
async function typeCharByChar(page: Page, name: string, value: string) {
  const textbox = textboxOf(page, name);
  await textbox.click();
  await expect(textbox).toBeFocused();
  for (let i = 0; i < value.length; i += 1) {
    await page.keyboard.press(value[i]);
    await expect(textbox).toBeFocused();
    await expect(textbox).toHaveValue(value.slice(0, i + 1));
  }
}

test.describe("평균 진입가 계산 — 평균 진입가 탭에서 진입 행을 추가·삭제·입력하면 계산 버튼 없이 평균 진입가와 총 수량이 보이고 포커스가 유지된다", () => {
  test.describe("행 추가", () => {
    /**
     * @spec DoD-11 DoD-18
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 "평균 진입가" 탭을 선택해 초기 2행에 진입가 1 `150`·수량 1 `10`, 진입가 2 `140`·수량 2 `5`를 입력했다
     * @when `행 추가`를 누른다
     * @then 포커스가 새 행의 `진입가 3` 입력란에 있다
     * @then 진입가 1·수량 1은 `150`·`10`, 진입가 2·수량 2는 `140`·`5`로 각자 자기 행에 유지된다
     */
    test("[DoD-11][DoD-18] 행 추가를 누르면 포커스가 새 행의 진입가 입력란에 있고 기존 행 값이 유지된다", async ({
      page,
    }) => {
      await page.goto("/");
      await selectTab(page, "평균 진입가");
      await expect(priceFieldsOf(page)).toHaveCount(2);
      await fillRows(page, A4.entries.slice(0, 2));

      await buttonOf(page, "행 추가").click();

      await expect(priceFieldsOf(page)).toHaveCount(3);
      await expect(textboxOf(page, "진입가 3")).toBeFocused();
      await expectRows(page, A4.entries.slice(0, 2));
    });
  });

  test.describe("행 삭제", () => {
    /**
     * @spec DoD-13 DoD-18
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 "평균 진입가" 탭에서 `행 추가`로 3행을 만들어 (진입가, 수량)을 1행 (150, 10), 2행 (140, 5), 3행 (120, 5)로 입력했다
     * @when 마지막이 아닌 행인 `2행 삭제`를 누른다
     * @then 포커스가 그 자리로 온 다음 행의 `진입가 2` 입력란에 있다
     * @then 진입가 1·수량 1은 `150`·`10`으로 유지된다
     * @then 삭제 전 3행의 값이 앞당겨진 번호의 행에 그대로 있다 — 진입가 2·수량 2가 `120`·`5`다
     */
    test("[DoD-13][DoD-18] 중간 행을 삭제하면 포커스가 다음 행의 진입가 입력란에 있고 뒤 행의 값이 앞당겨진 번호의 행에 유지된다", async ({
      page,
    }) => {
      await page.goto("/");
      await enterThreeRows(page);

      await buttonOf(page, "2행 삭제").click();

      await expect(priceFieldsOf(page)).toHaveCount(2);
      await expect(textboxOf(page, "진입가 2")).toBeFocused();
      await expectRows(page, [A4.entries[0], A4.entries[2]]);
    });

    /**
     * @spec DoD-14
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 "평균 진입가" 탭에서 `행 추가`로 3행을 만들어 (진입가, 수량)을 1행 (150, 10), 2행 (140, 5), 3행 (120, 5)로 입력했다
     * @when 마지막 행인 `3행 삭제`를 누른다
     * @then 포커스가 이전 행의 `진입가 2` 입력란에 있다
     */
    test("[DoD-14] 마지막 행을 삭제하면 포커스가 이전 행의 진입가 입력란에 있다", async ({
      page,
    }) => {
      await page.goto("/");
      await enterThreeRows(page);

      await buttonOf(page, "3행 삭제").click();

      await expect(priceFieldsOf(page)).toHaveCount(2);
      await expect(textboxOf(page, "진입가 2")).toBeFocused();
    });
  });

  test.describe("한 글자씩 입력", () => {
    /**
     * @spec DoD-17
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 "평균 진입가" 탭을 선택했다
     * @when `진입가 1` 입력란에 `100000.1`을, 이어서 `수량 1` 입력란에 `0.002`를 키보드로 한 글자씩 입력한다
     * @then 각 글자를 입력하는 동안 포커스가 입력 중인 그 입력란에 머문다
     * @then `진입가 1`의 값이 `100000.1`, `수량 1`의 값이 `0.002`로 입력한 글자가 모두 들어가 있다
     */
    test("[DoD-17] 한 행의 입력란에 한 글자씩 입력하는 동안 포커스가 머물고 입력한 값이 모두 들어간다", async ({
      page,
    }) => {
      await page.goto("/");
      await selectTab(page, "평균 진입가");

      await typeCharByChar(page, "진입가 1", "100000.1");
      await typeCharByChar(page, "수량 1", "0.002");

      await expect(textboxOf(page, "진입가 1")).toHaveValue("100000.1");
      await expect(textboxOf(page, "수량 1")).toHaveValue("0.002");
    });
  });

  test.describe("기준 사례", () => {
    /**
     * @spec DoD-22
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다 — 너비 표본 768px·1280px마다 그 너비를 지정한 새 컨텍스트를 하나씩 쓴다
     * @when "평균 진입가" 탭을 선택하고 심볼을 SOLUSDT로 바꾼 뒤 1행 (150, 10), 2행 (140, 5)를 입력하고 `행 추가`를 눌러 3행 (120, 5)를 입력한다(기준 사례 A4)
     * @then 각 너비에서 `평균 진입가 결과` 카드의 평균 진입가가 `140.000`으로 보인다
     * @then 각 너비에서 `평균 진입가 결과` 카드의 총 수량이 `20.0 SOL`로 보인다
     */
    test("[DoD-22] 너비 768px·1280px에서 기준 사례 A4를 입력하면 평균 진입가·총 수량이 기대값으로 보인다", async ({
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

            await enterA4(page);

            await expectA4Result(page);
          } finally {
            await context.close();
          }
        });
      }
    });
  });
});

test.describe("계산기 탭 전환 — 평균 진입가 탭은 다른 탭에 갔다 돌아와도 행과 값, 결과를 유지한다", () => {
  /**
   * @spec DoD-23
   * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 열고 "평균 진입가" 탭에 기준 사례 A4(심볼 SOLUSDT, 행 추가로 3행, (150, 10), (140, 5), (120, 5))를 입력했다
   * @when "평균 진입가" 탭 → "손익" 탭 → "평균 진입가" 탭으로 오간다
   * @then 행이 3개 그대로 있다
   * @then 심볼이 SOLUSDT이고 각 행의 진입가·수량이 1행 (150, 10), 2행 (140, 5), 3행 (120, 5) 그대로다
   * @then `평균 진입가 결과` 카드에 평균 진입가 `140.000`, 총 수량 `20.0 SOL`이 그대로 보인다
   */
  test("[DoD-23] 평균 진입가 탭에 입력하고 손익 탭에 갔다 돌아와도 행과 값, 결과가 유지된다", async ({
    page,
  }) => {
    await page.goto("/");
    await enterA4(page);
    await expectA4Result(page);

    await selectTab(page, "평균 진입가");
    await selectTab(page, "손익");
    await selectTab(page, "평균 진입가");

    await expect(priceFieldsOf(page)).toHaveCount(3);
    await expect(symbolOf(page)).toContainText(A4.symbol);
    await expectRows(page, A4.entries);
    await expectA4Result(page);
  });
});
