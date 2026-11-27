import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/** 새 컨텍스트의 뷰포트 높이. 너비 표본만 바꾸고 높이는 고정한다. */
const VIEWPORT_HEIGHT = 900;

/** 배치 판정의 좌표 허용 오차(px). 소수 좌표 반올림만 흡수한다. */
const EPS = 1;

/** 경로 차트 figure의 접근 이름(구현의 aria-label). */
const CHART_NAME = "진입가, 누적 평균 진입가, 청산가의 단계별 변화";

type Box = { x: number; y: number; width: number; height: number };

function regionOf(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

/**
 * 요약 결과값(`dd`). Chromium 접근 트리는 `dd`의 aria-labelledby를 definition 이름으로 노출하지 않으므로
 * 레이블(aria-labelledby가 가리키는 `dt`)로 찾는다(F-5 E2E와 같은 방식).
 */
function summaryValue(page: Page, name: string): Locator {
  return regionOf(page, "포지션 요약").getByLabel(name, { exact: true });
}

function chartOf(page: Page): Locator {
  return regionOf(page, "포지션 경로").getByRole("figure", { name: CHART_NAME, exact: true });
}

async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, "bounding box를 읽을 수 없다(화면에 보이지 않음)").not.toBeNull();
  return box as Box;
}

const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;

/** 너비별 새 컨텍스트에서 / 를 열고 6개 region이 보일 때까지 기다린 뒤 본문을 실행한다. */
async function withWidth(browser: Browser, width: number, body: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width, height: VIEWPORT_HEIGHT } });
  try {
    const page = await context.newPage();
    await page.goto("/");
    for (const name of ["포지션 설정", "추가 진입", "포지션 요약", "포지션 경로", "익절", "손절"]) {
      await expect(regionOf(page, name)).toBeVisible();
    }
    await body(page);
  } finally {
    await context.close();
  }
}

/** 차트 선마다의 점 묶음. Recharts 3은 점을 선 그룹 밖 z-index 층에 `.recharts-line-dots`로 그린다. */
function dotGroupsOf(page: Page): Locator {
  return chartOf(page).locator("g.recharts-line-dots");
}

/** 점 묶음 하나의 점 cx 좌표 목록(그린 순서). */
async function dotXs(group: Locator): Promise<number[]> {
  return group
    .locator("circle.recharts-line-dot")
    .evaluateAll((els) => els.map((el) => Number(el.getAttribute("cx"))));
}

/**
 * x축 눈금 글자(왼쪽부터). Recharts 3은 눈금 글자를 축 그룹(`.recharts-xAxis`) 밖 z-index 층의
 * `.recharts-xAxis-tick-labels`에 그린다.
 */
function xTicksOf(page: Page): Locator {
  return chartOf(page).locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value");
}

/** 경로 차트가 선 3개와 각 선의 점 `count`개를 최초 진입부터 왼쪽→오른쪽 순서로 그렸는지 본다. */
async function expectChartLines(page: Page, labels: readonly string[]) {
  const chart = chartOf(page);
  await expect(chart.locator('[data-slot="chart"]')).toBeVisible();
  // SVG 선 3개(진입가·누적 평단·청산가)
  await expect(chart.locator("g.recharts-line")).toHaveCount(3);
  await expect(chart.locator("path.recharts-line-curve")).toHaveCount(3);
  // 선마다 점이 단계 수만큼, 왼쪽에서 오른쪽 순서로
  const groups = dotGroupsOf(page);
  await expect(groups).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const group = groups.nth(i);
    await expect(group.locator("circle.recharts-line-dot")).toHaveCount(labels.length);
    const xs = await dotXs(group);
    for (let k = 1; k < xs.length; k += 1) {
      expect(xs[k], `선 ${i + 1}의 ${k + 1}번째 점이 앞 점보다 오른쪽이다`).toBeGreaterThan(
        xs[k - 1],
      );
    }
  }
  // 점 순서의 단계 이름: 최초 진입과 포함된 단계 순서
  await expect(xTicksOf(page)).toHaveText([...labels]);
}

