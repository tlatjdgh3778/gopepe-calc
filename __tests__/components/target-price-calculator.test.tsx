import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { TargetPriceCalculator } from "@/components/target-price-calculator";

// 기대값은 스펙 기준 사례 표(T1~T6)와 DoD-1~DoD-5·DoD-10·DoD-11 규칙으로 손계산한 리터럴이다.
// 경고 문구의 `⚠`는 U+26A0, 부호 `−`는 U+2212, 빈 결과 `—`는 U+2014로 정확히 비교한다.
// EC-8 문구에도 `—`(U+2014)가 들어가므로 "결과가 `—`" 판정은 결과 셀 단위로 한다.
// 첫 화면 기본값은 BTCUSDT·롱·레버리지 10이다.

// 기호는 코드 포인트로 정확히 비교한다.
const WARN = "⚠"; // ⚠
const DASH = "—"; // —
const MINUS = "−"; // −

const NO_PRICE_TEXT = "이 ROE에 해당하는 가격이 없습니다.";
const BEYOND_MARGIN_TEXT = "증거금 이상 손실";
const NO_PRICE_WARNING = `${WARN} ${NO_PRICE_TEXT}`;
const BEYOND_MARGIN_WARNING = `${WARN} ${BEYOND_MARGIN_TEXT} ${DASH} 이 가격 전에 청산됩니다.`;

type User = ReturnType<typeof userEvent.setup>;
type SymbolName = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type SideName = "롱" | "숏";
type FieldName = "레버리지" | "진입가" | "목표 ROE";
type ResultName = "목표가" | "가격 변동률";
type Inputs = {
  symbol?: SymbolName;
  side?: SideName;
  leverage?: string;
  entry?: string;
  roe?: string;
};
type Shown = { price: string | null; change: string | null };

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
  const { unmount } = render(<TargetPriceCalculator />);
  return { user, unmount };
}

function field(name: FieldName): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function symbolSelect(): HTMLElement {
  return screen.getByRole("combobox", { name: "심볼" });
}

function sideButton(name: SideName): HTMLElement {
  return within(screen.getByRole("group", { name: "방향" })).getByRole("button", { name });
}

function resultRegion(): HTMLElement {
  return screen.getByRole("region", { name: "목표가 결과" });
}

/** `목표가 결과` 영역 안의 결과 값 요소(이름은 결과 라벨). */
function result(name: ResultName): HTMLElement {
  return within(resultRegion()).getByLabelText(name);
}

/** 두 결과 셀의 표시 문자열. `—` 판정도 셀 단위로 한다. */
function readResults(): Shown {
  return { price: result("목표가").textContent, change: result("가격 변동률").textContent };
}

const EMPTY_RESULTS: Shown = { price: DASH, change: DASH };

