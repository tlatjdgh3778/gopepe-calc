import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { MaxQuantityCalculator } from "@/components/max-quantity-calculator";
import { SYMBOLS_AS_OF } from "@/lib/symbols";

// 계산기를 단독으로 렌더한다. 첫 화면 기본값은 BTCUSDT·레버리지 10이다.
// 기대값은 스펙 3장 기준 사례 표(M1~M5)와 DoD-7~DoD-9·EC 규칙으로 손계산한 리터럴이다.
// `⚠`는 U+26A0, 빈 결과 `—`는 U+2014로 정확히 비교한다.
// 결과 라벨 `최대 수량`이 탭·탭 패널 이름과 겹치므로 결과·경고는 `최대 수량 결과` 영역 범위에서 찾고,
// "결과가 `—`" 판정은 결과 셀 단위로 한다. 경고의 위치(행 순서)는 판정하지 않는다.
// 스펙 5장 불변식과 계획 T-5 완료 조건 (7): 모든 case에서 화면(텍스트·입력값)에 `NaN`·`Infinity`가 없고
// `console.error`가 호출되지 않는다(`vi.spyOn` 관찰만 허용).

// 기호는 코드 포인트로 정확히 비교한다.
const WARN = "⚠"; // ⚠
const DASH = "—"; // —

const FEE_NOTE = "수수료를 빼지 않은 값이라 실제 주문 가능 수량은 더 작을 수 있습니다.";
const TIER_FRAGMENT = "포지션 가치가 유지증거금률 첫 단계 한도";
const MIN_QTY_FRAGMENT = "최소 주문 수량은";

function tierWarning(limit: string): string {
  return `${WARN} ${TIER_FRAGMENT}(${limit} USDT)를 넘습니다. 실제 최대 수량은 더 작을 수 있습니다.`;
}

function minQtyWarning(qtyWithCoin: string): string {
  return `${WARN} ${MIN_QTY_FRAGMENT} ${qtyWithCoin}입니다.`;
}

type User = ReturnType<typeof userEvent.setup>;
type SymbolName = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type FieldName = "레버리지" | "진입가" | "사용 가능 잔고";
type ResultName = "최대 수량" | "포지션 가치";
type Inputs = { symbol: SymbolName; leverage: string; entry: string; balance: string };
type Shown = { qty: string | null; value: string | null };

