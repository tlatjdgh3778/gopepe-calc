import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AverageEntryCalculator } from "@/components/average-entry-calculator";
import { SYMBOLS_AS_OF } from "@/lib/symbols";

// 골격: 스펙 docs/specs/average-entry.md (F-5 평균 진입가)의 DoD-3~DoD-19, EC-1~EC-14.
// 계산기를 단독으로 렌더한다(테스트마다 새로 렌더, vitest.setup.ts의 cleanup으로 DOM을 비운다).
// 기대 표시값은 스펙 §3 기준 사례 표(A1~A5)와 DoD-5·DoD-6 형식으로 손계산한 리터럴이다.
// 빈 결과 `—`는 U+2014, 경고 기호 `⚠`는 U+26A0로 정확히 비교한다.
// 결과는 `평균 진입가 결과` 영역 범위에서 찾는다. 포커스는 document.activeElement와
// 접근 이름(정확 일치)으로 찾은 입력란의 동일성으로 판정한다.
// 심볼 데이터: BTCUSDT minOrderQty 0.001·qtyStep 0.001·priceScale 2·tickSize 0.1,
// ETHUSDT 0.01·0.01·2·0.01, SOLUSDT 0.1·0.1·3·0.01.
// 각 EC case는 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않음을 함께 본다
// (console.error는 vi.spyOn으로 관찰만 한다).

// 기호는 코드 포인트로 정확히 비교한다.
const WARN = "⚠"; // ⚠
const DASH = "—"; // —

const MIN_QTY_PREFIX = `${WARN} 최소 주문 수량은`;
const QTY_STEP_PREFIX = `${WARN} 수량 단위는`;

type User = ReturnType<typeof userEvent.setup>;
type SymbolName = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
/** 진입 행 (진입가 원문, 수량 원문). 빈 문자열은 빈 칸이다. */
type Row = [price: string, qty: string];
type Shown = { avg: string | null; total: string | null };

const EMPTY_RESULTS: Shown = { avg: DASH, total: DASH };

let consoleErrorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  // 관찰만 한다. 원래 console.error 동작은 그대로 둔다(대체하지 않는다).
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function renderCalculator() {
  const user = userEvent.setup();
  const { unmount } = render(<AverageEntryCalculator />);
  return { user, unmount };
}

/** 접근 이름(정확 일치)으로 찾은 입력란. 예: `진입가 1`, `수량 2`. */
function field(name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function priceField(n: number): HTMLInputElement {
  return field(`진입가 ${n}`);
}

function qtyField(n: number): HTMLInputElement {
  return field(`수량 ${n}`);
}

function deleteButton(n: number): HTMLButtonElement {
  return screen.getByRole("button", { name: `${n}행 삭제` }) as HTMLButtonElement;
}

function addButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "행 추가" }) as HTMLButtonElement;
}

function symbolSelect(): HTMLElement {
  return screen.getByRole("combobox", { name: "심볼" });
}

function resultRegion(): HTMLElement {
  return screen.getByRole("region", { name: "평균 진입가 결과" });
}

/** `평균 진입가 결과` 영역 안의 결과 값 요소(이름은 결과 라벨). */
function result(name: "평균 진입가" | "총 수량"): HTMLElement {
  return within(resultRegion()).getByLabelText(name);
}

function readResults(): Shown {
  return { avg: result("평균 진입가").textContent, total: result("총 수량").textContent };
}

/** 화면의 진입 행 수(`진입가 N` 입력란 수). */
function rowCount(): number {
  return screen.queryAllByRole("textbox", { name: /^진입가 \d+$/ }).length;
}

/** 기존 값을 지우고 실제 키 입력으로 새 값을 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, input: HTMLInputElement, value: string) {
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

/** 입력란 값 전체를 선택한 뒤 클립보드 붙여넣기 한 번으로 값을 바꾼다. */
async function pasteReplacing(user: User, input: HTMLInputElement, value: string) {
  await user.click(input);
  input.select();
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  await user.paste(value);
}

async function chooseSymbol(user: User, symbol: SymbolName) {
  await user.click(symbolSelect());
  await user.click(await screen.findByRole("option", { name: symbol }));
}

/** 행이 모자라면 `행 추가`로 늘린 뒤 1행부터 차례로 진입가·수량을 넣는다. */
async function fillRows(user: User, rows: Row[]) {
  while (rowCount() < rows.length) {
    await user.click(addButton());
  }
  for (const [index, [price, qty]] of rows.entries()) {
    await typeInto(user, priceField(index + 1), price);
    await typeInto(user, qtyField(index + 1), qty);
  }
}

/** 입력란의 `aria-describedby` id 목록이 가리키는 요소 중 `⚠`로 시작하는 경고 문구 요소. */
function linkedWarnings(input: HTMLElement): HTMLElement[] {
  const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null && (el.textContent ?? "").startsWith(WARN));
}

