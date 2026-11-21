import { expect, test, type Page } from "@playwright/test";

/** 음수 부호 U+2212 (스펙 DoD-7·DoD-8) */
const MINUS = "\u2212";

async function chooseSymbol(page: Page, symbol: string) {
  await page.getByRole("combobox", { name: "심볼", exact: true }).click();
  await page.getByRole("option", { name: symbol, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "심볼", exact: true })).toContainText(symbol);
}

async function fillTextbox(page: Page, name: string, value: string) {
  const textbox = page.getByRole("textbox", { name, exact: true });
  await textbox.clear();
  await textbox.fill(value);
  await expect(textbox).toHaveValue(value);
}

test.describe("손익 계산 — 포지션을 입력하면 계산 버튼 없이 필요 증거금·손익·ROE가 보인다", () => {
  test.describe("롱 포지션", () => {
    /**
     * @spec DoD-15
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다
     * @when 심볼 BTCUSDT, 방향 롱, 레버리지 10, 수량 단위 코인을 고르고 진입가 65000, 종료가 67250.5, 수량 0.12를 입력한다(사례 C1)
     * @then 필요 증거금이 DoD-18 버림 규칙과 DoD-20 자릿수(BTCUSDT 2자리)의 부호 없는 형식 `780.00 USDT`로 보인다
     * @then 손익이 DoD-18 버림 규칙과 DoD-20 자릿수(4자리)의 signed 형식 `+270.0600 USDT`로 보인다
     * @then ROE가 DoD-18 버림 규칙과 DoD-20 자릿수(2자리)의 부호 있는 형식 `+34.62%`로 보인다
     */
    test("[DoD-15] 롱 포지션 입력 시 필요 증거금·손익·ROE가 기대값으로 보인다", async ({
      page,
    }) => {
      await page.goto("/");

      await chooseSymbol(page, "BTCUSDT");
      await page
        .getByRole("group", { name: "방향", exact: true })
        .getByRole("button", { name: "롱", exact: true })
        .click();
      await fillTextbox(page, "레버리지", "10");
      await page
        .getByRole("group", { name: "수량 단위", exact: true })
        .getByRole("button", { name: "코인", exact: true })
        .click();
      await fillTextbox(page, "진입가", "65000");
      await fillTextbox(page, "종료가", "67250.5");
      await fillTextbox(page, "수량", "0.12");

      await expect(page.getByLabel("필요 증거금", { exact: true })).toHaveText("780.00 USDT");
      await expect(page.getByLabel("손익", { exact: true })).toHaveText("+270.0600 USDT");
      await expect(page.getByLabel("ROE", { exact: true })).toHaveText("+34.62%");
    });
  });

  test.describe("숏 포지션 — 손실", () => {
    /**
     * @spec DoD-16
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 연다
     * @when 심볼 BTCUSDT, 방향 숏, 레버리지 20, 수량 단위 코인을 고르고 진입가 98765.4, 종료가 99999.9, 수량 0.042를 입력한다(사례 C2)
     * @then 필요 증거금이 DoD-18 버림 규칙과 DoD-20 자릿수(BTCUSDT 2자리)의 부호 없는 형식 `207.40 USDT`로 보인다
     * @then 손익이 DoD-18 버림 규칙과 DoD-20 자릿수(4자리)의 signed 형식 `−51.8490 USDT`로 보인다
     * @then ROE가 DoD-18 버림 규칙과 DoD-20 자릿수(2자리)의 부호 있는 형식 `−24.99%`로 보인다
     * @then 손익과 ROE의 음수 부호는 하이픈-마이너스가 아닌 `−`(U+2212)로 보인다
     */
    test("[DoD-16] 숏 손실 포지션 입력 시 필요 증거금·손익·ROE가 기대값으로 보이고 음수 부호는 −(U+2212)다", async ({
      page,
    }) => {
      await page.goto("/");

      await chooseSymbol(page, "BTCUSDT");
      await page
        .getByRole("group", { name: "방향", exact: true })
        .getByRole("button", { name: "숏", exact: true })
        .click();
      await fillTextbox(page, "레버리지", "20");
      await page
        .getByRole("group", { name: "수량 단위", exact: true })
        .getByRole("button", { name: "코인", exact: true })
        .click();
      await fillTextbox(page, "진입가", "98765.4");
      await fillTextbox(page, "종료가", "99999.9");
      await fillTextbox(page, "수량", "0.042");

      await expect(page.getByLabel("필요 증거금", { exact: true })).toHaveText("207.40 USDT");
      // 음수 부호는 U+2212로 정확히 비교한다. 하이픈-마이너스(U+002D)면 일치하지 않는다.
      await expect(page.getByLabel("손익", { exact: true })).toHaveText(`${MINUS}51.8490 USDT`);
      await expect(page.getByLabel("ROE", { exact: true })).toHaveText(`${MINUS}24.99%`);
      await expect(page.getByLabel("손익", { exact: true })).not.toContainText("-");
      await expect(page.getByLabel("ROE", { exact: true })).not.toContainText("-");
    });
  });
});

