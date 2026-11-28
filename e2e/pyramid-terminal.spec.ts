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

/** 1열 배치와 문서 순서의 기준(DoD-37). */
const ONE_COLUMN_ORDER = ["포지션 설정", "포지션 요약", "추가 진입", "포지션 경로", "익절", "손절"];

/** 경로 표를 직접 감싼 가로 스크롤 영역. */
function pathScrollerOf(page: Page): Locator {
  return regionOf(page, "포지션 경로").locator("table").locator("xpath=..");
}

/** 두 번의 animation frame을 기다린다(scrollLeft 변경 뒤 scroll 이벤트·렌더 반영 대기). */
async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

type FadeState = { visible: boolean; right: number | null; scrollerRight: number };

/**
 * 페이드 단서 판정(DoD-47 @given의 정의).
 * 후보: 스크롤 영역의 부모 범위 안에서 계산된 background-image 또는 mask-image(-webkit-mask-image)가 gradient인
 * 요소·의사 요소(스크롤 영역 자신 포함).
 * `보인다`: 크기가 0이 아니고 opacity > 0, visibility visible이며, background gradient에 불투명 정지점이 있거나
 * mask gradient 오른쪽 끝 alpha < 1이다.
 */
async function fadeStateOf(page: Page): Promise<FadeState> {
  return pathScrollerOf(page).evaluate((scroller) => {
    const COLOR = /(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^()]*\)/g;
    const alphaOf = (color: string): number => {
      const inner = color.slice(color.indexOf("(") + 1, -1);
      if (inner.includes("/")) {
        const a = inner.split("/")[1].trim();
        return a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
      }
      const parts = inner.split(",");
      if (parts.length === 4) return parseFloat(parts[3]);
      return 1;
    };
    const isGradient = (v: string) => v.includes("gradient(");
    const hasOpaqueStop = (v: string) => (v.match(COLOR) ?? []).some((c) => alphaOf(c) >= 0.999);
    const maskRightAlpha = (v: string): number => {
      const alphas = (v.match(COLOR) ?? []).map(alphaOf);
      if (alphas.length === 0) return 1;
      if (/to left/.test(v)) return alphas[0];
      return alphas[alphas.length - 1];
    };

    const root = scroller.parentElement ?? scroller;
    const scrollerRight = scroller.getBoundingClientRect().right;
    const elements = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const el of elements) {
      for (const pseudo of [null, "::before", "::after"] as const) {
        const style = getComputedStyle(el, pseudo);
        if (pseudo !== null && style.content === "none") continue;
        const bg = style.backgroundImage;
        const mask =
          style.maskImage && style.maskImage !== "none" ? style.maskImage : style.webkitMaskImage;
        const bgGradient = isGradient(bg);
        const maskGradient = !!mask && isGradient(mask);
        if (!bgGradient && !maskGradient) continue;

        const rect = el.getBoundingClientRect();
        const width = pseudo === null ? rect.width : parseFloat(style.width) || rect.width;
        const height = pseudo === null ? rect.height : parseFloat(style.height) || rect.height;
        const visible =
          width > 0 &&
          height > 0 &&
          parseFloat(style.opacity) > 0 &&
          style.visibility === "visible" &&
          ((bgGradient && hasOpaqueStop(bg)) || (maskGradient && maskRightAlpha(mask) < 1));
        if (visible) return { visible: true, right: rect.right, scrollerRight };
      }
    }
    return { visible: false, right: null, scrollerRight };
  });
}

/** 계산된 배경색을 sRGB 8비트 [r, g, b, a]로 읽는다. */
async function backgroundOf(locator: Locator): Promise<number[]> {
  const color = await locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  return srgbOf(locator.page(), color);
}

/** :root 토큰 색을 sRGB 8비트로 읽는다. */
async function tokenColorOf(page: Page, token: string): Promise<number[]> {
  const color = await page.evaluate((name) => {
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    try {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    } finally {
      probe.remove();
    }
  }, token);
  return srgbOf(page, color);
}