/** 기존 값을 지우고 실제 키 입력으로 새 값을 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, name: FieldName, value: string) {
  const input = field(name);
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

/** 입력란 값 전체를 선택한 뒤 클립보드 붙여넣기 한 번으로 값을 바꾼다. */
async function pasteReplacing(user: User, name: FieldName, value: string) {
  const input = field(name);
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

/** 이미 선택된 방향을 다시 누르면 토글이 풀릴 수 있으므로 선택돼 있지 않을 때만 누른다. */
async function chooseSide(user: User, side: SideName) {
  if (sideButton(side).getAttribute("aria-pressed") !== "true") {
    await user.click(sideButton(side));
  }
}

/** 심볼 → 방향 → 레버리지 → 진입가 → 목표 ROE 순서로 넣는다. 목표 ROE가 마지막이다. */
async function fill(user: User, inputs: Inputs) {
  if (inputs.symbol !== undefined && inputs.symbol !== "BTCUSDT") {
    await chooseSymbol(user, inputs.symbol);
  }
  if (inputs.side !== undefined) {
    await chooseSide(user, inputs.side);
  }
  if (inputs.leverage !== undefined) {
    await typeInto(user, "레버리지", inputs.leverage);
  }
  if (inputs.entry !== undefined) {
    await typeInto(user, "진입가", inputs.entry);
  }
  if (inputs.roe !== undefined) {
    await typeInto(user, "목표 ROE", inputs.roe);
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

/** 경고 문구가 입력란 아래에 표시되고, 입력란의 `aria-describedby` id 목록이 그 요소를 가리킨다. */
function expectWarningLinked(input: HTMLElement, message: string) {
  const warning = screen.getByText(message);
  expect(warning.textContent).toBe(message);
  expect(isAfter(warning, input)).toBe(true);
  const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/);
  expect(warning.id).not.toBe("");
  expect(ids).toContain(warning.id);
}

/** 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다). */
function expectNoWarningLinked(input: HTMLElement) {
  expect(linkedWarnings(input)).toEqual([]);
}

/** 화면 어디에도 이 경고 문구 조각이 없다. */
function expectNoWarningText(...fragments: string[]) {
  for (const fragment of fragments) {
    expect(document.body.textContent).not.toContain(fragment);
  }
}

function expectNoNaNOrInfinity() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
}

function expectControlsIntactWithoutConsoleError() {
  expect(symbolSelect()).toBeDefined();
  expect(screen.getByRole("group", { name: "방향" })).toBeDefined();
  for (const name of ["레버리지", "진입가", "목표 ROE"] as const) {
    expect(field(name)).toBeDefined();
  }
  for (const name of ["목표가", "가격 변동률"] as const) {
    expect(result(name)).toBeDefined();
  }
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

/** 화면 텍스트·입력란 값에 NaN·Infinity가 없고, 컨트롤이 그대로이며 콘솔 오류가 없다. */
function expectNoBrokenScreen() {
  expectNoNaNOrInfinity();
  expectControlsIntactWithoutConsoleError();
}

const SYMBOL_NAMES: SymbolName[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const SIDE_NAMES: SideName[] = ["롱", "숏"];

/** 화면의 현재 입력 상태(선택된 심볼·방향과 세 입력란 값). */
function readInputs(): Inputs {
  return {
    symbol: SYMBOL_NAMES.find((name) => (symbolSelect().textContent ?? "").includes(name)),
    side: SIDE_NAMES.find((name) => sideButton(name).getAttribute("aria-pressed") === "true"),
    leverage: field("레버리지").value,
    entry: field("진입가").value,
    roe: field("목표 ROE").value,
  };
}

// 스펙 기준 사례 표(DoD-6·DoD-7). 표시값은 DoD-10·DoD-11 형식이다.
const T1: Inputs = { symbol: "BTCUSDT", side: "롱", leverage: "10", entry: "65000", roe: "34.62" };
const T1_SHOWN: Shown = { price: "67,250.30", change: "+3.46%" };
const T2: Inputs = {
  symbol: "BTCUSDT",
  side: "숏",
  leverage: "20",
  entry: "98765.4",
  roe: "-24.99",
};
const T2_SHOWN: Shown = { price: "99,999.40", change: "+1.24%" };
const T3: Inputs = {
  symbol: "ETHUSDT",
  side: "롱",
  leverage: "25",
  entry: "3456.78",
  roe: "-178.07",
};
const T3_SHOWN: Shown = { price: "3,210.57", change: `${MINUS}7.12%` };
const T4: Inputs = { symbol: "ETHUSDT", side: "숏", leverage: "5", entry: "2500", roe: "30.86" };
const T4_SHOWN: Shown = { price: "2,345.70", change: `${MINUS}6.17%` };
const T6: Inputs = { symbol: "SOLUSDT", side: "숏", leverage: "3", entry: "142.5", roe: "22.35" };
const T6_SHOWN: Shown = { price: "131.880", change: `${MINUS}7.45%` };

describe("목표가 계산 — 목표 ROE를 넣으면 계산 버튼 없이 그 ROE 이상이 되는 틱 단위 목표가와 가격 변동률이 바로 표시된다", () => {
  describe("첫 화면을 열면 기본값과 이름 붙은 컨트롤이 보인다", () => {
    /**
     * @spec DoD-8
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 계산기를 렌더링한다
     * @then 심볼은 BTCUSDT가 선택돼 있다
     * @then 방향은 롱이 선택돼 있다
     * @then 레버리지는 10이다
     * @then 진입가·목표 ROE 입력란은 비어 있다
     * @then 목표가·가격 변동률은 모두 `—`(U+2014)로 표시된다
     */
    it("[DoD-8] 첫 화면은 BTCUSDT·롱·레버리지 10이고 진입가·목표 ROE는 비어 있으며 두 결과는 —다", async () => {
      renderCalculator();

      expect(symbolSelect().textContent).toContain("BTCUSDT");
      expect(sideButton("롱").getAttribute("aria-pressed")).toBe("true");
      expect(sideButton("숏").getAttribute("aria-pressed")).toBe("false");
      expect(field("레버리지").value).toBe("10");
      expect(field("진입가").value).toBe("");
      expect(field("목표 ROE").value).toBe("");
      expect(readResults()).toEqual(EMPTY_RESULTS);
    });

    /**
     * @spec DoD-9
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 계산기를 렌더링한다
     * @then `목표가 입력` 영역 안에 심볼 정보 기준일 문구 `심볼 정보 기준일 2026-11-22 (Bybit)`(SymbolSelect의 문구)가 표시된다
     */
    it("[DoD-9] 입력 카드에 심볼 정보 기준일 문구가 표시된다", async () => {
      renderCalculator();

      const inputRegion = screen.getByRole("region", { name: "목표가 입력" });
      const asOf = within(inputRegion).getByText("심볼 정보 기준일 2026-11-22 (Bybit)");
      expect(asOf.textContent).toBe("심볼 정보 기준일 2026-11-22 (Bybit)");
    });

    /**
     * @spec DoD-13
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 입력 컨트롤과 결과를 접근 이름으로 찾는다
     * @then 심볼, 방향, 레버리지, 진입가, 목표 ROE라는 이름의 입력 컨트롤이 각각 있다
     * @then 방향 컨트롤 안에 롱, 숏이라는 이름의 선택지가 있다
     * @then `목표가 결과` 영역 안에 목표가, 가격 변동률이라는 이름의 결과가 각각 있다
     */
    it("[DoD-13] 입력 컨트롤과 결과를 스펙의 접근 이름으로 찾을 수 있다", async () => {
      renderCalculator();

      expect(screen.getByRole("combobox", { name: "심볼" })).toBeDefined();
      const side = screen.getByRole("group", { name: "방향" });
      expect(screen.getByRole("textbox", { name: "레버리지" })).toBeDefined();
      expect(screen.getByRole("textbox", { name: "진입가" })).toBeDefined();
      expect(screen.getByRole("textbox", { name: "목표 ROE" })).toBeDefined();

      expect(within(side).getByRole("button", { name: "롱" })).toBeDefined();
      expect(within(side).getByRole("button", { name: "숏" })).toBeDefined();

      const results = screen.getByRole("region", { name: "목표가 결과" });
      expect(within(results).getByLabelText("목표가")).toBeDefined();
      expect(within(results).getByLabelText("가격 변동률")).toBeDefined();
    });
  });

  describe("값을 입력하면 계산 버튼 없이 목표가와 가격 변동률이 바로 표시된다", () => {
    /**
     * @spec DoD-10 DoD-11
     * @given 첫 화면이다. 표본(스펙 기준 사례 표의 T1·T2·T4·T6과 공유, 손계산 리터럴. BTCUSDT·ETHUSDT 2자리, SOLUSDT 3자리 목표가와 `+`·U+2212 `−` 가격 변동률이 모두 나온다. T3 표시는 EC-8 case, 부호 없는 `0.00%`는 EC-4 case가 본다): T1 = BTCUSDT 롱 10, 진입가 65000, 목표 ROE 34.62 → `67,250.30` / `+3.46%`, T2 = BTCUSDT 숏 20, 진입가 98765.4, 목표 ROE -24.99 → `99,999.40` / `+1.24%`, T4 = ETHUSDT 숏 5, 진입가 2500, 목표 ROE 30.86 → `2,345.70` / `−6.17%`, T6 = SOLUSDT 숏 3, 진입가 142.5, 목표 ROE 22.35 → `131.880` / `−7.45%` (`−`는 U+2212)
     * @when 표본의 심볼·방향을 고르고 레버리지·진입가·목표 ROE를 키 입력으로 넣는다
     * @then 버튼을 누르지 않아도 목표가가 표본의 기대값(심볼 priceScale 자릿수, 천 단위 구분, 단위 없음)으로 표시된다
     * @then 버튼을 누르지 않아도 가격 변동률이 표본의 기대값(소수 2자리, 오르면 `+`, 내리면 U+2212 `−`, `%`)으로 표시된다
     * @then 두 결과는 마지막 키 입력 직후 타이머 대기 없이 표시된다
     */
    it("[DoD-10][DoD-11] 진입가·목표 ROE를 넣으면 목표가와 가격 변동률이 스펙 형식으로 즉시 표시된다", async () => {
      const samples: { inputs: Inputs; shown: Shown }[] = [
        { inputs: T1, shown: T1_SHOWN },
        { inputs: T2, shown: T2_SHOWN },
        { inputs: T4, shown: T4_SHOWN },
        { inputs: T6, shown: T6_SHOWN },
      ];

      for (const { inputs, shown } of samples) {
        const { user, unmount } = renderCalculator();
        expect(readResults()).toEqual(EMPTY_RESULTS);

        await fill(user, inputs);

        // 마지막 키 입력 직후 바로 읽는다(버튼·타이머 대기 없음).
        expect(readResults()).toEqual(shown);
        expect(screen.queryByRole("button", { name: /계산/ })).toBeNull();
        unmount();
      }
    });

    /**
     * @spec DoD-12
     * @given 첫 화면(BTCUSDT 롱 레버리지 10)에서 진입가 65000이 입력돼 있다. 표본(손계산 리터럴): 목표 ROE -20 → 목표가 `63,700.00`, 가격 변동률 `−2.00%` (부호를 잃고 20으로 계산하면 `66,300.00`·`+2.00%`가 되어 구별된다)
     * @when 목표 ROE 입력란에 `-20`을 키 입력으로 넣는다
     * @then 목표 ROE 입력란의 값은 `-20`이다
     * @then 목표가가 `63,700.00`으로 표시된다
     * @then 가격 변동률이 `−2.00%`(U+2212)로 표시된다
     */
    it("[DoD-12] 목표 ROE에 -20을 키 입력하면 입력란 값이 -20이 되고 그 값으로 계산된다", async () => {
      const { user } = renderCalculator();
      await typeInto(user, "진입가", "65000");

      await user.type(field("목표 ROE"), "-20");

      expect(field("목표 ROE").value).toBe("-20");
      expect(readResults()).toEqual({ price: "63,700.00", change: `${MINUS}2.00%` });
    });
  });

  describe("목표 ROE 입력란은 맨 앞의 - 하나, 숫자, 소수점 하나만 받는다", () => {
    /**
     * @spec EC-1
     * @given 시작 상태는 표본에 따라 둘이다. 상태 A = T1 입력(BTCUSDT 롱 10, 진입가 65000, 목표 ROE 34.62)이 들어가 목표 ROE 입력란 값이 `34.62`이고 목표가 `67,250.30`, 가격 변동률 `+3.46%`가 표시돼 있다. 상태 B = T1의 심볼·방향·레버리지·진입가에 목표 ROE 입력란 값이 `-`이고 목표가·가격 변동률이 `—`(U+2014)로 표시돼 있다. 표본: 상태 A에서 키 입력은 직전 값 끝에 덧붙는 허용되지 않는 글자 하나(문자 `a`, `e`, `+`, `,`, U+2212 `−`, 맨 앞이 아닌 `-`, 두 번째 소수점 `.`), 붙여넣기는 입력란 값 전체를 선택한 뒤 표본 문자열로 바꾸는 한 번의 변경(붙여넣기)으로 `1-2`, `--5`, `+5`, `1e5`, `1.2.3`, U+2212로 시작하는 `−20`을 넣는다(바뀐 값 기준으로 `1-2`는 맨 앞이 아닌 `-`, `--5`는 두 번째 `-`, `+5`·`1e5`는 다른 문자, `1.2.3`은 두 번째 소수점, `−20`은 맨 앞 U+2212 위반이다) / 상태 B에서 키 입력 `-`(두 번째 `-`)
     * @when 목표 ROE 입력란에 표본을 넣는다
     * @then 목표 ROE 입력란은 직전 값을 유지한다
     * @then 목표가·가격 변동률은 직전 값 기준 표시 그대로다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-1] 목표 ROE에 허용되지 않는 문자·두 번째 -·맨 앞이 아닌 -·두 번째 소수점이 섞인 변경은 무시되고 직전 값이 유지된다", async () => {
      const { user } = renderCalculator();

      // 상태 A: T1 입력, 목표 ROE `34.62`
      await fill(user, T1);
      expect(field("목표 ROE").value).toBe("34.62");
      expect(readResults()).toEqual(T1_SHOWN);

      const typed = ["a", "e", "+", ",", MINUS, "-", "."];
      for (const sample of typed) {
        await user.type(field("목표 ROE"), sample);

        expect(field("목표 ROE").value).toBe("34.62");
        expect(readResults()).toEqual(T1_SHOWN);
        expectNoBrokenScreen();
      }

      const pasted = ["1-2", "--5", "+5", "1e5", "1.2.3", `${MINUS}20`];
      for (const sample of pasted) {
        await pasteReplacing(user, "목표 ROE", sample);

        expect(field("목표 ROE").value).toBe("34.62");
        expect(readResults()).toEqual(T1_SHOWN);
        expectNoBrokenScreen();
      }

      // 상태 B: 같은 심볼·방향·레버리지·진입가에 목표 ROE `-`
      await typeInto(user, "목표 ROE", "-");
      expect(field("목표 ROE").value).toBe("-");
      expect(readResults()).toEqual(EMPTY_RESULTS);

      await user.type(field("목표 ROE"), "-");

      expect(field("목표 ROE").value).toBe("-");
      expect(readResults()).toEqual(EMPTY_RESULTS);
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-1
     * @given 목표 ROE 입력란이 비어 있다. 표본(키 입력과 붙여넣기 각각): 맨 앞 `-` 하나만 있는 값 `-`, `-.`, 소수점만 있는 값 `.`, 숫자만으로 된 값 `34`, 숫자와 소수점 하나로 된 값 `34.62`, 맨 앞 `-`와 숫자·소수점 하나로 된 값 `-178.07`
     * @when 목표 ROE 입력란에 표본을 넣는다
     * @then 목표 ROE 입력란에 넣은 값이 그대로 반영된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-1] 목표 ROE에 맨 앞 - 하나와 숫자·소수점 하나로 된 변경은 반영된다", async () => {
      const { user } = renderCalculator();
      expect(field("목표 ROE").value).toBe("");

      const samples = ["-", "-.", ".", "34", "34.62", "-178.07"];
      for (const sample of samples) {
        await typeInto(user, "목표 ROE", sample);
        expect(field("목표 ROE").value).toBe(sample);
        expectNoBrokenScreen();

        await user.clear(field("목표 ROE"));
        await pasteReplacing(user, "목표 ROE", sample);
        expect(field("목표 ROE").value).toBe(sample);
        expectNoBrokenScreen();

        await user.clear(field("목표 ROE"));
      }
    });
  });

  describe("계산할 수 없는 입력이면 목표가와 가격 변동률은 —다", () => {
    /**
     * @spec EC-2
     * @given T1 입력(BTCUSDT 롱 10, 진입가 65000, 목표 ROE 34.62)이 들어가 두 결과가 표시돼 있다. 표본: 목표 ROE 입력란을 빈 값, `-`, `.`, `-.`으로 바꾼다
     * @when 목표 ROE를 표본 값으로 바꾼다
     * @then 목표가·가격 변동률이 모두 `—`(U+2014)로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-2] 목표 ROE가 빈 값·-·.·-.이면 두 결과 모두 —로 표시한다", async () => {
      const { user } = renderCalculator();
      await fill(user, T1);
      expect(readResults()).toEqual(T1_SHOWN);

      for (const sample of ["", "-", ".", "-."]) {
        await typeInto(user, "목표 ROE", sample);

        expect(field("목표 ROE").value).toBe(sample);
        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectNoBrokenScreen();

        // 다음 표본 전에 T1 상태로 되돌린다.
        await typeInto(user, "목표 ROE", "34.62");
        expect(readResults()).toEqual(T1_SHOWN);
      }
    });

    /**
     * @spec EC-3
     * @given T1 입력(BTCUSDT 롱 10, 진입가 65000, 목표 ROE 34.62)이 들어가 두 결과가 표시돼 있다. 표본: 진입가 입력란을 빈 값, `.`, 0으로 바꾼다 / 레버리지 입력란을 빈 값, 0으로 바꾼다
     * @when 진입가 또는 레버리지를 표본 값으로 바꾼다
     * @then 목표가·가격 변동률이 모두 `—`(U+2014)로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-3] 진입가가 빈 값·.·0이거나 레버리지가 빈 값·0이면 두 결과 모두 —로 표시한다", async () => {
      const { user } = renderCalculator();
      await fill(user, T1);
      expect(readResults()).toEqual(T1_SHOWN);

      const samples: { name: "진입가" | "레버리지"; value: string; restore: string }[] = [
        { name: "진입가", value: "", restore: "65000" },
        { name: "진입가", value: ".", restore: "65000" },
        { name: "진입가", value: "0", restore: "65000" },
        { name: "레버리지", value: "", restore: "10" },
        { name: "레버리지", value: "0", restore: "10" },
      ];

      for (const { name, value, restore } of samples) {
        await typeInto(user, name, value);

        expect(field(name).value).toBe(value);
        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectNoBrokenScreen();

        // 다음 표본 전에 T1 상태로 되돌린다.
        await typeInto(user, name, restore);
        expect(readResults()).toEqual(T1_SHOWN);
      }
    });
  });

  describe("목표 ROE가 0이면 틱 배수 진입가가 그대로 목표가가 된다", () => {
    /**
     * @spec EC-4
     * @given 첫 화면이다. 표본(진입가가 심볼 틱의 배수, 손계산 리터럴): ETHUSDT 숏 5, 진입가 2500 → `2,500.00` / `0.00%`, BTCUSDT 롱 10, 진입가 65000 → `65,000.00` / `0.00%`
     * @when 표본의 심볼·방향을 고르고 레버리지·진입가를 넣은 뒤 목표 ROE에 0을 키 입력으로 넣는다
     * @then 목표가가 진입가와 같은 값으로 표본의 기대값(심볼 priceScale 자릿수)으로 표시된다
     * @then 가격 변동률이 부호 없는 `0.00%`로 표시된다(`+0.00%`·`−0.00%`가 아니다)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-4] 진입가가 틱 배수이고 목표 ROE가 0이면 목표가는 진입가와 같고 가격 변동률은 부호 없는 0.00%다", async () => {
      const samples: { inputs: Inputs; shown: Shown }[] = [
        {
          inputs: { symbol: "ETHUSDT", side: "숏", leverage: "5", entry: "2500", roe: "0" },
          shown: { price: "2,500.00", change: "0.00%" },
        },
        {
          inputs: { symbol: "BTCUSDT", side: "롱", leverage: "10", entry: "65000", roe: "0" },
          shown: { price: "65,000.00", change: "0.00%" },
        },
      ];

      for (const { inputs, shown } of samples) {
        const { user, unmount } = renderCalculator();

        await fill(user, inputs);

        expect(readResults()).toEqual(shown);
        expect(result("가격 변동률").textContent).not.toMatch(new RegExp(`^[+${MINUS}-]`));
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("레버리지가 심볼 최대치를 넘으면 경고하지만 결과는 계속 계산한다", () => {
    /**
     * @spec EC-5
     * @given 첫 화면(BTCUSDT 롱)이다. 표본(손계산 리터럴): 레버리지 151, 진입가 65000, 목표 ROE 34.62 → 원값 65149.02649… → 롱 틱 올림 65149.1 → 목표가 `65,149.10`, 가격 변동률 원값 0.22938…% → `+0.22%`
     * @when 레버리지·진입가·목표 ROE를 키 입력으로 넣는다
     * @then 레버리지 입력란 아래에 `⚠ BTCUSDT의 최대 레버리지는 150배입니다.`가 표시된다
     * @then 레버리지 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @then 목표가가 `65,149.10`으로 표시된다
     * @then 가격 변동률이 `+0.22%`로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-5] 최대 레버리지 경고가 떠 있어도 목표가·가격 변동률이 계산·표시된다", async () => {
      const { user } = renderCalculator();

      await fill(user, { leverage: "151", entry: "65000", roe: "34.62" });

      expectWarningLinked(field("레버리지"), `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`);
      expect(readResults()).toEqual({ price: "65,149.10", change: "+0.22%" });
      expectNoBrokenScreen();
    });
  });

  describe("해당 가격이 없거나 증거금 이상 손실이면 목표 ROE 입력란 아래에 경고한다", () => {
    /**
     * @spec EC-6 EC-7
     * @given 첫 화면에서 방향을 숏으로 바꾼 BTCUSDT 레버리지 10이다. 표본(틱에 맞춘 목표가가 0 이하, 목표 ROE는 −100보다 큼): 진입가 65000·목표 ROE 1000(원값 0), 진입가 65000·목표 ROE 2000(원값 음수), 진입가 1·목표 ROE 995(원값 0.005 → 숏 틱 내림 0)
     * @when 진입가·목표 ROE를 키 입력으로 넣는다
     * @then 목표가·가격 변동률이 모두 `—`(U+2014)로 표시된다
     * @then 목표 ROE 입력란 아래에 `⚠ 이 ROE에 해당하는 가격이 없습니다.`(`⚠`는 U+26A0)가 표시된다
     * @then 목표 ROE 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-6][EC-7] 틱에 맞춘 목표가가 0 이하이면 두 결과는 —이고 목표 ROE 입력란에 가격 없음 경고가 연결돼 표시된다", async () => {
      const { user } = renderCalculator();
      await chooseSide(user, "숏");
      expect(sideButton("숏").getAttribute("aria-pressed")).toBe("true");
      expect(field("레버리지").value).toBe("10");

      const samples = [
        { entry: "65000", roe: "1000" },
        { entry: "65000", roe: "2000" },
        { entry: "1", roe: "995" },
      ];

      for (const sample of samples) {
        await fill(user, sample);

        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectWarningLinked(field("목표 ROE"), NO_PRICE_WARNING);
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-6 EC-7 EC-9
     * @given 첫 화면(BTCUSDT 롱 레버리지 10)이다. 표본(틱에 맞춘 목표가가 0 이하이면서 목표 ROE가 −100 이하): 진입가 65000·목표 ROE -1000(원값 0), 진입가 65000·목표 ROE -2000(원값 음수)
     * @when 진입가·목표 ROE를 키 입력으로 넣는다
     * @then 목표가·가격 변동률이 모두 `—`(U+2014)로 표시된다
     * @then 목표 ROE 입력란 아래에 `⚠ 이 ROE에 해당하는 가격이 없습니다.`가 표시된다
     * @then 목표 ROE 입력란의 `aria-describedby`가 가리키는 경고 요소는 그 가격 없음 경고 하나뿐이다
     * @then 화면 어디에도 `증거금 이상 손실` 경고 문구가 없다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-6][EC-7][EC-9] 목표가가 없고 목표 ROE가 −100 이하이면 가격 없음 경고 하나만 표시하고 증거금 경고는 표시하지 않는다", async () => {
      const { user } = renderCalculator();
      expect(sideButton("롱").getAttribute("aria-pressed")).toBe("true");
      expect(field("레버리지").value).toBe("10");

      const samples = [
        { entry: "65000", roe: "-1000" },
        { entry: "65000", roe: "-2000" },
      ];

      for (const sample of samples) {
        await fill(user, sample);

        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectWarningLinked(field("목표 ROE"), NO_PRICE_WARNING);
        const warnings = linkedWarnings(field("목표 ROE"));
        expect(warnings).toHaveLength(1);
        expect(warnings[0].textContent).toBe(NO_PRICE_WARNING);
        expectNoWarningText(BEYOND_MARGIN_TEXT);
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-8
     * @given 첫 화면이다. 표본(목표 ROE −100 이하이고 틱에 맞춘 목표가가 양수, 손계산 리터럴): T3 = ETHUSDT 롱 25, 진입가 3456.78, 목표 ROE -178.07 → `3,210.57` / `−7.12%`, 경계 = BTCUSDT 롱 10, 진입가 65000, 목표 ROE -100 → `58,500.00` / `−10.00%`, BTCUSDT 숏 10, 진입가 65000, 목표 ROE -100 → `71,500.00` / `+10.00%`
     * @when 표본의 심볼·방향을 고르고 레버리지·진입가·목표 ROE를 키 입력으로 넣는다
     * @then 목표 ROE 입력란 아래에 `⚠ 증거금 이상 손실 — 이 가격 전에 청산됩니다.`(`⚠`는 U+26A0, `—`는 U+2014)가 표시된다
     * @then 목표 ROE 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @then 화면 어디에도 `이 ROE에 해당하는 가격이 없습니다.` 경고 문구가 없다
     * @then 목표가·가격 변동률이 표본의 기대값으로 표시된다(`−`는 U+2212)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-8] 목표 ROE가 −100 이하이고 목표가가 있으면 증거금 경고가 연결돼 표시되고 목표가도 표시된다", async () => {
      const samples: { inputs: Inputs; shown: Shown }[] = [
        { inputs: T3, shown: T3_SHOWN },
        {
          inputs: { symbol: "BTCUSDT", side: "롱", leverage: "10", entry: "65000", roe: "-100" },
          shown: { price: "58,500.00", change: `${MINUS}10.00%` },
        },
        {
          inputs: { symbol: "BTCUSDT", side: "숏", leverage: "10", entry: "65000", roe: "-100" },
          shown: { price: "71,500.00", change: "+10.00%" },
        },
      ];

      for (const { inputs, shown } of samples) {
        const { user, unmount } = renderCalculator();

        await fill(user, inputs);

        expectWarningLinked(field("목표 ROE"), BEYOND_MARGIN_WARNING);
        expectNoWarningText(NO_PRICE_TEXT);
        expect(readResults()).toEqual(shown);
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec EC-7 EC-8
     * @given 첫 화면(BTCUSDT 롱 레버리지 10)이다. 표본(목표 ROE가 −100보다 크고 EC-6에 해당하지 않음): 진입가 65000·목표 ROE -99.99(−100 경계 바로 위), 진입가 65000·목표 ROE 0, 오버플로 = 진입가 `1` 뒤에 `0` 308개(1e308, 유한한 수)·목표 ROE 1000(원값이 유한하지 않아 결과 없음, 틱에 맞춘 목표가가 0 이하인 경우가 아님)
     * @when 진입가·목표 ROE에 표본 값을 키 입력으로 넣는다
     * @then 화면 어디에도 `이 ROE에 해당하는 가격이 없습니다.` 경고 문구가 없다
     * @then 화면 어디에도 `증거금 이상 손실` 경고 문구가 없다
     * @then 목표 ROE 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 오버플로 표본에서는 목표가·가격 변동률이 모두 `—`(U+2014)로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-7][EC-8] 목표 ROE가 −100보다 크고 틱에 맞춘 목표가가 0 이하가 아니면 가격 없음 경고와 증거금 경고가 모두 없다", async () => {
      const { user } = renderCalculator();
      expect(sideButton("롱").getAttribute("aria-pressed")).toBe("true");
      expect(field("레버리지").value).toBe("10");

      // 1 뒤에 0 308개 = 1e308. 유한한 수지만 목표 ROE 1000이면 원값이 유한하지 않다.
      const overflowEntry = `1${"0".repeat(308)}`;
      expect(Number.isFinite(Number(overflowEntry))).toBe(true);

      function expectNoTargetRoeWarning() {
        expectNoWarningText(NO_PRICE_TEXT, BEYOND_MARGIN_TEXT);
        expectNoWarningLinked(field("목표 ROE"));
      }

      for (const roe of ["-99.99", "0"]) {
        await fill(user, { entry: "65000", roe });
        expect(field("진입가").value).toBe("65000");
        expect(field("목표 ROE").value).toBe(roe);

        expectNoTargetRoeWarning();
        expectNoBrokenScreen();
      }

      // 오버플로 표본: 경고 없이 두 결과가 —다.
      await fill(user, { entry: overflowEntry, roe: "1000" });
      expect(field("진입가").value).toBe(overflowEntry);
      expect(field("목표 ROE").value).toBe("1000");

      expectNoTargetRoeWarning();
      expect(readResults()).toEqual(EMPTY_RESULTS);
      expectNoBrokenScreen();
    });
  });

  describe("심볼이나 방향을 바꾸면 입력값은 남고 결과만 다시 계산된다", () => {
    /**
     * @spec EC-10
     * @given 표본의 입력이 들어가 결과가 표시돼 있다. 표본(손계산 리터럴): 틱 차이 = T3 입력(ETHUSDT 롱 25, 진입가 3456.78, 목표 ROE -178.07, `3,210.57` / `−7.12%`)에서 BTCUSDT로 바꾸면 틱 0.1 올림으로 `3,210.60` / `−7.12%`, 표시 자릿수 차이 = T1 입력(BTCUSDT 롱 10, 진입가 65000, 목표 ROE 34.62, `67,250.30` / `+3.46%`)에서 SOLUSDT로 바꾸면 `67,250.300` / `+3.46%`
     * @when 심볼을 표본의 새 심볼로 바꾼다
     * @then 방향·레버리지·진입가·목표 ROE 입력값은 바뀌지 않는다
     * @then 목표가가 새 심볼의 tickSize·priceScale로 다시 계산돼 표본의 기대값으로 표시된다
     * @then 가격 변동률이 다시 계산된 목표가 기준으로 표본의 기대값으로 표시된다(`−`는 U+2212)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-10] 심볼을 바꿔도 입력값은 유지되고 새 심볼의 틱·표시 자릿수로 결과가 다시 계산된다", async () => {
      const samples: { start: Inputs; startShown: Shown; to: SymbolName; shown: Shown }[] = [
        {
          start: T3,
          startShown: T3_SHOWN,
          to: "BTCUSDT",
          shown: { price: "3,210.60", change: `${MINUS}7.12%` },
        },
        {
          start: T1,
          startShown: T1_SHOWN,
          to: "SOLUSDT",
          shown: { price: "67,250.300", change: "+3.46%" },
        },
      ];

      for (const { start, startShown, to, shown } of samples) {
        const { user, unmount } = renderCalculator();
        await fill(user, start);
        expect(readResults()).toEqual(startShown);

        await chooseSymbol(user, to);

        // 심볼만 바뀌고 방향·레버리지·진입가·목표 ROE는 그대로다.
        expect(readInputs()).toEqual({ ...start, symbol: to });
        expect(readResults()).toEqual(shown);
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec EC-11
     * @given 표본의 입력이 들어가 결과가 표시돼 있다. 표본(손계산 리터럴): 반올림 방향 차이 = T2 입력(BTCUSDT 숏 20, 진입가 98765.4, 목표 ROE -24.99, `99,999.40` / `+1.24%`)에서 롱으로 바꾸면 원값 97531.326327 → 롱 틱 올림 97531.4 → `97,531.40` / `−1.24%` (숏의 내림을 그대로 쓰면 `97,531.30`이 되어 구별된다), 공식 차이 = T1 입력(BTCUSDT 롱 10, 진입가 65000, 목표 ROE 34.62, `67,250.30` / `+3.46%`)에서 숏으로 바꾸면 원값 62749.7 → `62,749.70` / `−3.46%`
     * @when 방향을 표본의 반대 방향으로 바꾼다
     * @then 심볼·레버리지·진입가·목표 ROE 입력값은 바뀌지 않는다
     * @then 목표가가 바뀐 방향의 공식과 반올림 방향으로 다시 계산돼 표본의 기대값으로 표시된다
     * @then 가격 변동률이 다시 계산된 목표가 기준으로 표본의 기대값으로 표시된다(`−`는 U+2212)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-11] 방향을 바꿔도 입력값은 유지되고 바뀐 방향의 공식과 반올림 방향으로 결과가 다시 계산된다", async () => {
      const samples: { start: Inputs; startShown: Shown; to: SideName; shown: Shown }[] = [
        {
          start: T2,
          startShown: T2_SHOWN,
          to: "롱",
          shown: { price: "97,531.40", change: `${MINUS}1.24%` },
        },
        {
          start: T1,
          startShown: T1_SHOWN,
          to: "숏",
          shown: { price: "62,749.70", change: `${MINUS}3.46%` },
        },
      ];

      for (const { start, startShown, to, shown } of samples) {
        const { user, unmount } = renderCalculator();
        await fill(user, start);
        expect(readResults()).toEqual(startShown);

        await chooseSide(user, to);

        // 방향만 바뀌고 심볼·레버리지·진입가·목표 ROE는 그대로다.
        expect(readInputs()).toEqual({ ...start, side: to });
        expect(readResults()).toEqual(shown);
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("입력을 지워 계산할 수 없게 되면 결과와 목표 ROE 경고가 사라진다", () => {
    /**
     * @spec EC-12
     * @given 표본의 입력이 들어가 있다. 표본(상태): 가격 없음 경고 = BTCUSDT 숏 10, 진입가 65000, 목표 ROE 1000(`⚠ 이 ROE에 해당하는 가격이 없습니다.` 표시), 증거금 경고 = T3 입력(`⚠ 증거금 이상 손실 — 이 가격 전에 청산됩니다.` 표시, `3,210.57` / `−7.12%`). 표본(지우기): 상태마다 목표 ROE 입력란, 진입가 입력란, 레버리지 입력란을 각각 비운다
     * @when 표본의 입력란을 지운다
     * @then 목표가·가격 변동률이 모두 `—`(U+2014)로 표시된다
     * @then 화면 어디에도 `이 ROE에 해당하는 가격이 없습니다.`·`증거금 이상 손실` 경고 문구가 없다
     * @then 목표 ROE 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류(console.error)가 기록되지 않는다
     */
    it("[EC-12] 입력을 지워 계산할 수 없게 되면 두 결과가 —로 돌아가고 목표 ROE 경고도 사라진다", async () => {
      const states: { inputs: Inputs; warning: string; shown: Shown }[] = [
        {
          inputs: { symbol: "BTCUSDT", side: "숏", leverage: "10", entry: "65000", roe: "1000" },
          warning: NO_PRICE_WARNING,
          shown: EMPTY_RESULTS,
        },
        { inputs: T3, warning: BEYOND_MARGIN_WARNING, shown: T3_SHOWN },
      ];
      const cleared: FieldName[] = ["목표 ROE", "진입가", "레버리지"];

      for (const { inputs, warning, shown } of states) {
        for (const name of cleared) {
          const { user, unmount } = renderCalculator();
          await fill(user, inputs);
          expectWarningLinked(field("목표 ROE"), warning);
          expect(readResults()).toEqual(shown);

          await user.clear(field(name));

          expect(field(name).value).toBe("");
          expect(readResults()).toEqual(EMPTY_RESULTS);
          expectNoWarningText(NO_PRICE_TEXT, BEYOND_MARGIN_TEXT);
          expectNoWarningLinked(field("목표 ROE"));
          expectNoBrokenScreen();
          unmount();
        }
      }
    });
  });
});