/** 새 컨텍스트의 뷰포트 높이. 너비 표본만 바꾸고 높이는 고정한다. */
const VIEWPORT_HEIGHT = 900;

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: ReturnType<Page["locator"]>): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, "bounding box를 읽을 수 없다(화면에 보이지 않음)").not.toBeNull();
  return box as Box;
}

function inputCardOf(page: Page) {
  return page.getByRole("region", { name: "입력", exact: true });
}

function resultCardOf(page: Page) {
  return page.getByRole("region", { name: "결과", exact: true });
}

type Position = {
  symbol: string;
  side: "롱" | "숏";
  leverage: string;
  entry: string;
  exit: string;
  qty: string;
};

async function enterPosition(page: Page, position: Position) {
  await chooseSymbol(page, position.symbol);
  await page
    .getByRole("group", { name: "방향", exact: true })
    .getByRole("button", { name: position.side, exact: true })
    .click();
  await fillTextbox(page, "레버리지", position.leverage);
  await page
    .getByRole("group", { name: "수량 단위", exact: true })
    .getByRole("button", { name: "코인", exact: true })
    .click();
  await fillTextbox(page, "진입가", position.entry);
  await fillTextbox(page, "종료가", position.exit);
  await fillTextbox(page, "수량", position.qty);
}

/** 문서의 scrollWidth와 documentElement.clientWidth */
async function documentWidths(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/**
 * :root 토큰 색을 요소 색과 같은 직렬화로 읽는다.
 * `color: var(--token)`을 지정한 probe 요소를 :root(html) 바로 아래에 붙여 computed color를 읽는다.
 */
async function rootTokenColors(page: Page, tokens: readonly string[]) {
  return page.evaluate((names) => {
    const probe = document.createElement("span");
    document.documentElement.appendChild(probe);
    try {
      const out: Record<string, string> = {};
      for (const name of names) {
        probe.style.color = `var(${name})`;
        out[name] = getComputedStyle(probe).color;
      }
      return out;
    } finally {
      probe.remove();
    }
  }, tokens);
}

/**
 * CSS 색 문자열을 canvas(sRGB)에 칠해 8비트 [r, g, b, a]로 바꾼다.
 * computed 값의 형식(rgb·oklch·lab 등)을 파싱하지 않기 위해 브라우저의 색 해석을 쓴다.
 */
async function toSrgb(page: Page, colors: readonly string[]) {
  return page.evaluate((values) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없다");
    return values.map((value) => {
      // 브라우저가 해석하지 못한 색은 fillStyle에 반영되지 않으므로 두 sentinel로 감지한다.
      ctx.fillStyle = "#010203";
      ctx.fillStyle = value;
      const first = ctx.fillStyle;
      ctx.fillStyle = "#040506";
      ctx.fillStyle = value;
      if (ctx.fillStyle !== first) throw new Error(`canvas가 해석하지 못한 색: ${value}`);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a];
    });
  }, colors);
}

/** 8비트 sRGB의 상대 휘도(WCAG 2 정의) */
function relativeLuminance([r, g, b]: number[]): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