/** RGB 채널마다 차이가 ±1 이내면 같다(불투명도 무시, DoD-48 @given). */
function sameRgb(a: readonly number[], b: readonly number[]): boolean {
  return [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= 1);
}

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
      await chartOf(page).scrollIntoViewIfNeeded();
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
     * @then `포지션 설정`·`포지션 요약`·`추가 진입`·`포지션 경로`·`익절`·`손절` 6개 region이 같은 왼쪽 끝·폭의 1열로 위아래로 놓인다
     * @then 위에서 아래 순서가 `포지션 설정 → 포지션 요약 → 추가 진입 → 포지션 경로 → 익절 → 손절`이다(각 region의 위쪽이 앞 region의 아래쪽 이상)
     * @then 6개 region의 문서(DOM) 순서도 `포지션 설정 → 포지션 요약 → 추가 진입 → 포지션 경로 → 익절 → 손절`이다
     */
    test("[DoD-37] 375px에서 1열로 배치된다", async ({ browser }) => {
      // given: viewport 375 컨텍스트로 / 를 연다
      // when: 6개 region의 boundingBox와 문서 순서를 본다
      // then: 같은 열, 위→아래 순서, DOM 순서가 모두 설정 → 요약 → 추가 진입 → 경로 → 익절 → 손절
      await withWidth(browser, 375, async (page) => {
        const boxes: Box[] = [];
        for (const name of ONE_COLUMN_ORDER) boxes.push(await boxOf(regionOf(page, name)));

        const [first] = boxes;
        for (let i = 1; i < boxes.length; i += 1) {
          const name = ONE_COLUMN_ORDER[i];
          // 같은 열(왼쪽 끝·폭이 같다)
          expect(Math.abs(boxes[i].x - first.x), name).toBeLessThanOrEqual(EPS);
          expect(Math.abs(boxes[i].width - first.width), name).toBeLessThanOrEqual(EPS);
          // 앞 region 아래
          expect(boxes[i].y, name).toBeGreaterThanOrEqual(bottom(boxes[i - 1]) - EPS);
        }

        // 문서(DOM) 순서: region 목록은 문서 순서로 나온다
        const domOrder = await page.getByRole("region").evaluateAll((els) =>
          els.map((el) => {
            const labelledBy = el.getAttribute("aria-labelledby");
            const label = labelledBy === null ? null : document.getElementById(labelledBy);
            return (label?.textContent ?? el.getAttribute("aria-label") ?? "").trim();
          }),
        );
        expect(domOrder.filter((name) => ONE_COLUMN_ORDER.includes(name))).toEqual(
          ONE_COLUMN_ORDER,
        );
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

  test.describe("화면 다듬기", () => {
    /**
     * @spec DoD-47
     * @given 너비 375px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 연다(P1, 경로 표 8열이 `포지션 경로` 영역보다 넓다). 페이드 단서는 계산된 스타일에 드러나는 구현을 전제한다(`background-attachment: local`처럼 스크롤해도 계산된 스타일이 바뀌지 않는 기법은 이 판정 대상이 아니다). 단서 후보는 계산된 background-image 또는 mask-image(-webkit-mask-image)가 gradient인 요소·의사 요소, 또는 스크롤 컨테이너 자신이다. `보인다` = 단서 후보의 크기가 0이 아니고 opacity > 0이며 visibility가 visible이고, background-image gradient에 불투명 정지점이 있거나 mask-image 오른쪽 끝 alpha가 1 미만이다. `사라진다` = `보인다` 조건이 거짓이다(요소 숨김·opacity 0·크기 0, 또는 mask-image 오른쪽 끝 alpha가 1)
     * @when 경로 표의 가로 스크롤 위치가 왼쪽 끝인 처음 상태를 본다
     * @then 경로 표를 감싼 스크롤 영역의 scrollWidth가 clientWidth보다 커서 가로로 스크롤할 수 있다
     * @then 문서 자체에는 가로 스크롤이 생기지 않는다(표만 영역 안에서 스크롤된다)
     * @then 스크롤 영역 오른쪽 끝의 페이드 그라데이션 단서가 `보인다`이고, 그 오른쪽 끝이 스크롤 영역 오른쪽 끝과 맞닿는다
     */
    test("[DoD-47] 375px에서 경로 표가 가로 스크롤되고 오른쪽 끝에 페이드 단서가 보인다", async ({
      browser,
    }) => {
      // given: viewport 375 컨텍스트로 / 를 연다
      // when: `포지션 경로` region의 표 스크롤 영역을 본다
      // then: scrollWidth > clientWidth, 오른쪽 끝 페이드 단서 보임
      await withWidth(browser, 375, async (page) => {
        const scroller = pathScrollerOf(page);
        await scroller.scrollIntoViewIfNeeded();

        // 표 스크롤 영역은 가로로 스크롤할 수 있고 처음 위치는 왼쪽 끝이다
        const metrics = await scroller.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollLeft: el.scrollLeft,
        }));
        expect(metrics.scrollLeft).toBe(0);
        expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

        // 문서 자체에는 가로 스크롤이 없다
        const doc = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);

        // 오른쪽 끝 페이드 단서가 `보인다`이고 스크롤 영역 오른쪽 끝과 맞닿는다
        await expect.poll(async () => (await fadeStateOf(page)).visible).toBe(true);
        const fade = await fadeStateOf(page);
        expect(fade.right).not.toBeNull();
        expect(Math.abs((fade.right ?? 0) - fade.scrollerRight)).toBeLessThanOrEqual(EPS);
      });
    });

    /**
     * @spec DoD-47
     * @given 너비 375px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 열고 경로 표 첫 열(진입 단계) 셀의 왼쪽 위치를 기록한다. 페이드 단서는 계산된 스타일에 드러나는 구현을 전제한다(`background-attachment: local`처럼 스크롤해도 계산된 스타일이 바뀌지 않는 기법은 이 판정 대상이 아니다). 단서 후보는 계산된 background-image 또는 mask-image(-webkit-mask-image)가 gradient인 요소·의사 요소, 또는 스크롤 컨테이너 자신이다. `보인다` = 단서 후보의 크기가 0이 아니고 opacity > 0이며 visibility가 visible이고, background-image gradient에 불투명 정지점이 있거나 mask-image 오른쪽 끝 alpha가 1 미만이다. `사라진다` = `보인다` 조건이 거짓이다(요소 숨김·opacity 0·크기 0, 또는 mask-image 오른쪽 끝 alpha가 1)
     * @when 경로 표 스크롤 영역을 먼저 오른쪽에 열이 남는 중간 위치(최대 scrollLeft의 절반)로, 이어서 오른쪽 끝까지(scrollLeft = scrollWidth − clientWidth) 가로 스크롤한다
     * @then 중간 위치에서는 오른쪽 끝의 페이드 그라데이션 단서가 계속 `보인다`이다
     * @then 첫 열 머리글 `진입 단계`와 첫 열 셀(`최초 진입`·`1차 추가 진입`·`2차 추가 진입`)이 스크롤 전과 같은 왼쪽 위치(스크롤 영역 왼쪽 끝)에 보인다
     * @then 마지막 열 `추가 수량`이 스크롤 영역 안에 보이고 첫 열과 겹쳐 가려지지 않는다
     * @then 오른쪽 끝까지 스크롤하면 페이드 그라데이션 단서가 `사라진다`이다
     */
    test("[DoD-47] 경로 표를 끝까지 가로 스크롤하면 첫 열은 고정되고 페이드 단서가 사라진다", async ({
      browser,
    }) => {
      // given: viewport 375 컨텍스트로 / 를 열고 첫 열 위치를 잰다
      // when: 표 스크롤 영역을 중간(최대 scrollLeft의 절반) → 오른쪽 끝 순서로 스크롤한다
      // then: 중간에서 페이드 보임, 끝에서 첫 열 위치 그대로·마지막 열 `추가 수량` 보임·페이드 사라짐
      await withWidth(browser, 375, async (page) => {
        const path = regionOf(page, "포지션 경로");
        const scroller = pathScrollerOf(page);
        await scroller.scrollIntoViewIfNeeded();

        const firstHeader = path.getByRole("columnheader", { name: "진입 단계", exact: true });
        const rowHeaders = path.getByRole("rowheader");
        await expect(rowHeaders).toHaveText(["최초 진입", "1차 추가 진입", "2차 추가 진입"]);
        const firstColumn = [firstHeader, ...[0, 1, 2].map((i) => rowHeaders.nth(i))];
        const before: number[] = [];
        for (const cell of firstColumn) before.push((await boxOf(cell)).x);

        // 중간 위치(최대 scrollLeft의 절반): 오른쪽에 열이 남아 페이드 단서가 계속 `보인다`
        await scroller.evaluate((el) => {
          el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
        });
        await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        await nextFrames(page);
        await expect.poll(async () => (await fadeStateOf(page)).visible).toBe(true);

        // 오른쪽 끝까지 스크롤한다
        await scroller.evaluate((el) => {
          el.scrollLeft = el.scrollWidth - el.clientWidth;
        });
        await expect
          .poll(() =>
            scroller.evaluate((el) => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1),
          )
          .toBe(true);
        await nextFrames(page);

        // 첫 열은 스크롤 전과 같은 왼쪽 위치(스크롤 영역 왼쪽 끝)에 있다
        const scrollerBox = await boxOf(scroller);
        for (let i = 0; i < firstColumn.length; i += 1) {
          const x = (await boxOf(firstColumn[i])).x;
          expect(Math.abs(x - before[i]), `첫 열 ${i}`).toBeLessThanOrEqual(EPS);
          expect(Math.abs(x - scrollerBox.x), `첫 열 ${i}`).toBeLessThanOrEqual(EPS);
        }

        // 마지막 열 `추가 수량`이 스크롤 영역 안에 보이고 첫 열과 겹치지 않는다
        const lastHeader = path.getByRole("columnheader", { name: "추가 수량", exact: true });
        const last = await boxOf(lastHeader);
        const firstBox = await boxOf(firstHeader);
        expect(last.x).toBeGreaterThanOrEqual(scrollerBox.x - EPS);
        expect(right(last)).toBeLessThanOrEqual(right(scrollerBox) + EPS);
        expect(last.x).toBeGreaterThanOrEqual(right(firstBox) - EPS);
        const hit = await lastHeader.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return target !== null && el.contains(target);
        });
        expect(hit).toBe(true);

        // 페이드 단서가 `사라진다`
        await expect.poll(async () => (await fadeStateOf(page)).visible).toBe(false);
      });
    });

    /**
     * @spec DoD-48
     * @given 프로덕션 빌드로 띄운 앱의 / 화면을 새 브라우저 컨텍스트에서 처음 연다(방향 롱 선택). 색은 계산된 배경색을 canvas sRGB 8비트로 바꿔 비교하고, `같다`는 RGB 채널마다 차이 ±1 이내, `다르다`는 어느 한 채널이라도 차이가 1을 넘는 것이다(불투명도 차이는 허용)
     * @when 처음 상태에서 `방향` 그룹의 `롱`·`숏`과 `포지션 설정` 패널의 배경색, `--primary` 토큰 색을 비교하고, 이어서 `숏`을 누른 뒤 같은 비교를 다시 한다
     * @then 처음 상태에서 선택된 `롱`의 배경색이 선택되지 않은 `숏`의 배경색과 다르다
     * @then 처음 상태에서 선택된 `롱`의 배경색이 `포지션 설정` 패널의 배경색과 다르다
     * @then 처음 상태에서 선택된 `롱`의 배경색 RGB 성분이 `--primary` 토큰 색의 RGB 성분과 같다
     * @then `숏`을 누른 뒤 선택된 `숏`의 배경색 RGB 성분이 `--primary` 토큰 색의 RGB 성분과 같다
     * @then `숏`을 누른 뒤 선택된 `숏`의 배경색이 선택되지 않은 `롱`의 배경색과 다르고 `포지션 설정` 패널의 배경색과도 다르다
     */
    test("[DoD-48] 방향 토글의 선택 항목 배경이 primary 계열로 비선택 항목·패널과 다르다", async ({
      page,
    }) => {
      // given: / 로 이동한다
      // when: 롱·숏 버튼과 패널의 computed backgroundColor, --primary 토큰을 sRGB로 읽고, `숏`을 눌러 다시 읽는다
      // then: 처음 롱 = primary·롱 ≠ 숏·롱 ≠ 패널, 숏 누른 뒤 숏 = primary·숏 ≠ 롱·숏 ≠ 패널
      await page.goto("/");

      const setup = regionOf(page, "포지션 설정");
      const side = setup.getByRole("group", { name: "방향", exact: true });
      const long = side.getByRole("button", { name: "롱", exact: true });
      const short = side.getByRole("button", { name: "숏", exact: true });
      await expect(long).toBeVisible();
      const primary = await tokenColorOf(page, "--primary");
      const panel = await backgroundOf(setup);

      // 처음 상태: 롱 선택
      await expect.poll(async () => sameRgb(await backgroundOf(long), primary)).toBe(true);
      const longFirst = await backgroundOf(long);
      const shortFirst = await backgroundOf(short);
      expect(sameRgb(longFirst, shortFirst), "롱 ≠ 숏").toBe(false);
      expect(sameRgb(longFirst, panel), "롱 ≠ 패널").toBe(false);
      expect(sameRgb(longFirst, primary), "롱 = primary").toBe(true);

      // 숏을 누르고 포인터를 치워 hover 색과 색 전이가 끝난 상태를 본다
      await short.click();
      await page.mouse.move(0, 0);
      await expect.poll(async () => sameRgb(await backgroundOf(short), primary)).toBe(true);
      await expect.poll(async () => sameRgb(await backgroundOf(long), primary)).toBe(false);
      const longAfter = await backgroundOf(long);
      const shortAfter = await backgroundOf(short);
      expect(sameRgb(shortAfter, primary), "숏 = primary").toBe(true);
      expect(sameRgb(shortAfter, longAfter), "숏 ≠ 롱").toBe(false);
      expect(sameRgb(shortAfter, panel), "숏 ≠ 패널").toBe(false);
    });

    /**
     * @spec DoD-50
     * @given 너비 375px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 연다(P1, 단계 2개)
     * @when 버튼 `1차 추가 진입 삭제`·`2차 추가 진입 삭제`·`수수료 설정`·`방향` 그룹의 `롱`·`숏`·`계산 기준`마다 누를 수 있는 영역(버튼 boundingBox와 그 ::before·::after 의사 요소의 계산된 영역을 합친 사각형)을 잰다
     * @then 각 버튼의 누를 수 있는 영역은 너비 44px 이상, 높이 44px 이상이다
     * @then 각 영역의 중심과 네 모서리 안쪽 1px 지점에서 document.elementFromPoint가 그 버튼(또는 그 자손)을 가리킨다
     * @then 서로 다른 두 버튼의 누를 수 있는 영역이 겹치지 않는다(모든 쌍의 사각형 교집합 넓이가 0)
     */
    test("[DoD-50] 375px에서 단계 삭제·수수료 설정·방향·계산 기준 버튼의 누를 수 있는 영역이 44×44 이상이고 겹치지 않는다", async ({
      browser,
    }) => {
      // given: viewport 375 컨텍스트로 / 를 연다
      // when: 버튼 6개의 boundingBox와 ::before·::after 영역을 합쳐 잰다
      // then: 44×44 이상, elementFromPoint 일치, 쌍마다 겹침 없음
      await withWidth(browser, 375, async (page) => {
        const side = regionOf(page, "포지션 설정").getByRole("group", {
          name: "방향",
          exact: true,
        });
        const targets: Array<readonly [string, Locator]> = [
          [
            "1차 추가 진입 삭제",
            page.getByRole("button", { name: "1차 추가 진입 삭제", exact: true }),
          ],
          [
            "2차 추가 진입 삭제",
            page.getByRole("button", { name: "2차 추가 진입 삭제", exact: true }),
          ],
          ["수수료 설정", page.getByRole("button", { name: "수수료 설정", exact: true })],
          ["롱", side.getByRole("button", { name: "롱", exact: true })],
          ["숏", side.getByRole("button", { name: "숏", exact: true })],
          ["계산 기준", page.getByRole("button", { name: "계산 기준", exact: true })],
        ];

        type Area = { left: number; top: number; right: number; bottom: number };
        const areas: Area[] = [];
        for (const [name, button] of targets) {
          await expect(button, name).toBeVisible();
          // 측정 전에 버튼을 화면 안으로 스크롤한다(elementFromPoint는 화면 안 좌표만 판정한다)
          await button.scrollIntoViewIfNeeded();
          const measured = await button.evaluate((el) => {
            const host = el.getBoundingClientRect();
            let left = host.left;
            let top = host.top;
            let rightEdge = host.right;
            let bottomEdge = host.bottom;
            // ::before·::after 의사 요소의 계산된 영역을 합친다(절대 위치면 버튼 padding box 기준)
            for (const pseudo of ["::before", "::after"]) {
              const style = getComputedStyle(el, pseudo);
              if (style.content === "none" || style.display === "none") continue;
              if (style.position !== "absolute") continue;
              const width = parseFloat(style.width);
              const height = parseFloat(style.height);
              const offsetLeft = parseFloat(style.left);
              const offsetTop = parseFloat(style.top);
              if ([width, height, offsetLeft, offsetTop].some((v) => Number.isNaN(v))) continue;
              const pLeft = host.left + el.clientLeft + offsetLeft;
              const pTop = host.top + el.clientTop + offsetTop;
              left = Math.min(left, pLeft);
              top = Math.min(top, pTop);
              rightEdge = Math.max(rightEdge, pLeft + width);
              bottomEdge = Math.max(bottomEdge, pTop + height);
            }
            // 중심과 네 모서리 안쪽 1px 지점에서 elementFromPoint가 이 버튼(또는 자손)을 가리키는지
            const points: Array<[number, number]> = [
              [(left + rightEdge) / 2, (top + bottomEdge) / 2],
              [left + 1, top + 1],
              [rightEdge - 1, top + 1],
              [left + 1, bottomEdge - 1],
              [rightEdge - 1, bottomEdge - 1],
            ];
            const hits = points.map(([x, y]) => {
              const target = document.elementFromPoint(x, y);
              return target !== null && el.contains(target);
            });
            // 겹침 비교는 문서 좌표로 한다
            return {
              area: {
                left: left + window.scrollX,
                top: top + window.scrollY,
                right: rightEdge + window.scrollX,
                bottom: bottomEdge + window.scrollY,
              },
              hits,
            };
          });

          const { area, hits } = measured;
          expect(area.right - area.left, `${name} 너비`).toBeGreaterThanOrEqual(44);
          expect(area.bottom - area.top, `${name} 높이`).toBeGreaterThanOrEqual(44);
          expect(hits, `${name} elementFromPoint`).toEqual([true, true, true, true, true]);
          areas.push(area);
        }

        // 서로 다른 두 버튼의 영역은 겹치지 않는다(교집합 넓이 0)
        for (let i = 0; i < areas.length; i += 1) {
          for (let j = i + 1; j < areas.length; j += 1) {
            const a = areas[i];
            const b = areas[j];
            const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            expect(w * h, `${targets[i][0]} ∩ ${targets[j][0]}`).toBe(0);
          }
        }
      });
    });

    /**
     * @spec DoD-54
     * @given 너비 768px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 연다(P1). 표본: 단계 카드 라벨 `1차 추가 진입`·`2차 추가 진입`·`1차 추가 진입가`·`1차 재투입 비율`·`2차 추가 진입가`·`2차 재투입 비율`, 지표 보조 문구 `최초 진입 대비 +8.74% 이동`·`최초 5× → 12.81× 노출`
     * @when 표본 텍스트마다 글자별 Range의 client rect로 줄 위치를 구해, 줄이 바뀌는 지점의 앞 글자와 다음 글자를 본다
     * @then 모든 표본에서 줄이 바뀌는 지점은 공백 위치뿐이다(줄 끝 글자와 다음 줄 첫 글자가 모두 공백이 아닌 글자인 경우가 없다 — 단어 중간에서 끊기지 않는다)
     * @then 각 표본 요소의 계산된 word-break가 keep-all이다
     */
    test("[DoD-54] 768px에서 단계 라벨·지표 보조 문구가 단어 중간에서 끊기지 않는다", async ({
      browser,
    }) => {
      // given: viewport 768 컨텍스트로 / 를 열고 표본 텍스트를 반복한다
      // when: 글자별 Range rect로 줄바꿈 지점을 찾는다
      // then: 줄바꿈은 공백에서만
      await withWidth(browser, 768, async (page) => {
        const steps = regionOf(page, "추가 진입");
        const summary = regionOf(page, "포지션 요약");
        const samples: Array<readonly [string, Locator]> = [];
        for (const n of [1, 2]) {
          const name = `${n}차 추가 진입`;
          samples.push([
            name,
            steps.getByRole("group", { name, exact: true }).getByText(name, { exact: true }),
          ]);
        }
        for (const text of [
          "1차 추가 진입가",
          "1차 재투입 비율",
          "2차 추가 진입가",
          "2차 재투입 비율",
        ]) {
          samples.push([text, steps.getByText(text, { exact: true })]);
        }
        for (const text of ["최초 진입 대비 +8.74% 이동", "최초 5× → 12.81× 노출"]) {
          samples.push([text, summary.getByText(text, { exact: true })]);
        }

        for (const [name, locator] of samples) {
          await expect(locator, name).toBeVisible();
          const result = await locator.evaluate((el) => {
            // 글자별 Range의 client rect로 줄 위치를 구하고, 줄이 바뀐 지점 사이 글자를 모은다
            const chars: Array<{ ch: string; top: number | null; height: number }> = [];
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
              const text = node.textContent ?? "";
              for (let i = 0; i < text.length; i += 1) {
                const range = document.createRange();
                range.setStart(node, i);
                range.setEnd(node, i + 1);
                const rect = range.getClientRects()[0];
                chars.push({
                  ch: text[i],
                  top: rect === undefined ? null : rect.top,
                  height: rect === undefined ? 0 : rect.height,
                });
              }
            }
            const midWordBreaks: string[] = [];
            let prev = -1;
            for (let i = 0; i < chars.length; i += 1) {
              const top = chars[i].top;
              if (top === null) continue;
              if (prev >= 0) {
                const p = chars[prev];
                if (top > (p.top ?? 0) + p.height / 2) {
                  const around = chars
                    .slice(prev, i + 1)
                    .map((c) => c.ch)
                    .join("");
                  if (!/\s/.test(around)) midWordBreaks.push(around);
                }
              }
              prev = i;
            }
            return { midWordBreaks, wordBreak: getComputedStyle(el).wordBreak };
          });
          expect(result.midWordBreaks, `${name} 단어 중간 줄바꿈`).toEqual([]);
          expect(result.wordBreak, `${name} word-break`).toBe("keep-all");
        }
      });
    });

    /**
     * @spec DoD-55
     * @given 너비 768px 뷰포트의 새 브라우저 컨텍스트에서 / 화면을 연다(P1, 단계 2개 — 721~1150px 구간)
     * @when 단계 카드(`1차 추가 진입`·`2차 추가 진입` 그룹)마다 `N차 추가 진입가`와 `N차 재투입 비율` 입력란의 boundingBox를 본다
     * @then 각 카드에서 `N차 재투입 비율` 입력란의 위쪽이 `N차 추가 진입가` 입력란의 아래쪽 이상이다(세로로 놓인다)
     * @then 각 카드에서 두 입력란의 왼쪽 끝이 같다(1열로 접힌다)
     */
    test("[DoD-55] 768px에서 단계 가격·재투입 입력이 세로로 놓인다", async ({ browser }) => {
      // given: viewport 768 컨텍스트로 / 를 연다
      // when: 단계 카드마다 두 입력란 위치를 본다
      // then: 재투입이 가격 아래, 왼쪽 끝 같음
      await withWidth(browser, 768, async (page) => {
        const steps = regionOf(page, "추가 진입");
        for (const n of [1, 2]) {
          const card = steps.getByRole("group", { name: `${n}차 추가 진입`, exact: true });
          const price = await boxOf(
            card.getByRole("textbox", { name: `${n}차 추가 진입가`, exact: true }),
          );
          const reinvest = await boxOf(
            card.getByRole("textbox", { name: `${n}차 재투입 비율`, exact: true }),
          );
          expect(reinvest.y, `${n}차 재투입이 가격 아래`).toBeGreaterThanOrEqual(
            bottom(price) - EPS,
          );
          expect(Math.abs(reinvest.x - price.x), `${n}차 왼쪽 끝`).toBeLessThanOrEqual(EPS);
        }
      });
    });
  });
});
