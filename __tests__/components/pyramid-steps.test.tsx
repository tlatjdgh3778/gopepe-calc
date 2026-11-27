import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { PyramidTerminal } from "@/components/pyramid/pyramid-terminal";

// 골격: 스펙 docs/specs/pyramid-terminal.md (F-6 피라미딩 터미널) §3.4 단계 편집과 §5.2·§5.4의
// DoD-20(제외 행), DoD-27~DoD-30, EC-12, EC-13, EC-16, EC-18, EC-19, EC-31, EC-35. 계획 T-9.
// 화면을 단독으로 렌더한다(테스트마다 새로 렌더하고 cleanup으로 DOM을 비운다).
// 처음 연 화면은 기준 사례 P1(DoD-8): ETHUSDT, 롱, 1900, 증거금 1000, 5×, 수수료율 0.055,
// 단계 (2100, 100)·(2300, 100), 익절가 2500, 손절가 2000. P2는 SOLUSDT, 숏, 150, 500, 10×,
// 단계 (140, 50)·(130, 100), 익절가 120, 손절가 140.
// 심볼 틱: ETHUSDT tickSize 0.01·priceScale 2, SOLUSDT tickSize 0.01·priceScale 3.
// 접근 이름(DoD-34)은 정확 일치로 찾는다: `N차 추가 진입가`, `N차 재투입 비율`,
// `N차 추가 진입 삭제`, `추가 진입 단계`(N은 화면 순서 1부터).
// 포커스는 document.activeElement와 접근 이름으로 찾은 요소의 동일성으로 판정한다(F-5 관례).
// 단계 경고는 그 단계 카드 범위에서 판정한다. `⚠`(U+26A0)·`—`(U+2014)는 정확히 비교한다.
// 각 case는 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않음을 함께 본다
// (console.error는 vi.spyOn으로 관찰만 한다). 차트는 mock 없이 렌더하고 선은 판정하지 않는다.
// 기대값은 스펙 문구·기준 사례에서 가져오며, 스펙 규칙으로 손계산한 값은 @given에 근거를 적는다.

// 기호는 코드 포인트로 정확히 비교한다.
const WARN = "⚠"; // ⚠
const DASH = "—"; // —

const INVALID_INPUT_WARNING = `${WARN} 2차 추가 진입 제외: 가격과 재투입 비율(1~100%)을 확인해 주세요.`;
const NOT_PROFIT_DIRECTION_WARNING = `${WARN} 2차 추가 진입 제외: 수익 방향으로 진행하는 가격을 입력해 주세요.`;
const MAX_STEPS_NOTICE = "최대 8단계까지 추가할 수 있습니다.";

/** 표본을 여러 번 렌더하는 case의 제한 시간(ms). */
const SAMPLE_TIMEOUT = 60_000;

type User = ReturnType<typeof userEvent.setup>;

let consoleErrorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  // 관찰만 한다. 원래 console.error 동작은 그대로 둔다(대체하지 않는다).
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function renderTerminal() {
  const user = userEvent.setup();
  const { unmount } = render(<PyramidTerminal />);
  return { user, unmount };
}

/** 접근 이름(정확 일치)으로 찾은 입력란. */
function field(name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function priceField(n: number): HTMLInputElement {
  return field(`${n}차 추가 진입가`);
}

function reinvestField(n: number): HTMLInputElement {
  return field(`${n}차 재투입 비율`);
}

function removeButton(n: number): HTMLButtonElement {
  return screen.getByRole("button", { name: `${n}차 추가 진입 삭제` }) as HTMLButtonElement;
}

function addButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "추가 진입 단계" }) as HTMLButtonElement;
}

function isDisabled(button: HTMLButtonElement): boolean {
  return button.disabled || button.getAttribute("aria-disabled") === "true";
}

/** 화면의 단계 가격 입력란 수. */
function stepPriceCount(): number {
  return screen.queryAllByRole("textbox", { name: /^\d+차 추가 진입가$/ }).length;
}

/** 화면의 단계 재투입 입력란 수. */
function stepReinvestCount(): number {
  return screen.queryAllByRole("textbox", { name: /^\d+차 재투입 비율$/ }).length;
}

/** N차 단계 카드(이름 `N차 추가 진입`인 group). */
function stepCard(n: number): HTMLElement {
  return screen.getByRole("group", { name: `${n}차 추가 진입` });
}