test.describe("손익 계산 화면 — 화면 너비와 OS 색 구성에 맞춰 카드 배치와 색이 바뀐다", () => {
  test.describe("화면 너비 768px 이상 — 입력·결과 카드가 나란히", () => {
    /**
     * @spec DoD-21
     * @given 너비 표본 768px·1280px마다 그 너비를 지정한 저장 상태 없는 새 브라우저 컨텍스트에서 프로덕션 빌드 앱의 / 화면을 연다
     * @when 첫 화면을 그대로 본다
     * @then 각 너비에서 제목 `입력` 카드 안에 입력 컨트롤 전부(심볼, 방향, 레버리지, 진입가, 종료가, 수량, 수량 단위)가 있다
     * @then 각 너비에서 제목 `결과` 카드 안에 필요 증거금·손익·ROE가 있다
     * @then 각 너비에서 두 카드의 bounding box가 모두 h1의 bounding box 아래에 있다
     * @then 각 너비에서 bounding box 좌표로 `입력` 카드가 왼쪽, `결과` 카드가 오른쪽에 나란히 놓인다(`입력` 카드 오른쪽 끝이 `결과` 카드 왼쪽 끝을 넘지 않고, 두 카드의 세로 범위가 겹친다)
     */
    test("[DoD-21] 너비 768px·1280px에서 h1 아래에 입력 카드와 결과 카드가 왼쪽·오른쪽으로 나란히 놓인다", async ({
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

            const heading = page.getByRole("heading", { level: 1 });
            const inputCard = inputCardOf(page);
            const resultCard = resultCardOf(page);
            await expect(heading).toBeVisible();
            await expect(inputCard).toBeVisible();
            await expect(resultCard).toBeVisible();

            // 입력 컨트롤 전부가 `입력` 카드 안에 있다
            await expect(
              inputCard.getByRole("combobox", { name: "심볼", exact: true }),
            ).toBeVisible();
            const side = inputCard.getByRole("group", { name: "방향", exact: true });
            await expect(side.getByRole("button", { name: "롱", exact: true })).toBeVisible();
            await expect(side.getByRole("button", { name: "숏", exact: true })).toBeVisible();
            for (const name of ["레버리지", "진입가", "종료가", "수량"]) {
              await expect(inputCard.getByRole("textbox", { name, exact: true })).toBeVisible();
            }
            const unit = inputCard.getByRole("group", { name: "수량 단위", exact: true });
            await expect(unit.getByRole("button", { name: "코인", exact: true })).toBeVisible();
            await expect(unit.getByRole("button", { name: "USDT", exact: true })).toBeVisible();

            // 필요 증거금·손익·ROE가 `결과` 카드 안에 있다
            for (const name of ["필요 증거금", "손익", "ROE"]) {
              await expect(resultCard.getByLabel(name, { exact: true })).toBeVisible();
            }

            const h1Box = await boxOf(heading);
            const inputBox = await boxOf(inputCard);
            const resultBox = await boxOf(resultCard);

            // 두 카드가 h1 아래에 있다
            expect(inputBox.y).toBeGreaterThanOrEqual(h1Box.y + h1Box.height);
            expect(resultBox.y).toBeGreaterThanOrEqual(h1Box.y + h1Box.height);

            // `입력` 왼쪽, `결과` 오른쪽: 입력 카드 오른쪽 끝이 결과 카드 왼쪽 끝을 넘지 않는다
            expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(resultBox.x);
            // 두 카드의 세로 범위가 겹친다
            expect(inputBox.y).toBeLessThan(resultBox.y + resultBox.height);
            expect(resultBox.y).toBeLessThan(inputBox.y + inputBox.height);
          } finally {
            await context.close();
          }
        });
      }
    });
  });

  test.describe("화면 너비 768px 미만 — 입력 카드 아래에 결과 카드", () => {
    /**
     * @spec DoD-22
     * @given 너비 표본 375px·767px마다 그 너비를 지정한 저장 상태 없는 새 브라우저 컨텍스트에서 프로덕션 빌드 앱의 / 화면을 연다
     * @when 첫 화면을 본 뒤, EC-7 규모 값(BTCUSDT, 롱, 레버리지 10, 코인, 진입가 65000, 종료가 67250.5, 수량 1000000000)을 입력한다
     * @then 각 너비의 첫 화면에서 bounding box 좌표로 제목 `결과` 카드가 제목 `입력` 카드 아래에 놓인다(`결과` 카드 위쪽 끝이 `입력` 카드 아래쪽 끝보다 아래다)
     * @then 각 너비의 첫 화면에서 가로 스크롤이 생기지 않는다(문서의 scrollWidth가 문서의 clientWidth(documentElement.clientWidth)를 넘지 않는다)
     * @then 각 너비에서 큰 값이 표시된 상태에서도 가로 스크롤이 생기지 않는다(문서의 scrollWidth가 문서의 clientWidth(documentElement.clientWidth)를 넘지 않는다)
     * @then 각 너비에서 큰 값이 표시된 상태에서 `결과` 카드와 그 안 요소의 scrollWidth가 각자의 clientWidth를 넘지 않는다(카드 안 가로 스크롤·잘림이 없다)
     */
    test("[DoD-22] 너비 375px·767px에서 입력 카드 아래에 결과 카드가 놓이고 큰 값 입력 후에도 가로 스크롤이 없다", async ({
      browser,
    }) => {
      for (const width of [375, 767]) {
        await test.step(`너비 ${width}px`, async () => {
          const context = await browser.newContext({
            viewport: { width, height: VIEWPORT_HEIGHT },
          });
          try {
            const page = await context.newPage();
            await page.goto("/");

            const inputCard = inputCardOf(page);
            const resultCard = resultCardOf(page);
            await expect(inputCard).toBeVisible();
            await expect(resultCard).toBeVisible();

            // 첫 화면: `결과` 카드 위쪽 끝이 `입력` 카드 아래쪽 끝보다 아래다
            const inputBox = await boxOf(inputCard);
            const resultBox = await boxOf(resultCard);
            expect(resultBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);

            // 첫 화면: 문서 가로 스크롤 없음
            const first = await documentWidths(page);
            expect(first.scrollWidth).toBeLessThanOrEqual(first.clientWidth);

            // EC-7 규모 값. 기대값 손계산(DoD-7·DoD-8·DoD-18·DoD-20):
            //   증거금 65000 × 1e9 ÷ 10 = 6,500,000,000,000 → 2자리
            //   손익 (67250.5 − 65000) × 1e9 = 2250.5 × 1e9 = 2,250,500,000,000 → 4자리, 양수 +
            //   ROE 2,250,500,000,000 ÷ 6,500,000,000,000 × 100 = 34.6230769… → 버림 2자리
            await enterPosition(page, {
              symbol: "BTCUSDT",
              side: "롱",
              leverage: "10",
              entry: "65000",
              exit: "67250.5",
              qty: "1000000000",
            });
            // 큰 값이 결과에 보인 뒤에 잰다
            await expect(resultCard.getByLabel("필요 증거금", { exact: true })).toHaveText(
              "6,500,000,000,000.00 USDT",
            );
            await expect(resultCard.getByLabel("손익", { exact: true })).toHaveText(
              "+2,250,500,000,000.0000 USDT",
            );
            await expect(resultCard.getByLabel("ROE", { exact: true })).toHaveText("+34.62%");

            // 큰 값 상태: 문서 가로 스크롤 없음
            const large = await documentWidths(page);
            expect(large.scrollWidth).toBeLessThanOrEqual(large.clientWidth);

            // 큰 값 상태: `결과` 카드와 그 안 모든 요소에서 scrollWidth ≤ clientWidth (카드 안 가로 스크롤·잘림 없음)
            const overflowing = await resultCard.evaluate((card) =>
              [card, ...Array.from(card.querySelectorAll("*"))]
                .filter((el) => el.scrollWidth > el.clientWidth)
                .map((el) => ({
                  tag: el.tagName.toLowerCase(),
                  text: (el.textContent ?? "").trim().slice(0, 40),
                  scrollWidth: el.scrollWidth,
                  clientWidth: el.clientWidth,
                })),
            );
            expect(overflowing).toEqual([]);
          } finally {
            await context.close();
          }
        });
      }
    });
  });

  test.describe("OS 색 구성 — 다크·라이트 토큰 값으로 표시", () => {
    /**
     * @spec DoD-23
     * @given 색 구성 표본 light·dark마다 colorScheme 에뮬레이션을 지정한 저장 상태 없는 새 브라우저 컨텍스트에서 프로덕션 빌드 앱의 / 화면을 연다
     * @when 사례 C1(BTCUSDT, 롱, 레버리지 10, 코인, 진입가 65000, 종료가 67250.5, 수량 0.12 — 이익)을 입력해 색을 읽은 뒤, 사례 C2(BTCUSDT, 숏, 레버리지 20, 코인, 진입가 98765.4, 종료가 99999.9, 수량 0.042 — 손실)로 입력을 바꿔 색을 읽는다
     * @then 각 색 구성에서 body 배경색이 그 구성의 :root --background 토큰 색과 같다(토큰과 요소 색은 같은 직렬화로 맞춰 비교한다)
     * @then 각 색 구성에서 사례 C1의 손익·ROE 글자색이 모두 그 구성의 :root --profit(이익색) 토큰 색과 같다(같은 직렬화로 맞춰 비교한다)
     * @then 각 색 구성에서 사례 C2의 손익·ROE 글자색이 모두 그 구성의 :root --loss(손실색) 토큰 색과 같다(같은 직렬화로 맞춰 비교한다)
     * @then body 배경색, 사례 C1의 손익·ROE 글자색, 사례 C2의 손익·ROE 글자색이 각각 라이트와 다크에서 서로 다르다
     * @then 다크 구성의 body 배경색 휘도가 라이트 구성의 body 배경색 휘도보다 낮다
     */
    test("[DoD-23] OS 색 구성이 다크면 다크 토큰, 라이트면 라이트 토큰 값으로 배경과 손익·ROE 색이 표시된다", async ({
      browser,
    }) => {
      const observed: Record<"light" | "dark", Record<string, number[]>> = {
        light: {},
        dark: {},
      };

      for (const colorScheme of ["light", "dark"] as const) {
        await test.step(`색 구성 ${colorScheme}`, async () => {
          const context = await browser.newContext({ colorScheme });
          try {
            const page = await context.newPage();
            await page.goto("/");

            const tokens = await rootTokenColors(page, ["--background", "--profit", "--loss"]);
            const body = page.locator("body");
            const pnl = page.getByLabel("손익", { exact: true });
            const roe = page.getByLabel("ROE", { exact: true });

            // body 배경색 = 그 구성의 :root --background 토큰 색
            await expect(body).toHaveCSS("background-color", tokens["--background"]);

            // 사례 C1(이익): 손익·ROE 글자색 = --profit 토큰 색
            await enterPosition(page, {
              symbol: "BTCUSDT",
              side: "롱",
              leverage: "10",
              entry: "65000",
              exit: "67250.5",
              qty: "0.12",
            });
            await expect(pnl).toHaveText("+270.0600 USDT");
            await expect(roe).toHaveText("+34.62%");
            await expect(pnl).toHaveCSS("color", tokens["--profit"]);
            await expect(roe).toHaveCSS("color", tokens["--profit"]);
            const c1 = await Promise.all([
              pnl.evaluate((el) => getComputedStyle(el).color),
              roe.evaluate((el) => getComputedStyle(el).color),
            ]);

            // 사례 C2(손실)로 입력을 바꾼다: 손익·ROE 글자색 = --loss 토큰 색
            await enterPosition(page, {
              symbol: "BTCUSDT",
              side: "숏",
              leverage: "20",
              entry: "98765.4",
              exit: "99999.9",
              qty: "0.042",
            });
            await expect(pnl).toHaveText(`${MINUS}51.8490 USDT`);
            await expect(roe).toHaveText(`${MINUS}24.99%`);
            await expect(pnl).toHaveCSS("color", tokens["--loss"]);
            await expect(roe).toHaveCSS("color", tokens["--loss"]);
            const c2 = await Promise.all([
              pnl.evaluate((el) => getComputedStyle(el).color),
              roe.evaluate((el) => getComputedStyle(el).color),
            ]);

            const background = await body.evaluate((el) => getComputedStyle(el).backgroundColor);
            const [bgRgb, c1PnlRgb, c1RoeRgb, c2PnlRgb, c2RoeRgb] = await toSrgb(page, [
              background,
              ...c1,
              ...c2,
            ]);
            observed[colorScheme] = {
              background: bgRgb,
              c1Pnl: c1PnlRgb,
              c1Roe: c1RoeRgb,
              c2Pnl: c2PnlRgb,
              c2Roe: c2RoeRgb,
            };
          } finally {
            await context.close();
          }
        });
      }

      // 라이트와 다크에서 각 색이 서로 다르다(sRGB로 바꿔 비교)
      for (const key of ["background", "c1Pnl", "c1Roe", "c2Pnl", "c2Roe"]) {
        expect(observed.dark[key], `${key} 색이 라이트·다크에서 같다`).not.toEqual(
          observed.light[key],
        );
      }

      // 다크 body 배경 휘도 < 라이트 body 배경 휘도
      expect(relativeLuminance(observed.dark.background)).toBeLessThan(
        relativeLuminance(observed.light.background),
      );
    });
  });
});