const SYMBOL_NAMES: SymbolName[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const FIELD_NAMES: FieldName[] = ["레버리지", "진입가", "사용 가능 잔고"];
const EMPTY_RESULTS: Shown = { qty: DASH, value: DASH };

// 기준 사례(스펙 3장 표)
const M1: Inputs = { symbol: "BTCUSDT", leverage: "10", entry: "65000", balance: "1000" };
const M2: Inputs = { symbol: "BTCUSDT", leverage: "100", entry: "98765.4", balance: "5000" };
const M3: Inputs = { symbol: "ETHUSDT", leverage: "25", entry: "3456.78", balance: "800" };
const M4: Inputs = { symbol: "SOLUSDT", leverage: "5", entry: "142.5", balance: "100" };
const M5: Inputs = { symbol: "BTCUSDT", leverage: "10", entry: "50000", balance: "500" };
const M1_SHOWN: Shown = { qty: "0.153 BTC", value: "9,945.00 USDT" };
const M2_SHOWN: Shown = { qty: "5.062 BTC", value: "499,950.45 USDT" };
// EC-5 예시(SOLUSDT, 레버리지 1, 진입가 150, 잔고 10 → 원값 0.0666…)
const SOL_BELOW_MIN: Inputs = { symbol: "SOLUSDT", leverage: "1", entry: "150", balance: "10" };

let consoleErrorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  // 관찰만 한다. 원래 console.error 동작은 그대로 둔다(대체하지 않는다).
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function renderCalculator(options: { fast?: boolean } = {}) {
  const user = options.fast ? userEvent.setup({ delay: null }) : userEvent.setup();
  const { unmount } = render(<MaxQuantityCalculator />);
  return { user, unmount };
}

function inputRegion(): HTMLElement {
  return screen.getByRole("region", { name: "최대 수량 입력" });
}

function resultRegion(): HTMLElement {
  return screen.getByRole("region", { name: "최대 수량 결과" });
}

function field(name: FieldName): HTMLInputElement {
  return within(inputRegion()).getByRole("textbox", { name }) as HTMLInputElement;
}

function symbolSelect(): HTMLElement {
  return within(inputRegion()).getByRole("combobox", { name: "심볼" });
}

/** 선택된 심볼(콤보박스 표시 문자열에 들어 있는 심볼 이름). */
function selectedSymbol(): SymbolName | undefined {
  const text = symbolSelect().textContent ?? "";
  const found = SYMBOL_NAMES.filter((name) => text.includes(name));
  return found.length === 1 ? found[0] : undefined;
}

/** `최대 수량 결과` 영역 안의 결과 값 셀(이름은 결과 라벨). */
function result(name: ResultName): HTMLElement {
  return within(resultRegion()).getByLabelText(name, { exact: true });
}

/** 두 결과 셀의 표시 문자열. `—` 판정도 셀 단위로 한다. */
function readResults(): Shown {
  return { qty: result("최대 수량").textContent, value: result("포지션 가치").textContent };
}

function readFields(): Record<FieldName, string> {
  return {
    레버리지: field("레버리지").value,
    진입가: field("진입가").value,
    "사용 가능 잔고": field("사용 가능 잔고").value,
  };
}

/** 기존 값을 지우고 실제 키 입력으로 새 값을 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, name: FieldName, value: string) {
  const input = field(name);
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

async function chooseSymbol(user: User, symbol: SymbolName) {
  await user.click(symbolSelect());
  await user.click(await screen.findByRole("option", { name: symbol }));
}

/** 심볼 → 레버리지 → 진입가 → 사용 가능 잔고 순서로 넣는다. 심볼은 다를 때만 고른다. */
async function fill(user: User, inputs: Inputs) {
  if (selectedSymbol() !== inputs.symbol) {
    await chooseSymbol(user, inputs.symbol);
  }
  expect(selectedSymbol()).toBe(inputs.symbol);
  await typeInto(user, "레버리지", inputs.leverage);
  await typeInto(user, "진입가", inputs.entry);
  await typeInto(user, "사용 가능 잔고", inputs.balance);
}

function fieldsOf(inputs: Inputs): Record<FieldName, string> {
  return { 레버리지: inputs.leverage, 진입가: inputs.entry, "사용 가능 잔고": inputs.balance };
}

/** `최대 수량 결과` 영역 안에 이 경고 문구가 정확히 하나 있다. */
function expectWarningInResults(message: string) {
  const matches = within(resultRegion()).getAllByText(message, { exact: true });
  expect(matches).toHaveLength(1);
  expect(matches[0].textContent).toBe(message);
}

/** 화면 어디에도 이 경고 문구 조각이 없다. */
function expectNoWarningText(...fragments: string[]) {
  for (const fragment of fragments) {
    expect(document.body.textContent).not.toContain(fragment);
  }
}

/** `a`가 문서 순서상 `b`보다 뒤에 있다. */
function isAfter(a: Node, b: Node): boolean {
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function expectNoNaNOrInfinity() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.queryAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
}

/** 화면 텍스트·입력값에 NaN·Infinity가 없고 콘솔 오류가 없다. */
function expectNoBrokenScreen() {
  expectNoNaNOrInfinity();
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

describe("최대 수량 계산 — 심볼·레버리지·진입가·사용 가능 잔고를 넣으면 최대 수량과 포지션 가치가 계산 버튼 없이 바로 표시된다", () => {
  describe("첫 화면에는 기본값과 이름 붙은 입력·결과, 기준일 문구가 보인다", () => {
    /**
     * @spec DoD-5
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 입력란과 `최대 수량 결과` 영역을 본다
     * @then 심볼은 BTCUSDT, 레버리지 입력값은 `10`이다
     * @then 진입가·사용 가능 잔고 입력값은 빈 문자열이다
     * @then 최대 수량·포지션 가치 결과 셀은 각각 정확히 `—`(U+2014)다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-5] 첫 화면은 BTCUSDT·레버리지 10이고 진입가·사용 가능 잔고는 비어 있으며 두 결과는 —다", async () => {
      renderCalculator();

      expect(selectedSymbol()).toBe("BTCUSDT");
      expect(field("레버리지").value).toBe("10");
      expect(field("진입가").value).toBe("");
      expect(field("사용 가능 잔고").value).toBe("");
      expect(readResults()).toEqual(EMPTY_RESULTS);
      expectNoBrokenScreen();
    });

    /**
     * @spec DoD-11
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 입력 컨트롤과 결과를 접근 이름으로 찾는다
     * @then `최대 수량 입력` 영역에 접근 이름이 심볼, 레버리지, 진입가, 사용 가능 잔고인 입력 컨트롤이 각각 있다
     * @then `최대 수량 결과` 영역에 이름이 최대 수량, 포지션 가치인 결과가 각각 있다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-11] 입력 컨트롤 이름은 심볼·레버리지·진입가·사용 가능 잔고이고 결과 이름은 최대 수량·포지션 가치다", async () => {
      renderCalculator();

      const inputs = within(inputRegion());
      expect(inputs.getByRole("combobox", { name: "심볼" })).toBeDefined();
      for (const name of FIELD_NAMES) {
        expect(inputs.getByRole("textbox", { name })).toBeDefined();
      }
      const results = within(resultRegion());
      for (const name of ["최대 수량", "포지션 가치"] as const) {
        expect(results.getByLabelText(name, { exact: true })).toBeDefined();
      }
      expectNoBrokenScreen();
    });

    /**
     * @spec DoD-6
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when `최대 수량 입력` 영역을 본다
     * @then 그 영역 안에 `SymbolSelect`의 심볼 정보 기준일 문구(`심볼 정보 기준일 {SYMBOLS_AS_OF} (Bybit)`)가 표시된다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-6] 입력 카드에 심볼 정보 기준일 문구가 표시된다", async () => {
      renderCalculator();

      const text = `심볼 정보 기준일 ${SYMBOLS_AS_OF} (Bybit)`;
      const note = within(inputRegion()).getByText(text, { exact: true });
      expect(note.textContent).toBe(text);
      expectNoBrokenScreen();
    });
  });

  describe("입력하면 계산 버튼 없이 최대 수량과 포지션 가치가 표시된다", () => {
    /**
     * @spec DoD-7 DoD-8 DoD-9
     * @given 첫 화면에서 기준 사례를 하나씩 입력한다(새로 렌더). 표본(심볼·레버리지·진입가·잔고 → 수량 표시·가치 표시): M1 BTCUSDT·10·65000·1000 → `0.153 BTC`·`9,945.00 USDT` / M2 BTCUSDT·100·98765.4·5000 → `5.062 BTC`·`499,950.45 USDT` / M3 ETHUSDT·25·3456.78·800 → `5.78 ETH`·`19,980.18 USDT` / M4 SOLUSDT·5·142.5·100 → `3.5 SOL`·`498.75 USDT` / M5 BTCUSDT·10·50000·500 → `0.100 BTC`·`5,000.00 USDT`
     * @when 심볼을 고르고 레버리지·진입가·사용 가능 잔고를 키 입력하고, 어떤 버튼도 누르지 않는다
     * @then `최대 수량 결과` 영역의 최대 수량 결과 셀이 표본의 수량 표시와 정확히 같다(`{formatCoinQty(qty, qtyStep)} {baseCoin}` 형식)
     * @then 같은 영역의 포지션 가치 결과 셀이 표본의 가치 표시와 정확히 같다(`formatUsdt(positionValue)` 형식)
     * @then 기준 사례 표의 한도 경고가 `없음`인 M1·M3·M4·M5에는 한도 경고가 없다(M2의 한도 경고 문구는 DoD-9 한도 초과 case가 본다)
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-7][DoD-8][DoD-9] 기준 사례 M1~M5를 입력하면 최대 수량과 포지션 가치가 표의 표시값으로 바로 보이고 M1·M3·M4·M5에는 한도 경고가 없다", async () => {
      const cases: { id: string; inputs: Inputs; shown: Shown; tierWarning: boolean }[] = [
        { id: "M1", inputs: M1, shown: M1_SHOWN, tierWarning: false },
        { id: "M2", inputs: M2, shown: M2_SHOWN, tierWarning: true },
        {
          id: "M3",
          inputs: M3,
          shown: { qty: "5.78 ETH", value: "19,980.18 USDT" },
          tierWarning: false,
        },
        {
          id: "M4",
          inputs: M4,
          shown: { qty: "3.5 SOL", value: "498.75 USDT" },
          tierWarning: false,
        },
        {
          id: "M5",
          inputs: M5,
          shown: { qty: "0.100 BTC", value: "5,000.00 USDT" },
          tierWarning: false,
        },
      ];

      for (const c of cases) {
        const { user, unmount } = renderCalculator();

        await fill(user, c.inputs);

        expect(readResults()).toEqual(c.shown);
        if (!c.tierWarning) {
          expectNoWarningText(TIER_FRAGMENT);
        }
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("포지션 가치가 심볼의 유지증거금률 첫 단계 한도를 넘으면 한도 경고가 보인다", () => {
    /**
     * @spec DoD-9
     * @given 첫 화면에서 포지션 가치가 한도를 넘는 입력을 넣는다(새로 렌더). 표본(심볼·레버리지·진입가·잔고 → 수량·가치 → 한도): M2 BTCUSDT·100·98765.4·5000 → `5.062 BTC`·`499,950.45 USDT` → `300,000` / SOLUSDT·10·100·6000 → `600.0 SOL`·`60,000.00 USDT` → `50,000`
     * @when 입력을 마친 결과 카드를 본다
     * @then `최대 수량 결과` 영역 안에 `⚠ 포지션 가치가 유지증거금률 첫 단계 한도({한도} USDT)를 넘습니다. 실제 최대 수량은 더 작을 수 있습니다.`가 표본의 한도로 정확히 표시된다(`⚠`는 U+26A0)
     * @then 최대 수량·포지션 가치 결과 셀은 표본의 표시값 그대로다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-9] 포지션 가치가 한도를 넘으면 BTC(300,000)·SOL(50,000) 한도 경고 문구가 결과 카드에 표시된다", async () => {
      const cases: { inputs: Inputs; shown: Shown; limit: string }[] = [
        { inputs: M2, shown: M2_SHOWN, limit: "300,000" },
        {
          inputs: { symbol: "SOLUSDT", leverage: "10", entry: "100", balance: "6000" },
          shown: { qty: "600.0 SOL", value: "60,000.00 USDT" },
          limit: "50,000",
        },
      ];

      for (const c of cases) {
        const { user, unmount } = renderCalculator();

        await fill(user, c.inputs);

        expectWarningInResults(tierWarning(c.limit));
        expect(readResults()).toEqual(c.shown);
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec EC-7
     * @given 첫 화면에서 BTCUSDT, 레버리지 10, 진입가 100000, 사용 가능 잔고 30000을 입력한다
     * @when 결과 카드를 본다
     * @then 최대 수량 결과 셀은 `3.000 BTC`, 포지션 가치 결과 셀은 `300,000.00 USDT`다
     * @then `포지션 가치가 유지증거금률 첫 단계 한도` 경고가 화면에 없다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-7] 포지션 가치가 한도와 정확히 같으면 한도 경고는 표시되지 않는다", async () => {
      const { user } = renderCalculator();

      await fill(user, { symbol: "BTCUSDT", leverage: "10", entry: "100000", balance: "30000" });

      expect(readResults()).toEqual({ qty: "3.000 BTC", value: "300,000.00 USDT" });
      expectNoWarningText(TIER_FRAGMENT);
      expectNoBrokenScreen();
    });
  });

  describe("수수료를 빼지 않았다는 고지는 입력과 무관하게 항상 보인다", () => {
    /**
     * @spec DoD-10
     * @given 표본 상태: 첫 화면 / M1 입력 후 / SOLUSDT·레버리지 1·진입가 150·잔고 10(최소 수량 미달) 입력 후 / M2(한도 초과) 입력 후 / 입력을 모두 지운 뒤
     * @when 각 상태에서 화면을 본다
     * @then `수수료를 빼지 않은 값이라 실제 주문 가능 수량은 더 작을 수 있습니다.`가 정확히 표시된다
     * @then 그 문구는 `최대 수량 입력`·`최대 수량 결과` 영역 밖, 두 영역 뒤(문서 순서)에 있다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-10] 수수료 미반영 고지는 계산기 아래에 입력과 무관하게 항상 표시된다", async () => {
      const { user } = renderCalculator();

      const expectFeeNote = () => {
        const matches = screen.getAllByText(FEE_NOTE, { exact: true });
        expect(matches).toHaveLength(1);
        const note = matches[0];
        expect(note.textContent).toBe(FEE_NOTE);
        for (const region of [inputRegion(), resultRegion()]) {
          expect(region.contains(note)).toBe(false);
          expect(isAfter(note, region)).toBe(true);
        }
        expectNoBrokenScreen();
      };

      expectFeeNote();

      await fill(user, M1);
      expect(readResults()).toEqual(M1_SHOWN);
      expectFeeNote();

      await fill(user, SOL_BELOW_MIN);
      expectWarningInResults(minQtyWarning("0.1 SOL"));
      expectFeeNote();

      await fill(user, M2);
      expectWarningInResults(tierWarning("300,000"));
      expectFeeNote();

      for (const name of FIELD_NAMES) {
        await typeInto(user, name, "");
      }
      expect(readFields()).toEqual({ 레버리지: "", 진입가: "", "사용 가능 잔고": "" });
      expectFeeNote();
    });
  });

  describe("숫자가 아닌 입력은 무시되고 직전 값이 유지된다", () => {
    /**
     * @spec EC-1
     * @given 첫 화면에서 M1(BTCUSDT·10·65000·1000)을 입력해 `0.153 BTC`·`9,945.00 USDT`가 표시돼 있다. 표본(레버리지 입력란 끝에 키 입력): `a`, `.`, `-`, `e`, `+`, ` `(공백)
     * @when 레버리지 입력란에 표본 문자를 하나씩 키 입력한다
     * @then 레버리지 입력값은 `10` 그대로다
     * @then 최대 수량·포지션 가치 결과 셀은 `0.153 BTC`·`9,945.00 USDT` 그대로다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-1] 레버리지 입력란은 숫자만 받고 다른 문자가 섞인 변경은 무시된다", async () => {
      const { user } = renderCalculator();
      await fill(user, M1);
      expect(readResults()).toEqual(M1_SHOWN);

      for (const key of ["a", ".", "-", "e", "+", " "]) {
        await user.type(field("레버리지"), key);

        expect(field("레버리지").value).toBe("10");
        expect(readResults()).toEqual(M1_SHOWN);
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-1
     * @given 첫 화면에서 M1(BTCUSDT·10·65000·1000)을 입력해 `0.153 BTC`·`9,945.00 USDT`가 표시돼 있다. 표본(진입가·사용 가능 잔고 입력란 각각의 끝에 키 입력): `a`, `-`, `e`, `+`, `,`, ` `(공백), 이미 소수점이 있는 값(`65000.` / `1000.`)에 두 번째 `.`
     * @when 진입가·사용 가능 잔고 입력란에 표본 문자를 하나씩 키 입력한다
     * @then 그 입력란의 값은 키 입력 직전 값 그대로다
     * @then 최대 수량·포지션 가치 결과 셀은 직전 표시값 그대로다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-1] 진입가·사용 가능 잔고 입력란은 숫자와 소수점 하나만 받고 다른 문자가 섞인 변경은 무시된다", async () => {
      const { user } = renderCalculator();
      await fill(user, M1);
      expect(readResults()).toEqual(M1_SHOWN);

      for (const name of ["진입가", "사용 가능 잔고"] as const) {
        for (const key of ["a", "-", "e", "+", ",", " "]) {
          const before = field(name).value;
          const shown = readResults();

          await user.type(field(name), key);

          expect(field(name).value).toBe(before);
          expect(readResults()).toEqual(shown);
          expectNoBrokenScreen();
        }

        // 소수점 하나는 받는다. 이미 소수점이 있는 값에 두 번째 `.`은 무시된다.
        const original = field(name).value;
        await user.type(field(name), ".");
        expect(field(name).value).toBe(`${original}.`);
        const before = field(name).value;
        const shown = readResults();

        await user.type(field(name), ".");

        expect(field(name).value).toBe(before);
        expect(readResults()).toEqual(shown);
        expectNoBrokenScreen();
      }
    });
  });

  describe("계산할 수 없는 입력이면 결과는 —이고 경고는 없다", () => {
    /**
     * @spec EC-2
     * @given 새로 렌더한 첫 화면에 기준 입력을 넣고 한 입력란만 표본 값으로 둔다. 기준 입력: M2(BTCUSDT·100·98765.4·5000, 유효하면 한도 경고가 켜짐) / SOLUSDT·1·150·10(유효하면 최소 수량 경고가 켜짐). 표본: 진입가 `.`·`0` / 사용 가능 잔고 `.`·`0` / 레버리지 `0`(레버리지 `.`·음수, 진입가·잔고 음수는 입력 규칙상 입력되지 않는다). 빈 값 표본은 같은 기준 상태에서 입력란을 지우는 EC-9 case가 덮는다
     * @when 결과 카드를 본다
     * @then 최대 수량·포지션 가치 결과 셀은 각각 정확히 `—`(U+2014)다
     * @then `⚠ 최소 주문 수량은` 경고가 화면에 없다
     * @then `⚠ 포지션 가치가 유지증거금률 첫 단계 한도` 경고가 화면에 없다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-2] 진입가·사용 가능 잔고·레버리지 중 하나라도 .이거나 0이면 두 결과는 —이고 최소 수량·한도 경고가 없다", async () => {
      const bases: { inputs: Inputs; warning: string }[] = [
        { inputs: M2, warning: tierWarning("300,000") },
        { inputs: SOL_BELOW_MIN, warning: minQtyWarning("0.1 SOL") },
      ];
      const samples: { name: FieldName; value: string }[] = [
        { name: "진입가", value: "." },
        { name: "진입가", value: "0" },
        { name: "사용 가능 잔고", value: "." },
        { name: "사용 가능 잔고", value: "0" },
        { name: "레버리지", value: "0" },
      ];

      for (const base of bases) {
        for (const sample of samples) {
          const { user, unmount } = renderCalculator();
          await fill(user, base.inputs);
          // 전제: 기준 입력이 유효하면 경고가 켜진다.
          expectWarningInResults(base.warning);

          await typeInto(user, sample.name, sample.value);

          expect(field(sample.name).value).toBe(sample.value);
          expect(readResults()).toEqual(EMPTY_RESULTS);
          expectNoWarningText(MIN_QTY_FRAGMENT, TIER_FRAGMENT);
          expectNoBrokenScreen();
          unmount();
        }
      }
    });

    /**
     * @spec EC-3
     * @given 첫 화면(BTCUSDT)이다. 표본(키 입력 가능한 긴 숫자): 잔고 309자리(`1` 뒤에 `0` 308개)·레버리지 10·진입가 1(잔고 × 레버리지가 부동소수점 범위를 넘음) / 잔고 307자리(`1` 뒤에 `0` 306개)·레버리지 10·진입가 1(수량을 내린 값이 넘침)
     * @when 레버리지·진입가·사용 가능 잔고 입력란에 표본 값을 키 입력한다(긴 입력이라 case별 timeout을 둘 수 있다)
     * @then 사용 가능 잔고 입력값은 키 입력한 숫자 문자열 그대로다
     * @then 최대 수량·포지션 가치 결과 셀은 각각 정확히 `—`(U+2014)다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-3] 입력은 유한하지만 계산 결과가 유한하지 않으면 두 결과는 —다", async () => {
      const samples = [
        { balance: `1${"0".repeat(308)}`, digits: 309 },
        { balance: `1${"0".repeat(306)}`, digits: 307 },
      ];

      for (const sample of samples) {
        expect(sample.balance).toHaveLength(sample.digits);
        const { user, unmount } = renderCalculator({ fast: true });
        expect(selectedSymbol()).toBe("BTCUSDT");

        await typeInto(user, "레버리지", "10");
        await typeInto(user, "진입가", "1");
        await typeInto(user, "사용 가능 잔고", sample.balance);

        expect(field("사용 가능 잔고").value).toBe(sample.balance);
        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectNoBrokenScreen();
        unmount();
      }
    }, 60_000);
  });

  describe("레버리지가 심볼 최대치를 넘어도 결과는 계속 계산된다", () => {
    /**
     * @spec EC-4
     * @given 첫 화면에서 레버리지를 심볼 최대치보다 크게 입력한다(새로 렌더). 표본(심볼·레버리지·진입가·잔고 → 레버리지 경고 → 수량·가치): BTCUSDT·200·65000·1000 → `⚠ BTCUSDT의 최대 레버리지는 150배입니다.` → `3.076 BTC`·`199,940.00 USDT` / SOLUSDT·101·142.5·100 → `⚠ SOLUSDT의 최대 레버리지는 100배입니다.` → `70.8 SOL`·`10,089.00 USDT`
     * @when 입력을 마친 화면을 본다
     * @then `LeverageField`의 최대 레버리지 경고가 표본 문구로 정확히 표시된다
     * @then 최대 수량·포지션 가치 결과 셀은 표본의 표시값과 정확히 같다(`—`가 아니다)
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-4] 레버리지가 심볼 최대치를 넘으면 최대 레버리지 경고가 보이고 최대 수량·포지션 가치는 계속 표시된다", async () => {
      const cases: { inputs: Inputs; warning: string; shown: Shown }[] = [
        {
          inputs: { symbol: "BTCUSDT", leverage: "200", entry: "65000", balance: "1000" },
          warning: `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`,
          shown: { qty: "3.076 BTC", value: "199,940.00 USDT" },
        },
        {
          inputs: { symbol: "SOLUSDT", leverage: "101", entry: "142.5", balance: "100" },
          warning: `${WARN} SOLUSDT의 최대 레버리지는 100배입니다.`,
          shown: { qty: "70.8 SOL", value: "10,089.00 USDT" },
        },
      ];

      for (const c of cases) {
        const { user, unmount } = renderCalculator();

        await fill(user, c.inputs);

        const warning = screen.getByText(c.warning, { exact: true });
        expect(warning.textContent).toBe(c.warning);
        expect(readResults()).toEqual(c.shown);
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("내린 수량이 최소 주문 수량보다 작으면 결과는 —이고 최소 수량 경고가 보인다", () => {
    /**
     * @spec EC-5 EC-6
     * @given 첫 화면에서 내린 수량이 0이거나 `minOrderQty`보다 작은 입력을 넣는다(새로 렌더). 표본(심볼·레버리지·진입가·잔고 → 원값 → 경고): SOLUSDT·1·150·10 → 0.0666… → `⚠ 최소 주문 수량은 0.1 SOL입니다.` / BTCUSDT·1·100000·50 → 0.0005 → `⚠ 최소 주문 수량은 0.001 BTC입니다.` / ETHUSDT·1·3000·10 → 0.00333… → `⚠ 최소 주문 수량은 0.01 ETH입니다.`
     * @when 결과 카드를 본다
     * @then 최대 수량·포지션 가치 결과 셀은 각각 정확히 `—`(U+2014)다
     * @then `최대 수량 결과` 영역 안에 표본의 최소 수량 경고가 정확히 표시된다(`⚠`는 U+26A0)
     * @then `포지션 가치가 유지증거금률 첫 단계 한도` 경고가 화면에 없다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-5][EC-6] 내린 수량이 최소 주문 수량 미만이면 두 결과는 —이고 최소 주문 수량 경고만 표시된다", async () => {
      const cases: { inputs: Inputs; warning: string }[] = [
        { inputs: SOL_BELOW_MIN, warning: minQtyWarning("0.1 SOL") },
        {
          inputs: { symbol: "BTCUSDT", leverage: "1", entry: "100000", balance: "50" },
          warning: minQtyWarning("0.001 BTC"),
        },
        {
          inputs: { symbol: "ETHUSDT", leverage: "1", entry: "3000", balance: "10" },
          warning: minQtyWarning("0.01 ETH"),
        },
      ];

      for (const c of cases) {
        const { user, unmount } = renderCalculator();

        await fill(user, c.inputs);

        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectWarningInResults(c.warning);
        expectNoWarningText(TIER_FRAGMENT);
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("심볼을 바꾸면 입력은 유지되고 새 심볼 기준으로 결과와 경고가 다시 계산된다", () => {
    /**
     * @spec EC-8
     * @given 경고가 없는 상태에서 심볼만 바꾸면 경고가 켜지는 표본(새로 렌더): BTCUSDT·10·100·6000(`600.000 BTC`·`60,000.00 USDT`, 경고 없음) → SOLUSDT / BTCUSDT·1·150·10(`0.066 BTC`·`9.90 USDT`, 경고 없음) → SOLUSDT
     * @when 심볼 선택에서 SOLUSDT를 고른다
     * @then 레버리지·진입가·사용 가능 잔고 입력값은 바꾸기 전 그대로다
     * @then 첫 표본: 결과 셀은 `600.0 SOL`·`60,000.00 USDT`이고 `최대 수량 결과` 영역에 `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(50,000 USDT)를 넘습니다. 실제 최대 수량은 더 작을 수 있습니다.`가 표시된다
     * @then 둘째 표본: 두 결과 셀은 정확히 `—`이고 `최대 수량 결과` 영역에 `⚠ 최소 주문 수량은 0.1 SOL입니다.`가 표시된다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-8] 심볼을 바꿔 새 심볼의 한도·최소 수량에 걸리면 입력은 유지되고 경고가 켜진다", async () => {
      // 첫 표본: 한도 경고가 켜진다.
      {
        const inputs: Inputs = { symbol: "BTCUSDT", leverage: "10", entry: "100", balance: "6000" };
        const { user, unmount } = renderCalculator();
        await fill(user, inputs);
        expect(readResults()).toEqual({ qty: "600.000 BTC", value: "60,000.00 USDT" });
        expectNoWarningText(TIER_FRAGMENT, MIN_QTY_FRAGMENT);

        await chooseSymbol(user, "SOLUSDT");

        expect(selectedSymbol()).toBe("SOLUSDT");
        expect(readFields()).toEqual(fieldsOf(inputs));
        expect(readResults()).toEqual({ qty: "600.0 SOL", value: "60,000.00 USDT" });
        expectWarningInResults(tierWarning("50,000"));
        expectNoBrokenScreen();
        unmount();
      }

      // 둘째 표본: 최소 수량 경고가 켜진다.
      {
        const inputs: Inputs = { symbol: "BTCUSDT", leverage: "1", entry: "150", balance: "10" };
        const { user, unmount } = renderCalculator();
        await fill(user, inputs);
        expect(readResults()).toEqual({ qty: "0.066 BTC", value: "9.90 USDT" });
        expectNoWarningText(TIER_FRAGMENT, MIN_QTY_FRAGMENT);

        await chooseSymbol(user, "SOLUSDT");

        expect(selectedSymbol()).toBe("SOLUSDT");
        expect(readFields()).toEqual(fieldsOf(inputs));
        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectWarningInResults(minQtyWarning("0.1 SOL"));
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec EC-8
     * @given 경고가 켜진 상태에서 심볼만 바꾸면 경고가 꺼지는 표본(새로 렌더): SOLUSDT·10·100·6000(`600.0 SOL`·`60,000.00 USDT`, 한도 50,000 경고) → BTCUSDT / SOLUSDT·1·150·10(`—`·`—`, 최소 수량 0.1 SOL 경고) → BTCUSDT
     * @when 심볼 선택에서 BTCUSDT를 고른다
     * @then 레버리지·진입가·사용 가능 잔고 입력값은 바꾸기 전 그대로다
     * @then 첫 표본: 결과 셀은 `600.000 BTC`·`60,000.00 USDT`이고 한도 경고가 화면에 없다
     * @then 둘째 표본: 결과 셀은 `0.066 BTC`·`9.90 USDT`이고 최소 수량 경고가 화면에 없다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-8] 심볼을 바꿔 새 심볼의 한도·최소 수량을 만족하면 입력은 유지되고 경고가 꺼진다", async () => {
      // 첫 표본: 한도 경고가 꺼진다.
      {
        const inputs: Inputs = { symbol: "SOLUSDT", leverage: "10", entry: "100", balance: "6000" };
        const { user, unmount } = renderCalculator();
        await fill(user, inputs);
        expect(readResults()).toEqual({ qty: "600.0 SOL", value: "60,000.00 USDT" });
        expectWarningInResults(tierWarning("50,000"));

        await chooseSymbol(user, "BTCUSDT");

        expect(selectedSymbol()).toBe("BTCUSDT");
        expect(readFields()).toEqual(fieldsOf(inputs));
        expect(readResults()).toEqual({ qty: "600.000 BTC", value: "60,000.00 USDT" });
        expectNoWarningText(TIER_FRAGMENT);
        expectNoBrokenScreen();
        unmount();
      }

      // 둘째 표본: 최소 수량 경고가 꺼진다.
      {
        const inputs = SOL_BELOW_MIN;
        const { user, unmount } = renderCalculator();
        await fill(user, inputs);
        expect(readResults()).toEqual(EMPTY_RESULTS);
        expectWarningInResults(minQtyWarning("0.1 SOL"));

        await chooseSymbol(user, "BTCUSDT");

        expect(selectedSymbol()).toBe("BTCUSDT");
        expect(readFields()).toEqual(fieldsOf(inputs));
        expect(readResults()).toEqual({ qty: "0.066 BTC", value: "9.90 USDT" });
        expectNoWarningText(MIN_QTY_FRAGMENT);
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("입력을 지워 계산할 수 없게 되면 결과와 경고가 처음 상태로 돌아간다", () => {
    /**
     * @spec EC-9 EC-2
     * @given 계산된 상태(새로 렌더). 표본 상태: M1(`0.153 BTC`·`9,945.00 USDT`, 경고 없음) / M2(`5.062 BTC`·`499,950.45 USDT`, 한도 300,000 경고) / SOLUSDT·1·150·10(`—`·`—`, 최소 수량 0.1 SOL 경고). 지울 입력란 표본: 진입가, 사용 가능 잔고, 레버리지(한 번에 하나)
     * @when 표본 입력란의 값을 모두 지운다
     * @then 최대 수량·포지션 가치 결과 셀은 각각 정확히 `—`(U+2014)다
     * @then `⚠ 포지션 가치가 유지증거금률 첫 단계 한도` 경고와 `⚠ 최소 주문 수량은` 경고가 화면에 없다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-9][EC-2] 입력을 지우면 두 결과가 —로 돌아가고 한도·최소 수량 경고가 사라진다", async () => {
      const states: { id: string; inputs: Inputs; shown: Shown; warning: string | null }[] = [
        { id: "M1", inputs: M1, shown: M1_SHOWN, warning: null },
        { id: "M2", inputs: M2, shown: M2_SHOWN, warning: tierWarning("300,000") },
        {
          id: "SOL 최소 수량 미달",
          inputs: SOL_BELOW_MIN,
          shown: EMPTY_RESULTS,
          warning: minQtyWarning("0.1 SOL"),
        },
      ];

      for (const state of states) {
        for (const name of FIELD_NAMES) {
          const { user, unmount } = renderCalculator();
          await fill(user, state.inputs);
          // 전제: 계산된 상태다.
          expect(readResults()).toEqual(state.shown);
          if (state.warning === null) {
            expectNoWarningText(TIER_FRAGMENT, MIN_QTY_FRAGMENT);
          } else {
            expectWarningInResults(state.warning);
          }

          await user.clear(field(name));

          expect(field(name).value).toBe("");
          expect(readResults()).toEqual(EMPTY_RESULTS);
          expectNoWarningText(TIER_FRAGMENT, MIN_QTY_FRAGMENT);
          expectNoBrokenScreen();
          unmount();
        }
      }
    });
  });
});