/** `a`가 문서 순서상 `b`보다 뒤(화면상 아래)에 있다. */
function isAfter(a: Node, b: Node): boolean {
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** 입력란의 `aria-describedby`가 가리키는 경고가 정확히 이 문구 하나이고 입력란 아래에 있다. */
function expectOnlyWarningLinked(input: HTMLElement, message: string) {
  const warnings = linkedWarnings(input);
  expect(warnings.map((el) => el.textContent)).toEqual([message]);
  expect(isAfter(warnings[0], input)).toBe(true);
}

function expectNoWarningLinked(input: HTMLElement) {
  expect(linkedWarnings(input)).toEqual([]);
}

/** 화면 어디에도 수량 경고 문구가 없다. */
function expectNoQtyWarningText() {
  expect(document.body.textContent).not.toContain(MIN_QTY_PREFIX);
  expect(document.body.textContent).not.toContain(QTY_STEP_PREFIX);
}

/** 화면 텍스트·입력란 값에 NaN·Infinity가 없고 console.error가 호출되지 않았다. */
function expectNoBrokenScreen() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

const SAMPLE_ROWS: Row[] = [
  ["100", "1"],
  ["200", "2"],
  ["300", "3"],
];

// 스펙 §3 기준 사례 표(DoD-3·DoD-4). 표시값은 DoD-5·DoD-6 형식이다.
const A1_ROWS: Row[] = [
  ["100000", "0.001"],
  ["100000.1", "0.002"],
];
const A1_SHOWN: Shown = { avg: "100,000.06", total: "0.003 BTC" };
const A4_ROWS: Row[] = [
  ["150", "10"],
  ["140", "5"],
  ["120", "5"],
];
const A4_SHOWN: Shown = { avg: "140.000", total: "20.0 SOL" };

const CASES: { id: string; symbol: SymbolName; rows: Row[]; shown: Shown }[] = [
  { id: "A1", symbol: "BTCUSDT", rows: A1_ROWS, shown: A1_SHOWN },
  {
    id: "A2",
    symbol: "ETHUSDT",
    rows: [
      ["3000", "0.5"],
      ["2800", "1.5"],
    ],
    shown: { avg: "2,850.00", total: "2.00 ETH" },
  },
  {
    id: "A3",
    symbol: "ETHUSDT",
    rows: [
      ["2500.55", "0.33"],
      ["2400.01", "0.67"],
    ],
    shown: { avg: "2,433.18", total: "1.00 ETH" },
  },
  { id: "A4", symbol: "SOLUSDT", rows: A4_ROWS, shown: A4_SHOWN },
  {
    id: "A5",
    symbol: "SOLUSDT",
    rows: [
      ["150.123", "1"],
      ["150.124", "2"],
    ],
    shown: { avg: "150.123", total: "3.0 SOL" },
  },
];

describe("평균 진입가 계산 — 진입 행을 추가·삭제·입력하면 포커스를 잃지 않은 채 평균 진입가와 총 수량이 계산 버튼 없이 바로 표시된다", () => {
  describe("첫 화면", () => {
    /**
     * @spec DoD-7
     * @given 평균 진입가 계산기를 처음 렌더한다
     * @when 아무 조작도 하지 않은 첫 화면을 본다
     * @then 심볼 선택값은 `BTCUSDT`다
     * @then 진입 행은 2개이고 `진입가 1`·`수량 1`·`진입가 2`·`수량 2`는 모두 빈 칸이며 `진입가 3`은 없다
     * @then `평균 진입가` 결과와 `총 수량` 결과는 모두 `—`다
     */
    it("[DoD-7] 심볼 BTCUSDT와 빈 진입 행 2개로 시작하고 두 결과는 —다", async () => {
      renderCalculator();

      expect(symbolSelect().textContent).toContain("BTCUSDT");
      expect(symbolSelect().textContent).not.toContain("ETHUSDT");
      expect(symbolSelect().textContent).not.toContain("SOLUSDT");
      expect(rowCount()).toBe(2);
      expect(priceField(1).value).toBe("");
      expect(qtyField(1).value).toBe("");
      expect(priceField(2).value).toBe("");
      expect(qtyField(2).value).toBe("");
      expect(screen.queryByRole("textbox", { name: "진입가 3" })).toBeNull();
      expect(readResults()).toEqual(EMPTY_RESULTS);
    });

    /**
     * @spec DoD-8
     * @given 평균 진입가 계산기를 처음 렌더한다
     * @when `평균 진입가 입력` 영역을 본다
     * @then 그 영역 안에 심볼 정보 기준일 문구 `심볼 정보 기준일 {SYMBOLS_AS_OF} (Bybit)`가 보인다
     */
    it("[DoD-8] 입력 카드에 심볼 정보 기준일 문구가 보인다", async () => {
      renderCalculator();

      const inputRegion = screen.getByRole("region", { name: "평균 진입가 입력" });
      const text = `심볼 정보 기준일 ${SYMBOLS_AS_OF} (Bybit)`;
      expect(within(inputRegion).getByText(text).textContent).toBe(text);
    });
  });

  describe("접근 이름", () => {
    /**
     * @spec DoD-19
     * @given 평균 진입가 계산기를 처음 렌더한다(진입 행 2개)
     * @when 입력 컨트롤과 결과를 접근 이름(정확 일치)으로 찾는다
     * @then 심볼 선택의 이름은 `심볼`이다
     * @then 입력란의 이름은 화면 순서대로 `진입가 1`·`수량 1`·`진입가 2`·`수량 2`다
     * @then 삭제 버튼의 이름은 `1행 삭제`·`2행 삭제`이고 추가 버튼의 이름은 `행 추가`다
     * @then `평균 진입가 결과` 영역 안 결과의 이름은 `평균 진입가`·`총 수량`이다
     */
    it("[DoD-19] 입력 컨트롤과 결과가 정해진 접근 이름을 갖는다", async () => {
      renderCalculator();

      expect(symbolSelect()).toBeDefined();

      const textboxes = screen.getAllByRole("textbox");
      const expected = ["진입가 1", "수량 1", "진입가 2", "수량 2"].map((name) => field(name));
      expect(textboxes.length).toBe(expected.length);
      expected.forEach((input, index) => {
        expect(textboxes[index]).toBe(input);
      });

      expect(deleteButton(1)).toBeDefined();
      expect(deleteButton(2)).toBeDefined();
      expect(addButton()).toBeDefined();

      expect(result("평균 진입가")).toBeDefined();
      expect(result("총 수량")).toBeDefined();
    });

    /**
     * @spec DoD-19
     * @given `행 추가`로 진입 행을 11개로 만들었다
     * @when `1행 삭제`를 누른다
     * @then 남은 10행의 이름은 화면 순서대로 `진입가 1`~`진입가 10`, `수량 1`~`수량 10`, `1행 삭제`~`10행 삭제`로 다시 매겨진다
     * @then `진입가 11`·`수량 11`·`11행 삭제`는 없다
     * @then 정확 일치로 찾은 `진입가 1`은 `진입가 10`과 다른 요소 하나다
     */
    it("[DoD-19] 행을 삭제하면 행 번호가 화면 순서 1부터 다시 매겨진다", async () => {
      const { user } = renderCalculator();

      while (rowCount() < 11) {
        await user.click(addButton());
      }
      expect(rowCount()).toBe(11);

      await user.click(deleteButton(1));

      const textboxes = screen.getAllByRole("textbox");
      expect(textboxes.length).toBe(20);
      const buttons = screen.getAllByRole("button", { name: /^\d+행 삭제$/ });
      expect(buttons.length).toBe(10);
      for (let n = 1; n <= 10; n += 1) {
        expect(textboxes[(n - 1) * 2]).toBe(priceField(n));
        expect(textboxes[(n - 1) * 2 + 1]).toBe(qtyField(n));
        expect(buttons[n - 1]).toBe(deleteButton(n));
      }

      expect(screen.queryByRole("textbox", { name: "진입가 11" })).toBeNull();
      expect(screen.queryByRole("textbox", { name: "수량 11" })).toBeNull();
      expect(screen.queryByRole("button", { name: "11행 삭제" })).toBeNull();

      expect(priceField(1)).not.toBe(priceField(10));
    });
  });

  describe("계산·표시", () => {
    /**
     * @spec DoD-3 DoD-4 DoD-5
     * @given 기준 사례를 하나씩 입력한다(필요하면 `행 추가`로 행을 늘린다): A1 BTCUSDT (100000, 0.001), (100000.1, 0.002) / A2 ETHUSDT (3000, 0.5), (2800, 1.5) / A3 ETHUSDT (2500.55, 0.33), (2400.01, 0.67) / A4 SOLUSDT (150, 10), (140, 5), (120, 5) / A5 SOLUSDT (150.123, 1), (150.124, 2)
     * @when 모든 행의 진입가·수량 입력을 마친 화면을 본다
     * @then 평균 진입가 표시는 A1 `100,000.06`, A2 `2,850.00`, A3 `2,433.18`, A4 `140.000`, A5 `150.123`이다(A1·A5는 틱 반올림·사사오입이 아닌 priceScale 자리 버림)
     * @then 총 수량 표시는 A1 `0.003 BTC`, A2 `2.00 ETH`, A3 `1.00 ETH`, A4 `20.0 SOL`, A5 `3.0 SOL`이다
     */
    it("[DoD-3][DoD-4][DoD-5] 기준 사례 A1~A5의 평균 진입가와 총 수량이 표의 표시값과 같다", async () => {
      for (const { id, symbol, rows, shown } of CASES) {
        const { user, unmount } = renderCalculator();
        if (symbol !== "BTCUSDT") {
          await chooseSymbol(user, symbol);
        }
        await fillRows(user, rows);

        expect({ id, ...readResults() }).toEqual({ id, ...shown });
        unmount();
      }
    });

    /**
     * @spec DoD-6
     * @given 진입가 100인 두 행을 심볼별 수량으로 입력한다: BTCUSDT (0.0015, 0.0011) / ETHUSDT (0.015, 0.016) / SOLUSDT (0.15, 0.16)
     * @when 총 수량 결과를 본다
     * @then BTCUSDT에서는 `0.002 BTC`, ETHUSDT에서는 `0.03 ETH`, SOLUSDT에서는 `0.3 SOL`이다(qtyStep 소수 자릿수에서 버림, 공백 뒤 기초 코인)
     */
    it("[DoD-6] 총 수량은 qtyStep 자릿수의 코인 수량 뒤에 공백과 기초 코인을 붙여 표시한다", async () => {
      const samples: { symbol: SymbolName; qtys: [string, string]; total: string }[] = [
        { symbol: "BTCUSDT", qtys: ["0.0015", "0.0011"], total: "0.002 BTC" },
        { symbol: "ETHUSDT", qtys: ["0.015", "0.016"], total: "0.03 ETH" },
        { symbol: "SOLUSDT", qtys: ["0.15", "0.16"], total: "0.3 SOL" },
      ];
      for (const { symbol, qtys, total } of samples) {
        const { user, unmount } = renderCalculator();
        if (symbol !== "BTCUSDT") {
          await chooseSymbol(user, symbol);
        }
        await fillRows(user, [
          ["100", qtys[0]],
          ["100", qtys[1]],
        ]);

        expect({ symbol, total: result("총 수량").textContent }).toEqual({ symbol, total });
        unmount();
      }
    });

    /**
     * @spec DoD-9
     * @given 심볼 BTCUSDT, `진입가 1`에 100000을 입력했고 2행은 비어 있다
     * @when `수량 1`에 `0.12`를 한 글자씩 입력한 뒤 2행에 (100000.1, 0.002)를 마저 입력한다
     * @then 화면에 계산 버튼이 없다
     * @then `수량 1`이 `0`·`0.`일 때 두 결과는 `—`다
     * @then `수량 1`이 `0.1`이 되는 즉시 `100,000.00`·`0.100 BTC`, `0.12`가 되는 즉시 `100,000.00`·`0.120 BTC`가 표시된다
     * @then 2행 입력을 마치면 다른 조작 없이 `100,000.00`·`0.122 BTC`가 표시된다
     */
    it("[DoD-9] 진입가·수량을 입력할 때마다 계산 버튼 없이 두 결과가 갱신된다", async () => {
      const { user } = renderCalculator();
      await typeInto(user, priceField(1), "100000");

      expect(screen.queryByRole("button", { name: /계산/ })).toBeNull();

      await user.click(qtyField(1));
      const steps: { char: string; value: string; shown: Shown }[] = [
        { char: "0", value: "0", shown: EMPTY_RESULTS },
        { char: ".", value: "0.", shown: EMPTY_RESULTS },
        { char: "1", value: "0.1", shown: { avg: "100,000.00", total: "0.100 BTC" } },
        { char: "2", value: "0.12", shown: { avg: "100,000.00", total: "0.120 BTC" } },
      ];
      for (const { char, value, shown } of steps) {
        await user.keyboard(char);
        expect(qtyField(1).value).toBe(value);
        expect({ value, ...readResults() }).toEqual({ value, ...shown });
      }

      await typeInto(user, priceField(2), "100000.1");
      await typeInto(user, qtyField(2), "0.002");

      expect(readResults()).toEqual({ avg: "100,000.00", total: "0.122 BTC" });
      expect(screen.queryByRole("button", { name: /계산/ })).toBeNull();
    });
  });

  describe("행 추가·삭제와 그 뒤의 포커스", () => {
    /**
     * @spec DoD-10 DoD-11 DoD-18
     * @given 1행 (100, 1), 2행 (200, 2), 3행 (300, 3)을 입력하고 `2행 삭제`를 눌러 (100, 1), (300, 3)이 남았다
     * @when `행 추가`를 누른다
     * @then 진입 행이 3개가 되고 새 행 `진입가 3`·`수량 3`은 빈 칸이다
     * @then 기존 값은 `진입가 1`·`수량 1`이 `100`·`1`, `진입가 2`·`수량 2`가 `300`·`3`이다
     * @then document.activeElement는 새 행의 `진입가 3` 입력란이다
     * @then console.error가 호출되지 않는다
     */
    it("[DoD-10][DoD-11][DoD-18] 행을 삭제한 뒤 행 추가를 누르면 맨 끝에 빈 행이 생기고 기존 행의 값은 그대로이며 포커스는 새 행의 진입가 입력란에 있다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, SAMPLE_ROWS);
      await user.click(deleteButton(2));
      expect(rowCount()).toBe(2);

      await user.click(addButton());

      expect(rowCount()).toBe(3);
      expect(priceField(3).value).toBe("");
      expect(qtyField(3).value).toBe("");
      expect(priceField(1).value).toBe("100");
      expect(qtyField(1).value).toBe("1");
      expect(priceField(2).value).toBe("300");
      expect(qtyField(2).value).toBe("3");
      expect(document.activeElement).toBe(priceField(3));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    /**
     * @spec DoD-12 DoD-13
     * @given 기준 사례 A4(SOLUSDT, (150, 10), (140, 5), (120, 5))를 입력해 `140.000`·`20.0 SOL`이 표시돼 있다
     * @when `1행 삭제`를 누른다
     * @then 진입 행이 2개가 되고 `진입가 3`은 없다
     * @then 남은 (140, 5), (120, 5)로 다시 계산돼 평균 진입가 `130.000`, 총 수량 `10.0 SOL`이 표시된다
     * @then document.activeElement는 그 자리로 온 행(값 `140`)의 `진입가 1` 입력란이다
     */
    it("[DoD-12][DoD-13] 첫 행을 삭제하면 그 행이 사라지고 남은 행으로 다시 계산되며 포커스는 그 자리로 온 행의 진입가 입력란에 있다", async () => {
      const { user } = renderCalculator();
      await chooseSymbol(user, "SOLUSDT");
      await fillRows(user, A4_ROWS);
      expect(readResults()).toEqual(A4_SHOWN);

      await user.click(deleteButton(1));

      expect(rowCount()).toBe(2);
      expect(screen.queryByRole("textbox", { name: "진입가 3" })).toBeNull();
      expect(readResults()).toEqual({ avg: "130.000", total: "10.0 SOL" });
      expect(priceField(1).value).toBe("140");
      expect(document.activeElement).toBe(priceField(1));
    });

    /**
     * @spec DoD-13 DoD-18
     * @given 1행 (100, 1), 2행 (200, 2), 3행 (300, 3)을 입력했다
     * @when `2행 삭제`를 누른다
     * @then 진입 행이 2개가 된다
     * @then `진입가 1`·`수량 1`은 `100`·`1`이다
     * @then `진입가 2`·`수량 2`는 앞당겨진 3행의 값 `300`·`3`이다
     * @then document.activeElement는 그 자리로 온 행의 `진입가 2` 입력란이다
     */
    it("[DoD-13][DoD-18] 중간 행을 삭제하면 뒤 행의 값이 앞당겨진 번호의 행에 그대로 있고 포커스는 그 행의 진입가 입력란에 있다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, SAMPLE_ROWS);

      await user.click(deleteButton(2));

      expect(rowCount()).toBe(2);
      expect(priceField(1).value).toBe("100");
      expect(qtyField(1).value).toBe("1");
      expect(priceField(2).value).toBe("300");
      expect(qtyField(2).value).toBe("3");
      expect(document.activeElement).toBe(priceField(2));
    });

    /**
     * @spec DoD-14
     * @given 1행 (100, 1), 2행 (200, 2), 3행 (300, 3)을 입력했다
     * @when 마지막 행의 `3행 삭제`를 누른다
     * @then document.activeElement는 이전 행의 `진입가 2` 입력란이다
     */
    it("[DoD-14] 3행 중 마지막 행을 삭제하면 포커스는 이전 행의 진입가 입력란에 있다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, SAMPLE_ROWS);

      await user.click(deleteButton(3));

      expect(rowCount()).toBe(2);
      expect(document.activeElement).toBe(priceField(2));
    });

    /**
     * @spec DoD-14 DoD-15
     * @given 1행 (100, 1), 2행 (200, 2)를 입력했다
     * @when 마지막 행의 `2행 삭제`를 눌러 행을 1개로 만든다
     * @then document.activeElement는 이전 행의 `진입가 1` 입력란이다
     * @then `1행 삭제` 버튼은 비활성화돼 있다
     */
    it("[DoD-14][DoD-15] 2행 중 마지막 행을 삭제하면 포커스는 이전 행의 진입가 입력란에 있고 하나 남은 행의 삭제 버튼은 비활성화된다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, SAMPLE_ROWS.slice(0, 2));

      await user.click(deleteButton(2));

      expect(rowCount()).toBe(1);
      expect(document.activeElement).toBe(priceField(1));
      expect(deleteButton(1).disabled).toBe(true);
    });

    /**
     * @spec DoD-16
     * @given 초기 진입 행 2개다
     * @when `행 추가`를 20번 누른다
     * @then 진입 행이 22개가 되어 `진입가 22`가 있다
     * @then `행 추가` 버튼은 여전히 활성화돼 있다
     */
    it("[DoD-16] 행 추가를 20번 눌러 22행이 되어도 행 추가가 활성화돼 있다", async () => {
      const { user } = renderCalculator();
      expect(rowCount()).toBe(2);

      for (let i = 0; i < 20; i += 1) {
        await user.click(addButton());
      }

      expect(rowCount()).toBe(22);
      expect(priceField(22)).toBeDefined();
      expect(addButton().disabled).toBe(false);
    });
  });

  describe("입력 중 포커스", () => {
    /**
     * @spec DoD-17
     * @given 진입 행이 2개다. 표본: `진입가 1`에 `100000.1` / `수량 2`에 `0.002`
     * @when 그 입력란에 한 글자씩 입력한다
     * @then 글자마다 document.activeElement는 그 입력란이다
     * @then 글자마다 입력란 값은 그때까지 입력한 글자 전체와 같고, 다 입력하면 `100000.1` / `0.002`다
     */
    it("[DoD-17] 한 글자씩 입력하는 동안 포커스가 그 입력란에 머물고 입력한 값이 모두 들어간다", async () => {
      const { user } = renderCalculator();
      expect(rowCount()).toBe(2);

      const samples: { name: string; text: string }[] = [
        { name: "진입가 1", text: "100000.1" },
        { name: "수량 2", text: "0.002" },
      ];
      for (const { name, text } of samples) {
        await user.click(field(name));
        let typed = "";
        for (const char of text) {
          await user.keyboard(char);
          typed += char;
          expect(document.activeElement).toBe(field(name));
          expect(field(name).value).toBe(typed);
        }
        expect(field(name).value).toBe(text);
      }
    });
  });

  describe("비정상 입력", () => {
    /**
     * @spec EC-1
     * @given `진입가 1`에 `100`, `수량 1`에 `0.5`가 들어 있다. 타이핑 표본(각 입력란 끝에 덧붙임): `a`, `-`, `e`, `,`, ` `(공백), 두 번째 `.`(두 번째 `.` 표본은 소수점이 이미 있는 `수량 1`(`0.5`)에만 적용한다)
     * @when 진입가·수량 입력란에 표본 문자를 타이핑한다
     * @then 변경은 무시되고 `진입가 1`은 `100`, `수량 1`은 `0.5` 그대로다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-1] 숫자와 소수점 하나 밖의 문자를 타이핑하면 무시되고 직전 값이 유지된다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [["100", "0.5"]]);
      expect(priceField(1).value).toBe("100");
      expect(qtyField(1).value).toBe("0.5");
      const before = readResults();

      const common = ["a", "-", "e", ",", " "];
      const targets: { input: () => HTMLInputElement; samples: string[] }[] = [
        { input: () => priceField(1), samples: common },
        { input: () => qtyField(1), samples: [...common, "."] },
      ];
      for (const { input, samples } of targets) {
        for (const sample of samples) {
          await user.click(input());
          input().setSelectionRange(input().value.length, input().value.length);
          await user.keyboard(sample);

          expect(priceField(1).value).toBe("100");
          expect(qtyField(1).value).toBe("0.5");
          expect(readResults()).toEqual(before);
          expectNoBrokenScreen();
        }
      }
    });

    /**
     * @spec EC-1
     * @given `진입가 1`에 `100`, `수량 1`에 `0.5`가 들어 있다. 붙여넣기 표본: `12a`, `1.2.3`, `1,000`, `-5`, `1e3`
     * @when 진입가·수량 입력란에 표본을 붙여넣는다
     * @then 변경은 통째로 무시되고 `진입가 1`은 `100`, `수량 1`은 `0.5` 그대로다(표본의 일부 글자도 들어가지 않는다)
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-1] 허용되지 않는 문자가 섞인 붙여넣기는 통째로 무시되고 직전 값이 유지된다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [["100", "0.5"]]);
      expect(priceField(1).value).toBe("100");
      expect(qtyField(1).value).toBe("0.5");
      const before = readResults();

      const samples = ["12a", "1.2.3", "1,000", "-5", "1e3"];
      for (const input of [() => priceField(1), () => qtyField(1)]) {
        for (const sample of samples) {
          await pasteReplacing(user, input(), sample);

          expect(priceField(1).value).toBe("100");
          expect(qtyField(1).value).toBe("0.5");
          expect(readResults()).toEqual(before);
          expectNoBrokenScreen();
        }
      }
    });

    /**
     * @spec EC-2
     * @given 심볼 BTCUSDT, 1행 (100000, 0.001)을 입력했고 2행의 진입가·수량은 모두 `.`이다
     * @when 결과를 본다
     * @then 2행은 빈 행으로 보아 계산에서 빠지고 평균 진입가 `100,000.00`, 총 수량 `0.001 BTC`가 표시된다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-2] 진입가·수량이 모두 .인 행은 빈 행으로 보아 계산에서 빠진다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [
        ["100000", "0.001"],
        [".", "."],
      ]);
      expect(priceField(2).value).toBe(".");
      expect(qtyField(2).value).toBe(".");

      expect(readResults()).toEqual({ avg: "100,000.00", total: "0.001 BTC" });
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-2
     * @given 심볼 BTCUSDT, 1행 (100000, 0.001)을 입력했다. 2행 표본: 진입가 `.`·수량 `0.002` / 진입가 `100000.1`·수량 `.`
     * @when 결과를 본다
     * @then `.`인 칸을 빈 칸으로 보아 두 결과는 `—`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-2] 한 칸만 .인 행은 그 칸을 빈 칸으로 보아 두 결과가 —다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [["100000", "0.001"]]);

      const samples: Row[] = [
        [".", "0.002"],
        ["100000.1", "."],
      ];
      for (const [price, qty] of samples) {
        await typeInto(user, priceField(2), price);
        await typeInto(user, qtyField(2), qty);
        expect(priceField(2).value).toBe(price);
        expect(qtyField(2).value).toBe(qty);

        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectNoBrokenScreen();
      }
    });
  });

  describe("행 상태", () => {
    /**
     * @spec EC-3
     * @given 심볼 BTCUSDT. 표본: 1행 (100000, 0.001)·2행 빈 행·3행 (100000.1, 0.002) / 1행 (100000, 0.001)·2행 (100000.1, 0.002)·3행 빈 행
     * @when 결과를 본다
     * @then 빈 행은 계산에서 빠지고 평균 진입가 `100,000.06`, 총 수량 `0.003 BTC`가 표시된다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-3] 진입가·수량이 모두 빈 행은 계산에서 빠지고 나머지 행으로 결과가 표시된다", async () => {
      const samples: Row[][] = [
        [
          ["100000", "0.001"],
          ["", ""],
          ["100000.1", "0.002"],
        ],
        [
          ["100000", "0.001"],
          ["100000.1", "0.002"],
          ["", ""],
        ],
      ];
      for (const rows of samples) {
        const { user, unmount } = renderCalculator();
        await fillRows(user, rows);
        expect(rowCount()).toBe(3);

        expect(readResults()).toEqual({ avg: "100,000.06", total: "0.003 BTC" });
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec EC-4
     * @given 심볼 BTCUSDT, 1행 (100000, 0.001). 2행 표본: 진입가 `100000.1`·수량 빈 칸 / 진입가 빈 칸·수량 `0.002`
     * @when 결과를 본다
     * @then 두 결과는 `—`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-4] 한 칸만 빈 칸인 행이 하나라도 있으면 두 결과가 —다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [["100000", "0.001"]]);

      const samples: Row[] = [
        ["100000.1", ""],
        ["", "0.002"],
      ];
      for (const [price, qty] of samples) {
        await typeInto(user, priceField(2), price);
        await typeInto(user, qtyField(2), qty);
        expect(priceField(2).value).toBe(price);
        expect(qtyField(2).value).toBe(qty);

        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-5
     * @given 심볼 BTCUSDT, 1행 (100000, 0.001). 2행 표본: (0, 0.002) / (100000.1, 0) / (0.0, 0.002) / (100000.1, 0.000)
     * @when 결과를 본다
     * @then 두 결과는 `—`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-5] 진입가나 수량이 0인 행이 하나라도 있으면 두 결과가 —다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [["100000", "0.001"]]);

      const samples: Row[] = [
        ["0", "0.002"],
        ["100000.1", "0"],
        ["0.0", "0.002"],
        ["100000.1", "0.000"],
      ];
      for (const [price, qty] of samples) {
        await typeInto(user, priceField(2), price);
        await typeInto(user, qtyField(2), qty);
        expect(priceField(2).value).toBe(price);
        expect(qtyField(2).value).toBe(qty);

        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-6
     * @given `행 추가`를 눌러 진입 행을 3개로 만들고 모든 행의 진입가·수량이 빈 칸이다
     * @when 결과를 본다
     * @then 두 결과는 `—`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-6] 모든 행이 빈 행이면 두 결과가 —다", async () => {
      const { user } = renderCalculator();
      await user.click(addButton());
      expect(rowCount()).toBe(3);
      for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
        expect(input.value).toBe("");
      }

      expect(readResults()).toEqual(EMPTY_RESULTS);
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-7
     * @given 기준 사례 A1(BTCUSDT, (100000, 0.001), (100000.1, 0.002))을 입력해 `100,000.06`·`0.003 BTC`가 표시돼 있다. 지우기 표본: `수량 2`를 지운다(EC-4) / `수량 2`를 `0`으로 바꾼다(EC-5) / 모든 입력란을 지운다(EC-6)
     * @when 표본대로 입력을 지운다
     * @then 두 결과가 `—`로 돌아간다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-7] 입력을 지워 계산할 수 없게 되면 두 결과가 —로 돌아간다", async () => {
      const erasers: { label: string; erase: (user: User) => Promise<void> }[] = [
        { label: "수량 2 지움", erase: (user) => typeInto(user, qtyField(2), "") },
        { label: "수량 2를 0으로", erase: (user) => typeInto(user, qtyField(2), "0") },
        {
          label: "모든 입력란 지움",
          erase: async (user) => {
            for (const n of [1, 2]) {
              await typeInto(user, priceField(n), "");
              await typeInto(user, qtyField(n), "");
            }
          },
        },
      ];
      for (const { label, erase } of erasers) {
        const { user, unmount } = renderCalculator();
        await fillRows(user, A1_ROWS);
        expect(readResults()).toEqual(A1_SHOWN);

        await erase(user);

        expect({ label, ...readResults() }).toEqual({ label, ...EMPTY_RESULTS });
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("수량 경고", () => {
    /**
     * @spec EC-8 EC-10
     * @given 진입가 100인 1행에 심볼별로 minOrderQty보다 작은 수량을 입력한다(이 수량은 qtyStep의 배수도 아니다): BTCUSDT `0.0005` / ETHUSDT `0.005` / SOLUSDT `0.05`
     * @when `수량 1` 입력란의 aria-describedby가 가리키는 요소를 본다
     * @then 경고 문구는 BTCUSDT `⚠ 최소 주문 수량은 0.001 BTC입니다.`, ETHUSDT `⚠ 최소 주문 수량은 0.01 ETH입니다.`, SOLUSDT `⚠ 최소 주문 수량은 0.1 SOL입니다.`다
     * @then 수량 단위 경고(`⚠ 수량 단위는 …입니다.`)는 표시되지 않아 경고는 하나뿐이다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-8][EC-10] 수량이 최소 주문 수량보다 작으면 최소 주문 수량 경고 하나만 수량 입력란과 연결돼 표시된다", async () => {
      const samples: { symbol: SymbolName; qty: string; message: string }[] = [
        { symbol: "BTCUSDT", qty: "0.0005", message: `${WARN} 최소 주문 수량은 0.001 BTC입니다.` },
        { symbol: "ETHUSDT", qty: "0.005", message: `${WARN} 최소 주문 수량은 0.01 ETH입니다.` },
        { symbol: "SOLUSDT", qty: "0.05", message: `${WARN} 최소 주문 수량은 0.1 SOL입니다.` },
      ];
      for (const { symbol, qty, message } of samples) {
        const { user, unmount } = renderCalculator();
        if (symbol !== "BTCUSDT") {
          await chooseSymbol(user, symbol);
        }
        await fillRows(user, [["100", qty]]);

        expectOnlyWarningLinked(qtyField(1), message);
        expect(document.body.textContent).not.toContain(QTY_STEP_PREFIX);
        expect(document.body.textContent?.split(WARN).length).toBe(2);
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec EC-9
     * @given 진입가 100인 1행에 심볼별로 minOrderQty 이상이지만 qtyStep의 배수가 아닌 수량을 입력한다: BTCUSDT `0.0015` / ETHUSDT `0.015` / SOLUSDT `0.15`
     * @when `수량 1` 입력란의 aria-describedby가 가리키는 요소를 본다
     * @then 경고 문구는 BTCUSDT `⚠ 수량 단위는 0.001 BTC입니다.`, ETHUSDT `⚠ 수량 단위는 0.01 ETH입니다.`, SOLUSDT `⚠ 수량 단위는 0.1 SOL입니다.`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-9] 수량이 qtyStep의 배수가 아니면 수량 단위 경고가 수량 입력란과 연결돼 표시된다", async () => {
      const samples: { symbol: SymbolName; qty: string; message: string }[] = [
        { symbol: "BTCUSDT", qty: "0.0015", message: `${WARN} 수량 단위는 0.001 BTC입니다.` },
        { symbol: "ETHUSDT", qty: "0.015", message: `${WARN} 수량 단위는 0.01 ETH입니다.` },
        { symbol: "SOLUSDT", qty: "0.15", message: `${WARN} 수량 단위는 0.1 SOL입니다.` },
      ];
      for (const { symbol, qty, message } of samples) {
        const { user, unmount } = renderCalculator();
        if (symbol !== "BTCUSDT") {
          await chooseSymbol(user, symbol);
        }
        await fillRows(user, [["100", qty]]);
        expect(qtyField(1).value).toBe(qty);

        expectOnlyWarningLinked(qtyField(1), message);
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec EC-11
     * @given 심볼 BTCUSDT, `진입가 1`에 100. `수량 1` 원문 표본: `` (빈 칸) / `.` / `0` / `0.000`
     * @when `수량 1` 입력란과 화면을 본다
     * @then 수량 경고(`⚠ 최소 주문 수량은 …`·`⚠ 수량 단위는 …`)가 표시되지 않고 `수량 1`의 aria-describedby가 경고 요소를 가리키지 않는다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-11] 수량 원문이 비었거나 .이거나 0이면 수량 경고를 판정하지 않는다", async () => {
      const { user } = renderCalculator();
      await typeInto(user, priceField(1), "100");

      for (const sample of ["", ".", "0", "0.000"]) {
        await typeInto(user, qtyField(1), sample);
        expect(qtyField(1).value).toBe(sample);

        expectNoQtyWarningText();
        expectNoWarningLinked(qtyField(1));
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-12
     * @given 심볼 BTCUSDT, 1행 (100000, 0.0005)로 최소 주문 수량 경고, 2행 (100000, 0.0015)로 수량 단위 경고가 표시돼 있다
     * @when 결과를 본다
     * @then 두 경고가 표시된 채로 평균 진입가 `100,000.00`, 총 수량 `0.002 BTC`가 표시된다
     * @then `수량 1`의 aria-describedby가 가리키는 요소는 그 행의 경고 `⚠ 최소 주문 수량은 0.001 BTC입니다.`다
     * @then `수량 2`의 aria-describedby가 가리키는 요소는 그 행의 경고 `⚠ 수량 단위는 0.001 BTC입니다.`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-12] 수량 경고가 표시돼도 두 결과는 계속 계산·표시된다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [
        ["100000", "0.0005"],
        ["100000", "0.0015"],
      ]);

      expect(readResults()).toEqual({ avg: "100,000.00", total: "0.002 BTC" });
      expectOnlyWarningLinked(qtyField(1), `${WARN} 최소 주문 수량은 0.001 BTC입니다.`);
      expectOnlyWarningLinked(qtyField(2), `${WARN} 수량 단위는 0.001 BTC입니다.`);
      expectNoBrokenScreen();
    });
  });

  describe("심볼 변경", () => {
    /**
     * @spec EC-13
     * @given 심볼 BTCUSDT에서 1행 (100.12345, 1.5), 2행 (100.12345, 1)을 입력해 `100.12`·`2.500 BTC`가 표시돼 있다
     * @when 심볼을 ETHUSDT로, 이어서 SOLUSDT로 바꾼다
     * @then 바꿀 때마다 진입 행은 2개 그대로이고 `진입가 1`·`수량 1`·`진입가 2`·`수량 2`는 `100.12345`·`1.5`·`100.12345`·`1`로 유지된다
     * @then ETHUSDT에서는 평균 진입가 `100.12`, 총 수량 `2.50 ETH`가 표시된다
     * @then SOLUSDT에서는 평균 진입가 `100.123`, 총 수량 `2.5 SOL`이 표시된다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-13] 심볼을 바꾸면 행과 입력값은 남고 새 심볼의 priceScale·qtyStep·기초 코인으로 결과가 다시 표시된다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [
        ["100.12345", "1.5"],
        ["100.12345", "1"],
      ]);
      expect(readResults()).toEqual({ avg: "100.12", total: "2.500 BTC" });

      const steps: { symbol: SymbolName; shown: Shown }[] = [
        { symbol: "ETHUSDT", shown: { avg: "100.12", total: "2.50 ETH" } },
        { symbol: "SOLUSDT", shown: { avg: "100.123", total: "2.5 SOL" } },
      ];
      for (const { symbol, shown } of steps) {
        await chooseSymbol(user, symbol);

        expect(symbolSelect().textContent).toContain(symbol);
        expect(rowCount()).toBe(2);
        expect(priceField(1).value).toBe("100.12345");
        expect(qtyField(1).value).toBe("1.5");
        expect(priceField(2).value).toBe("100.12345");
        expect(qtyField(2).value).toBe("1");
        expect({ symbol, ...readResults() }).toEqual({ symbol, ...shown });
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-14
     * @given 심볼 BTCUSDT에서 1행 (100, 0.015)를 입력해 수량 경고가 없다
     * @when 심볼을 ETHUSDT로, 이어서 SOLUSDT로, 다시 BTCUSDT로 바꾼다
     * @then ETHUSDT에서는 `수량 1`의 aria-describedby가 가리키는 경고가 `⚠ 수량 단위는 0.01 ETH입니다.`다
     * @then SOLUSDT에서는 그 경고가 `⚠ 최소 주문 수량은 0.1 SOL입니다.`다
     * @then 다시 BTCUSDT로 돌아오면 수량 경고가 없다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-14] 심볼을 바꾸면 수량 경고가 새 심볼의 minOrderQty·qtyStep 기준으로 다시 판정된다", async () => {
      const { user } = renderCalculator();
      await fillRows(user, [["100", "0.015"]]);
      expect(qtyField(1).value).toBe("0.015");
      expectNoQtyWarningText();
      expectNoWarningLinked(qtyField(1));

      await chooseSymbol(user, "ETHUSDT");
      expectOnlyWarningLinked(qtyField(1), `${WARN} 수량 단위는 0.01 ETH입니다.`);
      expectNoBrokenScreen();

      await chooseSymbol(user, "SOLUSDT");
      expectOnlyWarningLinked(qtyField(1), `${WARN} 최소 주문 수량은 0.1 SOL입니다.`);
      expectNoBrokenScreen();

      await chooseSymbol(user, "BTCUSDT");
      expectNoQtyWarningText();
      expectNoWarningLinked(qtyField(1));
      expectNoBrokenScreen();
    });
  });
});