/** 요소의 computed 색을 canvas(sRGB)에 칠해 8비트 [r, g, b, a]로 읽는다(색 표기 형식에 의존하지 않는다). */
async function srgbOf(page: Page, color: string): Promise<number[]> {
  return page.evaluate((value) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없다");
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  }, color);
}

/** P1 요약 표시값(스펙 3장 기준 사례 표). */
const P1_SUMMARY: ReadonlyArray<readonly [string, string]> = [
  ["평균 진입가", "2,066.17"],
  ["추정 청산가", "1,895.20"],
  ["실효 레버리지", "12.81×"],
  ["총 포지션 수량", "5.57 ETH"],
  ["최종 진입 시 포지션 가치", "12,819.54 USDT"],
  ["실제 투입 원금", "1,000.00 USDT"],
  ["미실현 수익 포함 총 자산", "2,296.92 USDT"],
  ["수수료 포함 본전가", "2,068.45"],
  ["누적 진입 수수료", "6.33 USDT"],
];

test.describe("피라미딩 터미널 — 프로덕션 빌드의 실제 브라우저에서 경로 차트·배치·다크 테마·글꼴·기본 흐름이 보인다", () => {
  test.describe("처음 연 화면과 입력 갱신", () => {
    /**
     * @spec DoD-41
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 저장 상태 없는 새 브라우저 컨텍스트에서 처음 연다(기준 사례 P1 초기 입력)
     * @when 아무 입력도 바꾸지 않고 `포지션 요약` 영역을 본다
     * @then 평균 진입가가 `2,066.17`이고 보조 문구가 `최초 진입 대비 +8.74% 이동`이다
     * @then 추정 청산가가 `1,895.20`이다
     * @then 실효 레버리지가 `12.81×`이고 보조 문구가 `최초 5× → 12.81× 노출`이다
     * @then 총 포지션 수량이 `5.57 ETH`이다
     * @then 최종 진입 시 포지션 가치가 `12,819.54 USDT`이다
     * @then 실제 투입 원금이 `1,000.00 USDT`이다
     * @then 미실현 수익 포함 총 자산이 `2,296.92 USDT`이다
     * @then 수수료 포함 본전가가 `2,068.45`이다
     * @then 누적 진입 수수료가 `6.33 USDT`이다
     */
    test("[DoD-41] 처음 열면 포지션 요약에 P1 표시값이 보인다", async ({ page }) => {
      // given: 새 컨텍스트에서 / 로 이동한다
      // when: `포지션 요약` region 범위를 본다
      // then: 요약 9항목과 보조 문구 2개가 P1 표시값과 같다
      await page.goto("/");

      const summary = regionOf(page, "포지션 요약");
      await expect(summary).toBeVisible();
      for (const [name, value] of P1_SUMMARY) {
        await expect(summaryValue(page, name), name).toHaveText(value);
      }
      await expect(summary.getByText("최초 진입 대비 +8.74% 이동", { exact: true })).toBeVisible();
      await expect(summary.getByText("최초 5× → 12.81× 노출", { exact: true })).toBeVisible();
    });

    /**
     * @spec DoD-41
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 새 브라우저 컨텍스트에서 처음 열어 포지션 요약에 P1 표시값이 보인다
     * @when 계산 버튼 없이 `최초 진입가` 입력란의 값을 1900에서 1800으로 바꾼다
     * @then 계산 버튼을 누르지 않아도 포지션 요약의 평균 진입가가 P1 표시값 `2,066.17`과 다른 값으로 갱신된다
     * @then 포지션 요약의 추정 청산가가 P1 표시값 `1,895.20`과 다른 값으로 갱신된다
     */
    test("[DoD-41] 최초 진입가를 바꾸면 포지션 요약값이 갱신된다", async ({ page }) => {
      // given: / 로 이동하고 요약이 P1 값임을 확인한다
      // when: `포지션 설정`의 `최초 진입가`를 1800으로 바꾼다
      // then: 평균 진입가·추정 청산가가 P1 값에서 바뀐다
      await page.goto("/");

      // given: 처음 연 화면의 요약이 P1 값이다
      await expect(summaryValue(page, "평균 진입가")).toHaveText("2,066.17");
      await expect(summaryValue(page, "추정 청산가")).toHaveText("1,895.20");

      // when: 계산 버튼 없이 최초 진입가만 1800으로 바꾼다
      const entry = regionOf(page, "포지션 설정").getByRole("textbox", {
        name: "최초 진입가",
        exact: true,
      });
      await entry.fill("1800");
      await expect(entry).toHaveValue("1800");

      // then: 요약값이 P1 값에서 바뀐다(값이 비거나 대시가 아닌 다른 숫자 표시)
      for (const [name, p1] of [
        ["평균 진입가", "2,066.17"],
        ["추정 청산가", "1,895.20"],
      ] as const) {
        const value = summaryValue(page, name);
        await expect(value, name).not.toHaveText(p1);
        await expect(value, name).toHaveText(/^\d{1,3}(,\d{3})*\.\d{2}$/);
      }
    });
  });

  test.describe("경로 차트", () => {
    /**
     * @spec DoD-21
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 새 브라우저 컨텍스트에서 처음 연다(P1: 최초 진입 + 포함된 추가 진입 2단계)
     * @when `포지션 경로` 영역의 차트를 본다
     * @then 실제 브라우저에서 SVG 선 3개(진입가·누적 평단·청산가)가 렌더된다
     * @then 각 선은 최초 진입·1차·2차 추가 진입 순서대로 점 3개를 잇는다
     * @then 범례에 진입가·누적 평단·청산가 세 계열이 보인다
     */
    test("[DoD-21] 처음 연 화면의 경로 차트에 선 3개와 범례가 보인다", async ({ page }) => {
      // given: / 로 이동한다
      // when: `포지션 경로` region 안의 차트를 본다
      // then: 선 3개, 선마다 점 3개, 범례 3계열
      await page.goto("/");

      await expectChartLines(page, ["최초 진입", "1차 추가 진입", "2차 추가 진입"]);

      const legend = chartOf(page).locator(".recharts-legend-wrapper");
      await expect(legend).toBeVisible();
      for (const label of ["진입가", "누적 평단", "청산가"]) {
        await expect(legend.getByText(label, { exact: true })).toBeVisible();
      }
    });

    /**
     * @spec DoD-21
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 새 브라우저 컨텍스트에서 처음 연다(P1)
     * @when 경로 차트에서 2차 추가 진입 지점에 포인터를 올린다
     * @then 툴팁이 나타나 진입가·누적 평단·청산가 세 항목을 보여 준다
     * @then 툴팁의 청산가는 DoD-19의 틱에 맞춘 값 `1,895.20`이다
     */
    test("[DoD-21] 경로 차트 지점에 포인터를 올리면 툴팁에 세 값과 틱 청산가가 보인다", async ({
      page,
    }) => {
      // given: / 로 이동한다
      // when: 차트의 2차 추가 진입 지점에 hover 한다
      // then: 툴팁에 세 계열 값, 청산가 1,895.20
      await page.goto("/");
      await expectChartLines(page, ["최초 진입", "1차 추가 진입", "2차 추가 진입"]);

      // when: 2차 추가 진입 지점(각 선의 세 번째 점)에 포인터를 올린다
      await dotGroupsOf(page).first().locator("circle.recharts-line-dot").nth(2).hover({
        force: true,
      });

      const tooltip = chartOf(page).locator(".recharts-tooltip-wrapper");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("2차 추가 진입");
      // 세 항목: 항목 행은 `{계열 이름}{가격}` 글자로 이뤄진다
      for (const label of ["진입가", "누적 평단", "청산가"]) {
        await expect(
          tooltip.locator("div").filter({ hasText: new RegExp(`^${label}[0-9,.]+$`) }),
          label,
        ).not.toHaveCount(0);
      }
      // 청산가는 틱 값 1,895.20
      await expect(tooltip.locator("div").filter({ hasText: /^청산가1,895\.20$/ })).not.toHaveCount(
        0,
      );
    });

    /**
     * @spec DoD-21
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 새 브라우저 컨텍스트에서 처음 연다(P1)
     * @when `2차 추가 진입가` 입력란을 비워 2차 단계를 제외한다(EC-12)
     * @then 경로 차트의 SVG 선 3개가 계속 렌더된다
     * @then 각 선은 최초 진입·1차 추가 진입의 점 2개만 있고 제외된 2차 단계의 점은 없다
     */
    test("[DoD-21] 제외된 단계는 경로 차트에 점이 없다", async ({ page }) => {
      // given: / 로 이동한다
      // when: `2차 추가 진입가`를 비운다
      // then: 선 3개, 선마다 점 2개
      await page.goto("/");
      await expectChartLines(page, ["최초 진입", "1차 추가 진입", "2차 추가 진입"]);

      // when: 2차 추가 진입가를 비워 2차 단계를 제외한다(EC-12)
      const price = regionOf(page, "추가 진입").getByRole("textbox", {
        name: "2차 추가 진입가",
        exact: true,
      });
      await price.fill("");
      await expect(price).toHaveValue("");

      // then: 선 3개는 남고 점은 최초 진입·1차 두 개뿐이다
      await expectChartLines(page, ["최초 진입", "1차 추가 진입"]);
    });
  });

  test.describe("너비별 배치", () => {
    /**
     * @spec DoD-37
     * @given 너비 1280px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 연다
     * @when region 배치를 본다
     * @then `포지션 설정` | `포지션 요약`·`포지션 경로` | `익절`·`손절`이 왼쪽에서 오른쪽으로 3열로 나란히 놓인다
     * @then `포지션 요약`과 `포지션 경로`는 같은 열에서 위아래로, `익절`과 `손절`은 같은 열에서 위아래로 놓인다
     */
    test("[DoD-37] 1280px에서 설정 | 요약·경로 | 익절·손절 3열로 배치된다", async ({ browser }) => {
      // given: viewport 1280 컨텍스트로 / 를 연다
      // when: 각 region의 위치를 본다
      // then: 3열 배치
      await withWidth(browser, 1280, async (page) => {
        const setup = await boxOf(regionOf(page, "포지션 설정"));
        const summary = await boxOf(regionOf(page, "포지션 요약"));
        const path = await boxOf(regionOf(page, "포지션 경로"));
        const take = await boxOf(regionOf(page, "익절"));
        const stop = await boxOf(regionOf(page, "손절"));

        // 3열이 왼쪽→오른쪽으로 나란히(세 열의 위쪽이 같다)
        expect(right(setup)).toBeLessThanOrEqual(summary.x + EPS);
        expect(right(summary)).toBeLessThanOrEqual(take.x + EPS);
        expect(Math.abs(setup.y - summary.y)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(summary.y - take.y)).toBeLessThanOrEqual(EPS);

        // 요약·경로는 같은 열 위아래
        expect(Math.abs(path.x - summary.x)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(path.width - summary.width)).toBeLessThanOrEqual(EPS);
        expect(path.y).toBeGreaterThanOrEqual(bottom(summary) - EPS);

        // 익절·손절은 같은 열 위아래
        expect(Math.abs(stop.x - take.x)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(stop.width - take.width)).toBeLessThanOrEqual(EPS);
        expect(stop.y).toBeGreaterThanOrEqual(bottom(take) - EPS);
      });
    });

    /**
     * @spec DoD-37
     * @given 너비 768px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 연다(기준점 1150px 이하·720px 초과)
     * @when region 배치를 본다
     * @then `포지션 설정` | `포지션 요약`·`포지션 경로`가 2열로 나란히 놓인다
     * @then `익절`·`손절`은 두 열 아래에 전체 폭으로 놓인다
     */
    test("[DoD-37] 768px에서 2열이고 익절·손절은 아래 전체 폭에 배치된다", async ({ browser }) => {
      // given: viewport 768 컨텍스트로 / 를 연다
      // when: 각 region의 위치·폭을 본다
      // then: 2열 + 아래 전체 폭
      await withWidth(browser, 768, async (page) => {
        const setup = await boxOf(regionOf(page, "포지션 설정"));
        const steps = await boxOf(regionOf(page, "추가 진입"));
        const summary = await boxOf(regionOf(page, "포지션 요약"));
        const path = await boxOf(regionOf(page, "포지션 경로"));
        const take = await boxOf(regionOf(page, "익절"));
        const stop = await boxOf(regionOf(page, "손절"));

        // 설정 | 요약·경로 2열
        expect(right(setup)).toBeLessThanOrEqual(summary.x + EPS);
        expect(Math.abs(setup.y - summary.y)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(path.x - summary.x)).toBeLessThanOrEqual(EPS);
        expect(path.y).toBeGreaterThanOrEqual(bottom(summary) - EPS);

        // 익절·손절은 두 열 아래
        const columnsBottom = Math.max(bottom(setup), bottom(steps), bottom(path));
        expect(take.y).toBeGreaterThanOrEqual(columnsBottom - EPS);
        expect(stop.y).toBeGreaterThanOrEqual(columnsBottom - EPS);

        // 익절·손절이 차지하는 범위가 두 열 전체 폭(설정 왼쪽 끝 ~ 요약 오른쪽 끝)
        expect(Math.abs(Math.min(take.x, stop.x) - setup.x)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(Math.max(right(take), right(stop)) - right(summary))).toBeLessThanOrEqual(
          EPS,
        );
      });
    });

    /**
     * @spec DoD-37
     * @given 너비 375px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 연다(기준점 720px 이하)
     * @when region 배치를 본다
     * @then `포지션 설정`·`포지션 요약`·`포지션 경로`·`익절`·`손절`이 1열로 위아래로 놓인다
     */
    test("[DoD-37] 375px에서 1열로 배치된다", async ({ browser }) => {
      // given: viewport 375 컨텍스트로 / 를 연다
      // when: 각 region의 위치를 본다
      // then: 1열 배치
      await withWidth(browser, 375, async (page) => {
        const names = ["포지션 설정", "포지션 요약", "포지션 경로", "익절", "손절"];
        const boxes: Box[] = [];
        for (const name of names) boxes.push(await boxOf(regionOf(page, name)));

        const [first] = boxes;
        for (let i = 1; i < boxes.length; i += 1) {
          // 같은 열(왼쪽 끝·폭이 같다)
          expect(Math.abs(boxes[i].x - first.x), names[i]).toBeLessThanOrEqual(EPS);
          expect(Math.abs(boxes[i].width - first.width), names[i]).toBeLessThanOrEqual(EPS);
          // 앞 region 아래
          expect(boxes[i].y, names[i]).toBeGreaterThanOrEqual(bottom(boxes[i - 1]) - EPS);
        }
      });
    });

    /**
     * @spec DoD-38
     * @given 너비 1280px·768px·375px 뷰포트의 새 브라우저 컨텍스트를 하나씩 만들어 / 화면을 연다
     * @when 각 너비에서 문서의 가로 폭을 본다
     * @then 각 너비에서 가로 스크롤이 생기지 않는다(문서의 scrollWidth가 문서의 clientWidth를 넘지 않는다)
     */
    test("[DoD-38] 1280·768·375px에서 가로 스크롤이 생기지 않는다", async ({ browser }) => {
      // given: 너비 목록 [1280, 768, 375]를 하나씩 반복한다
      // when: 문서 scrollWidth·clientWidth를 본다
      // then: 가로 스크롤 없음
      for (const width of [1280, 768, 375]) {
        await test.step(`너비 ${width}px`, async () => {
          await withWidth(browser, width, async (page) => {
            await expect(chartOf(page).locator("path.recharts-line-curve")).toHaveCount(3);
            const { scrollWidth, clientWidth } = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
            }));
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
          });
        });
      }
    });
  });

  test.describe("다크 고정 테마와 글꼴", () => {
    /**
     * @spec DoD-39
     * @given 시스템 색 구성표를 라이트로 에뮬레이션한(colorScheme light) 새 브라우저 컨텍스트에서 / 화면을 연다
     * @when 화면 배경색을 본다
     * @then 배경이 라이트 색이 아니라 시안의 어두운 색(`#10151b` 계열 토큰)이다
     */
    test("[DoD-39] 시스템 색 구성표가 라이트여도 배경이 어두운 색이다", async ({ browser }) => {
      // given: colorScheme light 컨텍스트로 / 를 연다
      // when: 본문 배경의 계산된 색을 본다
      // then: #10151b 계열 어두운 색
      const context = await browser.newContext({ colorScheme: "light" });
      try {
        const page = await context.newPage();
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        // 에뮬레이션이 라이트로 걸려 있다
        expect(
          await page.evaluate(() => window.matchMedia("(prefers-color-scheme: light)").matches),
        ).toBe(true);

        // body 배경이 #10151b(rgb 16, 21, 27)이다
        const background = await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(await srgbOf(page, background)).toEqual([16, 21, 27, 255]);
      } finally {
        await context.close();
      }
    });

    /**
     * @spec DoD-40
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 새 브라우저 컨텍스트에서 연다
     * @when 글꼴 로드가 끝난 뒤 본문 글꼴과 포지션 요약 숫자의 글꼴 속성을 본다
     * @then Pretendard 글꼴이 로드된 상태다(document.fonts에서 로드 완료)
     * @then Pretendard 글꼴은 외부 CDN이 아닌 앱 자체 경로에서 받은 가변 woff2다
     * @then 본문의 계산된 font-family가 Pretendard를 첫 글꼴로 쓴다
     * @then 숫자 표시(포지션 요약 값)의 계산된 font-variant-numeric이 tabular-nums다
     */
    test("[DoD-40] 본문 글꼴은 직접 호스팅한 Pretendard이고 숫자는 tabular-nums다", async ({
      page,
    }) => {
      // given: / 로 이동한다
      // when: 글꼴 로드 완료를 기다린 뒤 계산된 스타일을 본다
      // then: Pretendard 로드, 같은 출처 woff2, font-family, tabular-nums
      await page.goto("/");
      await expect(summaryValue(page, "평균 진입가")).toHaveText("2,066.17");

      // Pretendard 글꼴이 로드 완료 상태다
      await expect
        .poll(() =>
          page.evaluate(async () => {
            await document.fonts.ready;
            return [...document.fonts].some(
              (font) =>
                font.family.replace(/["']/g, "") === "Pretendard" && font.status === "loaded",
            );
          }),
        )
        .toBe(true);

      // 앱 자체 경로(같은 출처의 /_next/static/media/)에서 받은 가변 woff2다
      await expect
        .poll(() =>
          page.evaluate(() =>
            performance
              .getEntriesByType("resource")
              .map((entry) => new URL(entry.name))
              .some(
                (url) =>
                  url.origin === location.origin &&
                  /^\/_next\/static\/media\/PretendardVariable[^/]*\.woff2$/.test(url.pathname),
              ),
          ),
        )
        .toBe(true);

      // 본문의 계산된 font-family 첫 글꼴이 Pretendard다
      const family = await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family.split(",")[0].trim().replace(/["']/g, "")).toBe("Pretendard");

      // 숫자 표시(포지션 요약 값)가 tabular-nums다
      for (const [name] of P1_SUMMARY) {
        const numeric = await summaryValue(page, name).evaluate(
          (el) => getComputedStyle(el).fontVariantNumeric,
        );
        expect(numeric, name).toContain("tabular-nums");
      }
    });
  });
});