/** 단계 카드 안의 `⚠` 경고 문구 요소. */
function cardWarnings(n: number): HTMLElement[] {
  return within(stepCard(n)).queryAllByText(new RegExp(`^${WARN}`));
}

/** `a`가 문서 순서상 `b`보다 뒤(화면상 아래)에 있다. */
function isAfter(a: Node, b: Node): boolean {
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** N차 단계 카드 안의 경고가 정확히 이 문구 하나이고 그 카드의 입력란 아래에 있다. */
function expectOnlyCardWarning(n: number, message: string) {
  const warnings = cardWarnings(n);
  expect(warnings.map((el) => el.textContent)).toEqual([message]);
  expect(isAfter(warnings[0], priceField(n))).toBe(true);
  expect(isAfter(warnings[0], reinvestField(n))).toBe(true);
}

/** `포지션 요약` 영역의 결과 값(이름은 결과 라벨). */
function summary(name: "평균 진입가" | "추정 청산가"): string | null {
  const region = screen.getByRole("region", { name: "포지션 요약" });
  return within(region).getByRole("definition", { name }).textContent;
}

/** `포지션 경로` 표의 본문 행. */
function pathBodyRows(): HTMLTableRowElement[] {
  const region = screen.getByRole("region", { name: "포지션 경로" });
  const table = within(region).getByRole("table");
  const [, body] = within(table).getAllByRole("rowgroup");
  return within(body).queryAllByRole("row") as HTMLTableRowElement[];
}

function rowHeaderText(row: HTMLTableRowElement): string | null {
  return within(row).getByRole("rowheader").textContent;
}

/** 행의 칸 텍스트(진입 단계 | 진입가 | 재투입 | 시점 수익 | 투입 증거금 | 추가 수량 | 누적 평단 | 청산가). */
function rowCells(row: HTMLTableRowElement): (string | null)[] {
  return Array.from(row.cells).map((cell) => cell.textContent);
}

/** 경로 표의 행이 진입 단계 칸에 `N차 추가 진입`과 `제외`를 따로 표시한다. */
function expectExcludedRow(row: HTMLTableRowElement, n: number) {
  const header = within(row).getByRole("rowheader");
  expect(within(header).getByText(`${n}차 추가 진입`)).toBeDefined();
  expect(within(header).getByText("제외")).toBeDefined();
}

function expectNotExcludedRow(row: HTMLTableRowElement) {
  expect(within(row).queryByText("제외")).toBeNull();
}

/** 기존 값을 지우고 실제 키 입력으로 새 값을 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, input: HTMLInputElement, value: string) {
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

async function chooseSymbol(user: User, symbol: "ETHUSDT" | "SOLUSDT" | "BTCUSDT") {
  await user.click(screen.getByRole("combobox", { name: "심볼" }));
  await user.click(await screen.findByRole("option", { name: symbol }));
}

async function chooseSide(user: User, side: "롱" | "숏") {
  await user.click(
    within(screen.getByRole("group", { name: "방향" })).getByRole("button", { name: side }),
  );
}

/** 기준 사례 P2(스펙 §3): SOLUSDT, 숏, 150, 500, 10×, 단계 (140, 50)·(130, 100), 익절가 120, 손절가 140. */
async function enterP2(user: User) {
  await chooseSymbol(user, "SOLUSDT");
  await chooseSide(user, "숏");
  await typeInto(user, field("최초 진입가"), "150");
  await typeInto(user, field("초기 증거금"), "500");
  await typeInto(user, field("레버리지"), "10");
  await typeInto(user, priceField(1), "140");
  await typeInto(user, reinvestField(1), "50");
  await typeInto(user, priceField(2), "130");
  await typeInto(user, reinvestField(2), "100");
  await typeInto(user, field("익절가"), "120");
  await typeInto(user, field("손절가"), "140");
}

/** 화면 텍스트·입력란 값에 NaN·Infinity가 없고 console.error가 호출되지 않았다. */
function expectNoBrokenScreen() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

describe("피라미딩 단계 편집 — 추가 진입 단계를 추가·삭제·입력해도 포커스와 각 단계의 값이 유지되고 결과가 바로 다시 계산된다", () => {
  describe("단계 추가", () => {
    /**
     * @spec DoD-27 DoD-29
     * @given 처음 연 화면(P1, 롱, 단계 2개, 마지막 포함 진입가 2300)이다
     * @when `추가 진입 단계` 버튼을 누른다
     * @then 맨 끝에 `3차 추가 진입가`·`3차 재투입 비율` 입력란을 가진 새 단계가 생긴다
     * @then 새 단계의 가격 입력란 값은 `2415`다(2300 × 1.05, 천 단위 구분·지수 표기·끝자리 0 없음)
     * @then 새 단계의 재투입 입력란 값은 `100`이다
     * @then document.activeElement는 새 단계의 `3차 추가 진입가` 입력란이다
     */
    it("[DoD-27][DoD-29] P1에서 단계를 추가하면 맨 끝에 가격 2415·재투입 100인 3차 단계가 생기고 포커스가 그 가격 입력란으로 간다", async () => {
      const { user } = renderTerminal();

      await user.click(addButton());

      expect(stepPriceCount()).toBe(3);
      expect(stepReinvestCount()).toBe(3);
      expect(priceField(3).value).toBe("2415");
      expect(reinvestField(3).value).toBe("100");
      expect(document.activeElement).toBe(priceField(3));
      expectNoBrokenScreen();
    });

    /**
     * @spec DoD-27
     * @given 표본 (사례, 2차 가격 변경 → 마지막 포함 진입가 × 배수, 기대 가격)을 하나씩 만든다: (P1 롱, 2차 2300.01 → 2300.01 × 1.05 = 2415.0105, 틱 0.01로 올린 `2415.02`), (P2 SOLUSDT 숏, 2차 130.03 → 130.03 × 0.95 = 123.5285, 틱 0.01로 내린 `123.52`)
     * @when `추가 진입 단계` 버튼을 누른다
     * @then 새 단계의 가격 입력란 값은 표본의 기대 가격이다(롱 올림, 숏 내림)
     * @then 새 단계의 재투입 입력란 값은 `100`이다
     */
    it(
      "[DoD-27] 새 단계 가격은 마지막 포함 진입가 × 1.05(롱)·× 0.95(숏)를 틱에 맞춰 롱은 올리고 숏은 내린 값이다",
      async () => {
        const samples: { name: string; setup: (user: User) => Promise<void>; expected: string }[] =
          [
            {
              name: "P1 롱, 2차 2300.01",
              setup: async (user) => {
                await typeInto(user, priceField(2), "2300.01");
              },
              expected: "2415.02",
            },
            {
              name: "P2 숏, 2차 130.03",
              setup: async (user) => {
                await enterP2(user);
                await typeInto(user, priceField(2), "130.03");
              },
              expected: "123.52",
            },
          ];

        for (const sample of samples) {
          const { user, unmount } = renderTerminal();
          await sample.setup(user);
          // 전제: 2차가 포함되어 마지막 포함 진입가가 2차 가격이다.
          expect(cardWarnings(2).map((el) => el.textContent)).toEqual([]);

          await user.click(addButton());

          expect({ sample: sample.name, price: priceField(3).value }).toEqual({
            sample: sample.name,
            price: sample.expected,
          });
          expect(reinvestField(3).value).toBe("100");
          expectNoBrokenScreen();
          unmount();
        }
      },
      SAMPLE_TIMEOUT,
    );

    /**
     * @spec DoD-27
     * @given 처음 연 화면에서 `2차 추가 진입가`를 2000으로 바꿔 2차가 제외되고 마지막 포함 진입가가 1차의 2100이다
     * @when `추가 진입 단계` 버튼을 누른다
     * @then 새 단계의 가격 입력란 값은 제외된 2차가 아닌 2100 기준의 `2205`다(2100 × 1.05)
     * @then 새 단계의 재투입 입력란 값은 `100`이다
     */
    it("[DoD-27] 새 단계 가격은 제외된 단계가 아닌 마지막 포함 진입가를 기준으로 한다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, priceField(2), "2000");
      // 전제: 2차가 수익 방향이 아니어서 제외되었다.
      expectOnlyCardWarning(2, NOT_PROFIT_DIRECTION_WARNING);

      await user.click(addButton());

      expect(priceField(3).value).toBe("2205");
      expect(reinvestField(3).value).toBe("100");
      expectNoBrokenScreen();
    });
  });

  describe("단계 삭제와 다시 계산", () => {
    /**
     * @spec DoD-28 DoD-29
     * @given 처음 연 화면(단계 (2100, 100)·(2300, 100))이다
     * @when 마지막이 아닌 `1차 추가 진입 삭제` 버튼을 누른다
     * @then 단계는 하나만 남고 그 단계가 `1차 추가 진입가`(값 2300)·`1차 재투입 비율`(값 100)로 다시 번호가 매겨진다
     * @then `2차 추가 진입가` 입력란과 `2차 추가 진입 삭제` 버튼은 없다
     * @then 경로 표의 행은 `최초 진입`과 `1차 추가 진입` 두 행이다
     * @then 포지션 요약의 추정 청산가는 `1,891.22`(원값 1891.2192…, 롱 틱 올림)이고 평균 진입가는 `2,086.04`(원값 2086.0465…)다
     * @then document.activeElement는 그 자리로 온 다음 단계(값 2300)의 `1차 추가 진입가` 입력란이다
     */
    it("[DoD-28][DoD-29] 1차 단계를 삭제하면 남은 단계가 1차로 다시 번호가 매겨져 다시 계산되고 포커스가 그 다음 단계의 가격 입력란으로 간다", async () => {
      const { user } = renderTerminal();

      await user.click(removeButton(1));

      expect(stepPriceCount()).toBe(1);
      expect(stepReinvestCount()).toBe(1);
      expect(priceField(1).value).toBe("2300");
      expect(reinvestField(1).value).toBe("100");
      expect(screen.queryByRole("textbox", { name: "2차 추가 진입가" })).toBeNull();
      expect(screen.queryByRole("button", { name: "2차 추가 진입 삭제" })).toBeNull();
      expect(pathBodyRows().map(rowHeaderText)).toEqual(["최초 진입", "1차 추가 진입"]);
      expect(summary("추정 청산가")).toBe("1,891.22");
      expect(summary("평균 진입가")).toBe("2,086.04");
      expect(document.activeElement).toBe(priceField(1));
      expectNoBrokenScreen();
    });

    /**
     * @spec DoD-28 DoD-29
     * @given 처음 연 화면(단계 (2100, 100)·(2300, 100))이다
     * @when 마지막 단계의 `2차 추가 진입 삭제` 버튼을 누른다
     * @then 단계는 `1차 추가 진입가`(값 2100) 하나만 남는다
     * @then 포지션 요약의 추정 청산가는 P1 경로 표 1차 행의 청산가 `1,714.78`이다
     * @then 경로 표의 `1차 추가 진입` 행 청산가는 `1,714.78`이다
     * @then document.activeElement는 이전 단계의 `1차 추가 진입가` 입력란이다
     */
    it("[DoD-28][DoD-29] 마지막 2차 단계를 삭제하면 1차 단계만으로 다시 계산되고 포커스가 이전 단계의 가격 입력란으로 간다", async () => {
      const { user } = renderTerminal();

      await user.click(removeButton(2));

      expect(stepPriceCount()).toBe(1);
      expect(priceField(1).value).toBe("2100");
      expect(summary("추정 청산가")).toBe("1,714.78");
      const rows = pathBodyRows();
      expect(rows.map(rowHeaderText)).toEqual(["최초 진입", "1차 추가 진입"]);
      expect(rowCells(rows[1])[7]).toBe("1,714.78");
      expect(document.activeElement).toBe(priceField(1));
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-19
     * @given 처음 연 화면(단계 2개)이다
     * @when `2차 추가 진입 삭제`, 이어서 `1차 추가 진입 삭제`를 눌러 단계를 모두 삭제한다
     * @then document.activeElement는 `추가 진입 단계` 버튼이다
     * @then 단계 입력란(`N차 추가 진입가`·`N차 재투입 비율`)이 하나도 없다
     * @then 경로 표의 본문 행은 `최초 진입` 한 행이다
     * @then 포지션 요약의 추정 청산가는 P1 최초 진입 행의 청산가 `1,526.93`이고 평균 진입가는 `1,900.00`이다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-19] 단계를 모두 삭제하면 포커스가 추가 진입 단계 버튼으로 가고 결과는 최초 진입만으로 계산된다", async () => {
      const { user } = renderTerminal();

      await user.click(removeButton(2));
      await user.click(removeButton(1));

      expect(document.activeElement).toBe(addButton());
      expect(stepPriceCount()).toBe(0);
      expect(stepReinvestCount()).toBe(0);
      expect(pathBodyRows().map(rowHeaderText)).toEqual(["최초 진입"]);
      expect(summary("추정 청산가")).toBe("1,526.93");
      expect(summary("평균 진입가")).toBe("1,900.00");
      expectNoBrokenScreen();
    });
  });

  describe("입력 중 포커스와 단계별 값 유지", () => {
    /**
     * @spec DoD-30
     * @given 처음 연 화면에서 `1차 추가 진입가`·`1차 재투입 비율`을 비운다
     * @when `1차 추가 진입가`에 `2150`을, `1차 재투입 비율`에 `12.5`를 한 글자씩 입력한다
     * @then 한 글자를 입력할 때마다 document.activeElement는 입력 중인 그 입력란이다
     * @then 입력을 마치면 두 입력란 값은 각각 `2150`·`12.5`다
     */
    it("[DoD-30] 단계 입력란에 한 글자씩 입력하는 동안 포커스가 그 입력란에 머문다", async () => {
      const { user } = renderTerminal();
      await user.clear(priceField(1));
      await user.clear(reinvestField(1));

      await user.click(priceField(1));
      for (const ch of "2150") {
        await user.keyboard(ch);
        expect(document.activeElement).toBe(priceField(1));
      }

      await user.click(reinvestField(1));
      for (const ch of "12.5") {
        await user.keyboard(ch);
        expect(document.activeElement).toBe(reinvestField(1));
      }

      expect(priceField(1).value).toBe("2150");
      expect(reinvestField(1).value).toBe("12.5");
      expectNoBrokenScreen();
    });

    /**
     * @spec DoD-30
     * @given 처음 연 화면에서 단계를 하나 추가하고 세 단계를 서로 다른 값 (2100, 100)·(2300, 50)·(2500, 25)로 입력한다
     * @when 중간의 `2차 추가 진입 삭제` 버튼을 누른다
     * @then `1차 추가 진입가`·`1차 재투입 비율` 값은 `2100`·`100`이다
     * @then 앞당겨진 `2차 추가 진입가`·`2차 재투입 비율` 값은 삭제 전 3차의 `2500`·`25`다
     * @then `3차 추가 진입가` 입력란은 없다
     */
    it("[DoD-30] 3단계 중 중간 단계를 삭제하면 앞당겨진 단계가 자기 값을 그대로 가진다", async () => {
      const { user } = renderTerminal();
      await user.click(addButton());
      await typeInto(user, priceField(1), "2100");
      await typeInto(user, reinvestField(1), "100");
      await typeInto(user, priceField(2), "2300");
      await typeInto(user, reinvestField(2), "50");
      await typeInto(user, priceField(3), "2500");
      await typeInto(user, reinvestField(3), "25");

      await user.click(removeButton(2));

      expect(priceField(1).value).toBe("2100");
      expect(reinvestField(1).value).toBe("100");
      expect(priceField(2).value).toBe("2500");
      expect(reinvestField(2).value).toBe("25");
      expect(screen.queryByRole("textbox", { name: "3차 추가 진입가" })).toBeNull();
      expectNoBrokenScreen();
    });

    /**
     * @spec DoD-30
     * @given 처음 연 화면에서 단계를 (2100, 100)·(2300, 50)으로 입력한다
     * @when `추가 진입 단계` 버튼을 누른다
     * @then `1차 추가 진입가`·`1차 재투입 비율` 값은 `2100`·`100`이다
     * @then `2차 추가 진입가`·`2차 재투입 비율` 값은 `2300`·`50`이다
     */
    it("[DoD-30] 단계를 추가해도 기존 단계의 값은 각자 자기 단계에 남는다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, priceField(1), "2100");
      await typeInto(user, reinvestField(1), "100");
      await typeInto(user, priceField(2), "2300");
      await typeInto(user, reinvestField(2), "50");

      await user.click(addButton());

      expect(priceField(1).value).toBe("2100");
      expect(reinvestField(1).value).toBe("100");
      expect(priceField(2).value).toBe("2300");
      expect(reinvestField(2).value).toBe("50");
      expectNoBrokenScreen();
    });
  });

  describe("단계 제외 경고와 경로 표의 제외 행", () => {
    /**
     * @spec EC-12
     * @given 처음 연 화면에서 2차 단계를 표본 (가격, 재투입)마다 하나씩 입력한다: (빈칸, 100), (2300, 빈칸), (0, 100), (2300, 0.5), (2300, 0), (2300, 100.5), (2300, 101)
     * @when 표본 입력을 마친다
     * @then 2차 단계 카드 아래에 `⚠ 2차 추가 진입 제외: 가격과 재투입 비율(1~100%)을 확인해 주세요.`가 표시된다
     * @then 경로 표의 `2차 추가 진입` 행에 `제외`가 표시된다
     * @then 1차 단계 카드에는 제외 경고가 없다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it(
      "[EC-12] 한 칸만 비었거나 가격 0이거나 재투입이 1 미만·100 초과인 단계는 입력 확인 경고와 표의 제외가 표시된다",
      async () => {
        const samples: [price: string, reinvest: string][] = [
          ["", "100"],
          ["2300", ""],
          ["0", "100"],
          ["2300", "0.5"],
          ["2300", "0"],
          ["2300", "100.5"],
          ["2300", "101"],
        ];

        for (const [price, reinvest] of samples) {
          const { user, unmount } = renderTerminal();

          await typeInto(user, priceField(2), price);
          await typeInto(user, reinvestField(2), reinvest);

          expectOnlyCardWarning(2, INVALID_INPUT_WARNING);
          expectExcludedRow(pathBodyRows()[2], 2);
          expect(cardWarnings(1).map((el) => el.textContent)).toEqual([]);
          expectNoBrokenScreen();
          unmount();
        }
      },
      SAMPLE_TIMEOUT,
    );

    /**
     * @spec EC-12
     * @given 처음 연 화면에서 2차 단계의 재투입을 경계 표본 `1`, `100`으로 하나씩 입력한다(가격 2300)
     * @when 표본 입력을 마친다
     * @then 2차 단계 카드에 제외 경고가 없다
     * @then 경로 표의 `2차 추가 진입` 행에 `제외`가 표시되지 않는다
     */
    it(
      "[EC-12] 재투입 1과 100은 제외되지 않는다",
      async () => {
        for (const reinvest of ["1", "100"]) {
          const { user, unmount } = renderTerminal();

          await typeInto(user, priceField(2), "2300");
          await typeInto(user, reinvestField(2), reinvest);

          expect(cardWarnings(2).map((el) => el.textContent)).toEqual([]);
          expectNotExcludedRow(pathBodyRows()[2]);
          expectNoBrokenScreen();
          unmount();
        }
      },
      SAMPLE_TIMEOUT,
    );

    /**
     * @spec EC-13
     * @given 표본 (방향, 사례, 2차 가격)을 하나씩 입력한다: (롱, P1, 2100), (롱, P1, 2000), (숏, P2, 140), (숏, P2, 145) — 1차는 기준 사례 값 그대로 포함된 상태다
     * @when 표본 입력을 마친다
     * @then 2차 단계 카드 아래에 `⚠ 2차 추가 진입 제외: 수익 방향으로 진행하는 가격을 입력해 주세요.`가 표시된다
     * @then 경로 표의 `2차 추가 진입` 행에 `제외`가 표시된다
     * @then 1차 단계 카드에는 제외 경고가 없다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it(
      "[EC-13] 마지막 포함 진입가보다 수익 방향이 아닌 단계 가격(롱 이하, 숏 이상)은 수익 방향 경고가 표시된다",
      async () => {
        const samples: { side: "롱" | "숏"; price: string }[] = [
          { side: "롱", price: "2100" },
          { side: "롱", price: "2000" },
          { side: "숏", price: "140" },
          { side: "숏", price: "145" },
        ];

        for (const sample of samples) {
          const { user, unmount } = renderTerminal();
          if (sample.side === "숏") {
            await enterP2(user);
          }

          await typeInto(user, priceField(2), sample.price);

          expectOnlyCardWarning(2, NOT_PROFIT_DIRECTION_WARNING);
          expectExcludedRow(pathBodyRows()[2], 2);
          expect(cardWarnings(1).map((el) => el.textContent)).toEqual([]);
          expectNoBrokenScreen();
          unmount();
        }
      },
      SAMPLE_TIMEOUT,
    );

    /**
     * @spec EC-16 DoD-20
     * @given 처음 연 화면에서 2차 단계의 가격과 재투입을 모두 비운다
     * @when 두 입력란을 비운 상태로 둔다
     * @then 2차 단계 카드에 제외 경고(`⚠`)가 없다
     * @then 경로 표의 `2차 추가 진입` 행에 `제외`가 표시된다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-16][DoD-20] 가격과 재투입이 모두 빈 단계는 경고 없이 표에 제외로 표시된다", async () => {
      const { user } = renderTerminal();

      await user.clear(priceField(2));
      await user.clear(reinvestField(2));

      expect(cardWarnings(2).map((el) => el.textContent)).toEqual([]);
      expectExcludedRow(pathBodyRows()[2], 2);
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-35 DoD-20
     * @given 처음 연 화면에서 2차 단계를 표본 (가격, 재투입 → 기대 진입가 칸, 기대 재투입 칸)마다 하나씩 입력한다: (2000, 100 → `2,000.00`, `100%`) 수익 방향 아님, (0, 100 → `0.00`, `100%`) 무효 가격, (2300, 101 → `2,300.00`, `101%`) 무효 재투입, (2300, 101.0 → `2,300.00`, `101%`) 끝자리 0이 있는 무효 재투입, (2300, 0.5 → `2,300.00`, `0.5%`) 무효 소수 재투입, (2300, 빈칸 → `2,300.00`, `—`) 한 칸 빈칸, (빈칸, 100 → `—`, `100%`) 한 칸 빈칸, (빈칸, 빈칸 → `—`, `—`) 모두 빈칸, (`.`, `.` → `—`, `—`) 점만 입력
     * @when 표본 입력을 마친다
     * @then 경로 표 2차 행의 진입 단계 칸에 `2차 추가 진입`과 `제외`가 표시된다
     * @then 진입가 칸은 숫자로 읽히면 포함 행과 같은 `formatPrice` 형식(무효 값 포함)의 기대값이고, 빈칸·`.`이면 `—`다
     * @then 재투입 칸은 숫자로 읽히면 포함 행과 같은 끝자리 0 없는 숫자 + `%` 형식(무효 값 포함)의 기대값이고, 빈칸·`.`이면 `—`다
     * @then 시점 수익·투입 증거금·추가 수량·누적 평단·청산가 칸은 모두 `—`다
     */
    it(
      "[EC-35][DoD-20] 경로 표의 제외 행은 단계 이름과 제외, 숫자로 읽히는 입력값은 포함 행과 같은 형식(무효 값 포함)·빈칸과 .은 —, 나머지 계산 칸 —를 표시한다",
      async () => {
        const samples: [
          price: string,
          reinvest: string,
          priceCell: string,
          reinvestCell: string,
        ][] = [
          ["2000", "100", "2,000.00", "100%"],
          ["0", "100", "0.00", "100%"],
          ["2300", "101", "2,300.00", "101%"],
          ["2300", "101.0", "2,300.00", "101%"],
          ["2300", "0.5", "2,300.00", "0.5%"],
          ["2300", "", "2,300.00", DASH],
          ["", "100", DASH, "100%"],
          ["", "", DASH, DASH],
          [".", ".", DASH, DASH],
        ];

        for (const [price, reinvest, priceCell, reinvestCell] of samples) {
          const { user, unmount } = renderTerminal();

          await typeInto(user, priceField(2), price);
          await typeInto(user, reinvestField(2), reinvest);

          const row = pathBodyRows()[2];
          expectExcludedRow(row, 2);
          expect({ sample: [price, reinvest], cells: rowCells(row).slice(1) }).toEqual({
            sample: [price, reinvest],
            cells: [priceCell, reinvestCell, DASH, DASH, DASH, DASH, DASH],
          });
          expectNoBrokenScreen();
          unmount();
        }
      },
      SAMPLE_TIMEOUT,
    );
  });

  describe("단계 수 제한", () => {
    /**
     * @spec EC-18
     * @given 처음 연 화면(단계 2개)에서 `추가 진입 단계`를 5번 눌러 단계가 7개다
     * @when 화면을 확인한다
     * @then `추가 진입 단계` 버튼은 활성화되어 있다
     * @then `최대 8단계까지 추가할 수 있습니다.`는 표시되지 않는다
     */
    it("[EC-18] 단계가 7개이면 추가 진입 단계 버튼이 활성화되어 있고 제한 문구가 없다", async () => {
      const { user } = renderTerminal();

      for (let i = 0; i < 5; i += 1) {
        await user.click(addButton());
      }

      expect(stepPriceCount()).toBe(7);
      expect(isDisabled(addButton())).toBe(false);
      expect(screen.queryByText(MAX_STEPS_NOTICE)).toBeNull();
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-18
     * @given 처음 연 화면(단계 2개)이다
     * @when `추가 진입 단계`를 6번 눌러 단계가 8개가 된다
     * @then `8차 추가 진입가` 입력란이 있고 `9차 추가 진입가` 입력란은 없다
     * @then `추가 진입 단계` 버튼은 비활성화된다
     * @then 버튼 아래에 `최대 8단계까지 추가할 수 있습니다.`가 표시된다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-18] 단계가 8개이면 추가 진입 단계 버튼이 비활성화되고 최대 8단계 문구가 표시된다", async () => {
      const { user } = renderTerminal();

      for (let i = 0; i < 6; i += 1) {
        await user.click(addButton());
      }

      expect(stepPriceCount()).toBe(8);
      expect(priceField(8)).toBeDefined();
      expect(screen.queryByRole("textbox", { name: "9차 추가 진입가" })).toBeNull();
      expect(isDisabled(addButton())).toBe(true);
      const notice = screen.getByText(MAX_STEPS_NOTICE);
      expect(isAfter(notice, addButton())).toBe(true);
      expectNoBrokenScreen();
    });
  });

  describe("결과가 없을 때 단계 추가", () => {
    /**
     * @spec EC-31
     * @given 최초 진입가가 유효한 양수이고 초기 증거금을 비워 결과가 없는 상태를 표본 (방향, 최초 진입가 → 기대 가격)마다 만든다: (롱, 1900 → `1995`), (숏, 1900 → `1805`) — 기존 단계 (2100, 100)·(2300, 100)은 그대로다
     * @when `추가 진입 단계` 버튼을 누른다
     * @then 새 `3차 추가 진입가` 값은 기존 단계 가격이 아닌 최초 진입가 기준 DoD-27 규칙의 기대 가격이다
     * @then 새 `3차 재투입 비율` 값은 `100`이다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it(
      "[EC-31] 결과가 없을 때 최초 진입가가 유효한 양수이면 새 단계 가격은 최초 진입가 기준이다",
      async () => {
        const samples: { side: "롱" | "숏"; expected: string }[] = [
          { side: "롱", expected: "1995" },
          { side: "숏", expected: "1805" },
        ];

        for (const sample of samples) {
          const { user, unmount } = renderTerminal();
          if (sample.side === "숏") {
            await chooseSide(user, "숏");
          }
          await user.clear(field("초기 증거금"));
          // 전제: 결과가 없다(요약이 —).
          expect(summary("평균 진입가")).toBe(DASH);
          expect(field("최초 진입가").value).toBe("1900");
          expect([priceField(1).value, priceField(2).value]).toEqual(["2100", "2300"]);

          await user.click(addButton());

          expect({ side: sample.side, price: priceField(3).value }).toEqual({
            side: sample.side,
            price: sample.expected,
          });
          expect(reinvestField(3).value).toBe("100");
          expectNoBrokenScreen();
          unmount();
        }
      },
      SAMPLE_TIMEOUT,
    );

    /**
     * @spec EC-31
     * @given 최초 진입가를 표본 빈칸, `.`, `0`으로 하나씩 바꿔 결과가 없는 상태다
     * @when `추가 진입 단계` 버튼을 누른다
     * @then 새 `3차 추가 진입가` 값은 빈칸이다
     * @then 새 `3차 재투입 비율` 값은 `100`이다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it(
      "[EC-31] 결과가 없고 최초 진입가가 유효한 양수가 아니면 새 단계 가격은 빈칸이다",
      async () => {
        for (const entry of ["", ".", "0"]) {
          const { user, unmount } = renderTerminal();
          await typeInto(user, field("최초 진입가"), entry);
          // 전제: 결과가 없다(요약이 —).
          expect(summary("평균 진입가")).toBe(DASH);

          await user.click(addButton());

          expect({ entry, price: priceField(3).value }).toEqual({ entry, price: "" });
          expect(reinvestField(3).value).toBe("100");
          expectNoBrokenScreen();
          unmount();
        }
      },
      SAMPLE_TIMEOUT,
    );
  });
});
