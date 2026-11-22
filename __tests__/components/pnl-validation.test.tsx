import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PnlCalculator } from "@/components/pnl-calculator";

// 기대값은 스펙 심볼 정보 표로 손계산한 리터럴이다.
// 경고 문구의 `⚠`는 U+26A0, 부호 `−`는 U+2212, 빈 결과 `—`는 U+2014로 정확히 비교한다.
// 첫 화면 기본값은 BTCUSDT·롱·레버리지 10·수량 단위 코인이다.

// 기호는 코드 포인트로 정확히 비교한다.
const WARN = "⚠"; // ⚠
const DASH = "—"; // —

type User = ReturnType<typeof userEvent.setup>;
type SymbolName = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type FieldName = "레버리지" | "진입가" | "종료가" | "수량";
type ResultName = "필요 증거금" | "손익" | "ROE";

function renderCalculator() {
  const user = userEvent.setup();
  const { unmount } = render(<PnlCalculator />);
  return { user, unmount };
}

/** 이름으로 입력란을 찾는다. USDT 모드의 금액 입력란은 이름이 `수량`인 같은 입력란이다. */
function field(name: FieldName): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function result(name: ResultName): string | null {
  return screen.getByLabelText(name).textContent;
}

function readResults() {
  return { margin: result("필요 증거금"), pnl: result("손익"), roe: result("ROE") };
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
  await user.click(screen.getByRole("combobox", { name: "심볼" }));
  await user.click(await screen.findByRole("option", { name: symbol }));
}

function unitToggle(name: "코인" | "USDT"): HTMLElement {
  return within(screen.getByRole("group", { name: "수량 단위" })).getByRole("button", { name });
}

async function chooseUnit(user: User, unit: "코인" | "USDT") {
  await user.click(unitToggle(unit));
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

/** USDT 모드 금액 입력란 아래의 참고 수량(`≈ …`) 요소. */
function refQty(): HTMLElement {
  return screen.getByText(
    (_, el) => el?.tagName === "P" && (el.textContent ?? "").startsWith("≈ "),
  );
}

function expectNoNaNOrInfinity() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
}

/** USDT 모드로 바꾸고 심볼·진입가·금액(·종료가)을 넣는다. */
async function fillUsdt(
  user: User,
  sample: { symbol?: SymbolName; entry: string; amount: string; exit?: string },
) {
  if (sample.symbol !== undefined && sample.symbol !== "BTCUSDT") {
    await chooseSymbol(user, sample.symbol);
  }
  await chooseUnit(user, "USDT");
  await typeInto(user, "진입가", sample.entry);
  await typeInto(user, "수량", sample.amount);
  if (sample.exit !== undefined) {
    await typeInto(user, "종료가", sample.exit);
  }
}

describe("손익 계산기 입력 검증 — 규칙을 벗어난 입력은 그 입력란 아래에 경고하고, USDT 금액은 수량 단위로 내려 표시·계산한다", () => {
  describe("레버리지가 심볼 최대치를 넘으면 경고하지만 결과는 계속 계산한다", () => {
    /**
     * @spec DoD-9
     * @given 표본(심볼 정보 표의 maxLeverage로 만든 리터럴): BTCUSDT 레버리지 151 → `⚠ BTCUSDT의 최대 레버리지는 150배입니다.`, ETHUSDT 레버리지 151 → `⚠ ETHUSDT의 최대 레버리지는 150배입니다.`, SOLUSDT 레버리지 101 → `⚠ SOLUSDT의 최대 레버리지는 100배입니다.`
     * @when 표본의 심볼을 고르고 레버리지 입력란에 표본 값을 키 입력으로 넣는다
     * @then 레버리지 입력란 아래에 표본의 경고 문구가 그대로 표시된다
     * @then 레버리지 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     */
    it("[DoD-9] 레버리지가 심볼 최대치를 넘으면 레버리지 입력란에 최대 레버리지 경고가 연결돼 표시된다", async () => {
      const samples: { symbol: SymbolName; leverage: string; message: string }[] = [
        {
          symbol: "BTCUSDT",
          leverage: "151",
          message: `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`,
        },
        {
          symbol: "ETHUSDT",
          leverage: "151",
          message: `${WARN} ETHUSDT의 최대 레버리지는 150배입니다.`,
        },
        {
          symbol: "SOLUSDT",
          leverage: "101",
          message: `${WARN} SOLUSDT의 최대 레버리지는 100배입니다.`,
        },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        if (sample.symbol !== "BTCUSDT") await chooseSymbol(user, sample.symbol);
        await typeInto(user, "레버리지", sample.leverage);
        expect(field("레버리지").value).toBe(sample.leverage);

        expectWarningLinked(field("레버리지"), sample.message);
        unmount();
      }
    });

    /**
     * @spec DoD-9
     * @given 표본(심볼 최대치와 같거나 작은 값): BTCUSDT 레버리지 150, ETHUSDT 레버리지 150, SOLUSDT 레버리지 100, BTCUSDT 기본 레버리지 10
     * @when 표본의 심볼을 고르고 레버리지 입력란에 표본 값을 키 입력으로 넣는다
     * @then 화면에 `최대 레버리지는` 경고 문구가 없다
     * @then 레버리지 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     */
    it("[DoD-9] 레버리지가 심볼 최대치 이하이면 최대 레버리지 경고가 없다", async () => {
      const samples: { symbol: SymbolName; leverage?: string }[] = [
        { symbol: "BTCUSDT", leverage: "150" },
        { symbol: "ETHUSDT", leverage: "150" },
        { symbol: "SOLUSDT", leverage: "100" },
        { symbol: "BTCUSDT" }, // 기본 레버리지 10
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        if (sample.symbol !== "BTCUSDT") await chooseSymbol(user, sample.symbol);
        if (sample.leverage !== undefined) await typeInto(user, "레버리지", sample.leverage);
        expect(field("레버리지").value).toBe(sample.leverage ?? "10");

        expectNoWarningText("최대 레버리지는");
        expectNoWarningLinked(field("레버리지"));
        unmount();
      }
    });

    /**
     * @spec DoD-10
     * @given 코인 모드 BTCUSDT 롱이다. 표본(손계산 리터럴): 레버리지 200, 진입가 100000, 수량 0.2, 종료가 101000 → 필요 증거금 `100.00 USDT`, 손익 `+200.0000 USDT`, ROE `+200.00%`
     * @when 레버리지·진입가·수량·종료가를 키 입력으로 넣는다
     * @then 레버리지 입력란 아래에 `⚠ BTCUSDT의 최대 레버리지는 150배입니다.`가 표시된다
     * @then 필요 증거금이 `100.00 USDT`로 표시된다
     * @then 손익이 `+200.0000 USDT`로 표시된다
     * @then ROE가 `+200.00%`로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[DoD-10] 최대 레버리지 경고가 떠 있어도 필요 증거금·손익·ROE가 계산·표시된다", async () => {
      const { user } = renderCalculator();
      await typeInto(user, "레버리지", "200");
      await typeInto(user, "진입가", "100000");
      await typeInto(user, "수량", "0.2");
      await typeInto(user, "종료가", "101000");

      expectWarningLinked(field("레버리지"), `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`);
      expect(readResults()).toEqual({
        margin: "100.00 USDT",
        pnl: "+200.0000 USDT",
        roe: "+200.00%",
      });
      expectNoNaNOrInfinity();
    });
  });

  describe("코인 수량이 최소 주문 수량보다 작거나 수량 단위의 배수가 아니면 경고하고, 입력값 그대로 계산한다", () => {
    /**
     * @spec DoD-11 EC-1
     * @given 코인 모드다. 표본(최소 주문 수량보다 작고 qtyStep의 배수도 아닌 값, 심볼 정보 표의 minOrderQty·qtyStep으로 만든 리터럴): BTCUSDT 수량 0.0005 → `⚠ 최소 주문 수량은 0.001 BTC입니다.`, ETHUSDT 수량 0.005 → `⚠ 최소 주문 수량은 0.01 ETH입니다.`, SOLUSDT 수량 0.05 → `⚠ 최소 주문 수량은 0.1 SOL입니다.`
     * @when 표본의 심볼을 고르고 수량 입력란에 표본 값을 키 입력으로 넣는다
     * @then 수량 입력란 아래에 표본의 최소 주문 수량 경고 문구가 그대로 표시된다
     * @then 수량 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @then 화면에 `수량 단위는` 경고 문구가 없다
     * @then 수량 입력란의 `aria-describedby`가 가리키는 경고 요소는 최소 주문 수량 경고 하나뿐이다
     */
    it("[DoD-11][EC-1] 수량이 최소 주문 수량보다 작으면 수량 단위 배수 여부와 관계없이 최소 주문 수량 경고 하나만 연결돼 표시된다", async () => {
      const samples: { symbol: SymbolName; qty: string; message: string }[] = [
        { symbol: "BTCUSDT", qty: "0.0005", message: `${WARN} 최소 주문 수량은 0.001 BTC입니다.` },
        { symbol: "ETHUSDT", qty: "0.005", message: `${WARN} 최소 주문 수량은 0.01 ETH입니다.` },
        { symbol: "SOLUSDT", qty: "0.05", message: `${WARN} 최소 주문 수량은 0.1 SOL입니다.` },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        if (sample.symbol !== "BTCUSDT") await chooseSymbol(user, sample.symbol);
        await typeInto(user, "수량", sample.qty);

        expectWarningLinked(field("수량"), sample.message);
        expectNoWarningText("수량 단위는");
        const linked = linkedWarnings(field("수량"));
        expect(linked).toHaveLength(1);
        expect(linked[0].textContent).toBe(sample.message);
        unmount();
      }
    });

    /**
     * @spec DoD-12
     * @given 코인 모드다. 표본(최소 주문 수량 이상이고 qtyStep의 배수가 아닌 값, 심볼 정보 표로 만든 리터럴): BTCUSDT 수량 0.0015 → `⚠ 수량 단위는 0.001 BTC입니다.`, ETHUSDT 수량 0.015 → `⚠ 수량 단위는 0.01 ETH입니다.`, SOLUSDT 수량 0.15 → `⚠ 수량 단위는 0.1 SOL입니다.`
     * @when 표본의 심볼을 고르고 수량 입력란에 표본 값을 키 입력으로 넣는다
     * @then 수량 입력란 아래에 표본의 경고 문구가 그대로 표시된다
     * @then 수량 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     */
    it("[DoD-12] 코인 수량이 수량 단위의 배수가 아니면 수량 입력란에 수량 단위 경고가 연결돼 표시된다", async () => {
      const samples: { symbol: SymbolName; qty: string; message: string }[] = [
        { symbol: "BTCUSDT", qty: "0.0015", message: `${WARN} 수량 단위는 0.001 BTC입니다.` },
        { symbol: "ETHUSDT", qty: "0.015", message: `${WARN} 수량 단위는 0.01 ETH입니다.` },
        { symbol: "SOLUSDT", qty: "0.15", message: `${WARN} 수량 단위는 0.1 SOL입니다.` },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        if (sample.symbol !== "BTCUSDT") await chooseSymbol(user, sample.symbol);
        await typeInto(user, "수량", sample.qty);
        expect(field("수량").value).toBe(sample.qty);

        expectWarningLinked(field("수량"), sample.message);
        unmount();
      }
    });

    /**
     * @spec DoD-11 DoD-12
     * @given 코인 모드다. 표본(최소 주문 수량 이상이고 qtyStep의 배수인 값, 부동소수점 오차 경계 포함): BTCUSDT 0.001(minOrderQty와 같음), BTCUSDT 0.003, ETHUSDT 0.07, SOLUSDT 0.3
     * @when 표본의 심볼을 고르고 수량 입력란에 표본 값을 키 입력으로 넣는다
     * @then 화면에 `최소 주문 수량은`·`수량 단위는` 경고 문구가 없다
     * @then 수량 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     */
    it("[DoD-11][DoD-12] 코인 수량이 최소 주문 수량 이상이고 수량 단위의 배수이면 수량 경고가 없다", async () => {
      const samples: { symbol: SymbolName; qty: string }[] = [
        { symbol: "BTCUSDT", qty: "0.001" },
        { symbol: "BTCUSDT", qty: "0.003" },
        { symbol: "ETHUSDT", qty: "0.07" },
        { symbol: "SOLUSDT", qty: "0.3" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        if (sample.symbol !== "BTCUSDT") await chooseSymbol(user, sample.symbol);
        await typeInto(user, "수량", sample.qty);
        expect(field("수량").value).toBe(sample.qty);

        expectNoWarningText("최소 주문 수량은", "수량 단위는");
        expectNoWarningLinked(field("수량"));
        unmount();
      }
    });

    /**
     * @spec DoD-13
     * @given 코인 모드 BTCUSDT 롱 레버리지 10이다. 표본(손계산 리터럴): 진입가 100000, 수량 0.0015, 종료가 101000 → 필요 증거금 `15.00 USDT`, 손익 `+1.5000 USDT`, ROE `+10.00%` (0.001로 내리면 `10.00 USDT`·`+1.0000 USDT`, 0.002로 올리면 `20.00 USDT`·`+2.0000 USDT`가 되어 구별된다)
     * @when 진입가·수량·종료가를 키 입력으로 넣는다
     * @then 수량 입력란 아래에 `⚠ 수량 단위는 0.001 BTC입니다.`가 표시된다
     * @then 수량 입력란의 값은 `0.0015` 그대로다
     * @then 필요 증거금이 `15.00 USDT`로 표시된다
     * @then 손익이 `+1.5000 USDT`로 표시된다
     * @then ROE가 `+10.00%`로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[DoD-13] 수량 단위의 배수가 아닌 코인 수량은 입력값 그대로 계산에 쓰인다", async () => {
      const { user } = renderCalculator();
      await typeInto(user, "진입가", "100000");
      await typeInto(user, "수량", "0.0015");
      await typeInto(user, "종료가", "101000");

      expectWarningLinked(field("수량"), `${WARN} 수량 단위는 0.001 BTC입니다.`);
      expect(field("수량").value).toBe("0.0015");
      expect(readResults()).toEqual({
        margin: "15.00 USDT",
        pnl: "+1.5000 USDT",
        roe: "+10.00%",
      });
      expectNoNaNOrInfinity();
    });
  });

  describe("USDT 모드의 환산 수량은 수량 단위로 내려 표시·계산한다", () => {
    /**
     * @spec DoD-14
     * @given USDT 모드다. 표본(금액 ÷ 진입가를 qtyStep으로 내린 손계산 리터럴): BTCUSDT 20000 USDT·진입가 100000 → `≈ 0.200 BTC`, BTCUSDT 1 USDT·진입가 3 → `≈ 0.333 BTC`, ETHUSDT 100 USDT·진입가 3000 → `≈ 0.03 ETH`, SOLUSDT 100 USDT·진입가 150 → `≈ 0.6 SOL`, 부동소수점 경계(단위 수를 그대로 내리면 한 단위 작아지는 값): SOLUSDT 45 USDT·진입가 150 → `≈ 0.3 SOL`, BTCUSDT 0.7 USDT·진입가 0.1 → `≈ 7.000 BTC`
     * @when 표본의 심볼을 고르고 진입가와 USDT 금액을 키 입력으로 넣는다
     * @then 금액 입력란 아래의 참고 수량이 표본의 기대값(qtyStep 자릿수)으로 표시된다
     */
    it("[DoD-14] USDT 모드 참고 수량은 금액 ÷ 진입가를 수량 단위로 내린 값을 수량 단위 자릿수로 표시한다", async () => {
      const samples: { symbol: SymbolName; amount: string; entry: string; expected: string }[] = [
        { symbol: "BTCUSDT", amount: "20000", entry: "100000", expected: "≈ 0.200 BTC" },
        { symbol: "BTCUSDT", amount: "1", entry: "3", expected: "≈ 0.333 BTC" },
        { symbol: "ETHUSDT", amount: "100", entry: "3000", expected: "≈ 0.03 ETH" },
        { symbol: "SOLUSDT", amount: "100", entry: "150", expected: "≈ 0.6 SOL" },
        // 부동소수점 경계
        { symbol: "SOLUSDT", amount: "45", entry: "150", expected: "≈ 0.3 SOL" },
        { symbol: "BTCUSDT", amount: "0.7", entry: "0.1", expected: "≈ 7.000 BTC" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillUsdt(user, sample);

        const ref = refQty();
        expect(ref.textContent).toBe(sample.expected);
        expect(isAfter(ref, field("수량"))).toBe(true);
        unmount();
      }
    });

    /**
     * @spec DoD-15
     * @given USDT 모드 롱 레버리지 10이다. 표본(손계산 리터럴): S1 = BTCUSDT 금액 1 USDT, 진입가 3, 종료가 4 → 환산 수량 0.333 BTC → 참고 수량 `≈ 0.333 BTC`, 필요 증거금 `0.09 USDT`, 손익 `+0.3330 USDT`, ROE `+333.33%` (원값 0.33333… BTC로 계산하면 `0.10 USDT`·`+0.3333 USDT`가 되어 구별된다), S2(계산 경로의 부동소수점 경계) = SOLUSDT 금액 45 USDT, 진입가 150, 종료가 160 → 내린 수량 0.3 SOL → 참고 수량 `≈ 0.3 SOL`, 필요 증거금 `4.500 USDT`, 손익 `+3.0000 USDT`, ROE `+66.66%` (단순 floor(45 ÷ 150 ÷ 0.1) × 0.1 = 0.2로 계산하면 `3.000 USDT`·`+2.0000 USDT`가 되어 구별된다)
     * @when 표본의 심볼을 고르고 진입가·금액·종료가를 키 입력으로 넣는다
     * @then 참고 수량이 표본의 기대값(S1 `≈ 0.333 BTC`, S2 `≈ 0.3 SOL`)으로 표시된다
     * @then 필요 증거금이 표본의 기대값(S1 `0.09 USDT`, S2 `4.500 USDT`)으로 표시된다
     * @then 손익이 표본의 기대값(S1 `+0.3330 USDT`, S2 `+3.0000 USDT`)으로 표시된다
     * @then ROE가 표본의 기대값(S1 `+333.33%`, S2 `+66.66%`)으로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[DoD-15] USDT 모드의 필요 증거금·손익·ROE는 수량 단위로 내린 환산 수량으로 계산된다", async () => {
      const samples: {
        symbol: SymbolName;
        amount: string;
        entry: string;
        exit: string;
        ref: string;
        results: { margin: string; pnl: string; roe: string };
      }[] = [
        {
          symbol: "BTCUSDT",
          amount: "1",
          entry: "3",
          exit: "4",
          ref: "≈ 0.333 BTC",
          results: { margin: "0.09 USDT", pnl: "+0.3330 USDT", roe: "+333.33%" },
        },
        {
          symbol: "SOLUSDT",
          amount: "45",
          entry: "150",
          exit: "160",
          ref: "≈ 0.3 SOL",
          results: { margin: "4.500 USDT", pnl: "+3.0000 USDT", roe: "+66.66%" },
        },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillUsdt(user, sample);

        expect(refQty().textContent).toBe(sample.ref);
        expect(readResults()).toEqual(sample.results);
        expectNoNaNOrInfinity();
        unmount();
      }
    });

    /**
     * @spec DoD-16
     * @given USDT 모드에서 진입가와 금액이 입력돼 있다. 표본(내린 환산 수량을 끝의 0 없이 쓴 손계산 리터럴): BTCUSDT 20000 USDT·진입가 100000 → `0.2`, BTCUSDT 1 USDT·진입가 3 → `0.333`, ETHUSDT 100 USDT·진입가 3000 → `0.03`, SOLUSDT 100 USDT·진입가 150 → `0.6`, 부동소수점 경계: SOLUSDT 45 USDT·진입가 150 → `0.3`, BTCUSDT 0.7 USDT·진입가 0.1 → `7`, 천 단위 구분 없음: BTCUSDT 130000000 USDT·진입가 65000 → `2000`(`2,000`이 아님)
     * @when 수량 단위를 코인으로 바꾼다
     * @then 수량 단위는 코인이 선택돼 있다
     * @then 수량 입력란이 표본의 기대값(지수 표기·천 단위 구분 없음)으로 채워진다
     */
    it("[DoD-16] USDT에서 코인으로 바꾸면 수량 입력란이 내린 환산 수량으로 채워진다", async () => {
      const samples: { symbol: SymbolName; amount: string; entry: string; expected: string }[] = [
        { symbol: "BTCUSDT", amount: "20000", entry: "100000", expected: "0.2" },
        { symbol: "BTCUSDT", amount: "1", entry: "3", expected: "0.333" },
        { symbol: "ETHUSDT", amount: "100", entry: "3000", expected: "0.03" },
        { symbol: "SOLUSDT", amount: "100", entry: "150", expected: "0.6" },
        // 부동소수점 경계
        { symbol: "SOLUSDT", amount: "45", entry: "150", expected: "0.3" },
        { symbol: "BTCUSDT", amount: "0.7", entry: "0.1", expected: "7" },
        // 천 단위 구분 없음
        { symbol: "BTCUSDT", amount: "130000000", entry: "65000", expected: "2000" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillUsdt(user, sample);
        await chooseUnit(user, "코인");

        expect(unitToggle("코인").getAttribute("aria-pressed")).toBe("true");
        expect(field("수량").value).toBe(sample.expected);
        unmount();
      }
    });

    /**
     * @spec EC-5
     * @given USDT 모드 BTCUSDT 롱 레버리지 10이다. 표본: 금액 19 USDT, 진입가 100000, 종료가 101000 → 내린 환산 수량 0
     * @when 진입가·금액·종료가를 키 입력으로 넣는다
     * @then 금액 입력란 아래에 `⚠ 최소 주문 수량은 0.001 BTC입니다.`가 표시된다
     * @then 금액 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @then 참고 수량이 `≈ 0.000 BTC`로 표시된다
     * @then 필요 증거금·손익·ROE가 모두 `—`로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[EC-5] USDT 모드에서 내린 환산 수량이 0이면 최소 주문 수량 경고를 표시하고 세 결과는 —다", async () => {
      const { user } = renderCalculator();
      await fillUsdt(user, { entry: "100000", amount: "19", exit: "101000" });

      expectWarningLinked(field("수량"), `${WARN} 최소 주문 수량은 0.001 BTC입니다.`);
      expect(refQty().textContent).toBe("≈ 0.000 BTC");
      expect(readResults()).toEqual({ margin: DASH, pnl: DASH, roe: DASH });
      expectNoNaNOrInfinity();
    });

    /**
     * @spec EC-9 EC-3
     * @given USDT 모드 BTCUSDT 롱 레버리지 10에서 금액 19 USDT, 진입가 100000, 종료가 101000이 입력돼 최소 주문 수량 경고가 떠 있다
     * @when 수량 단위를 코인으로 바꾼다
     * @then 수량 입력란이 `0`으로 채워진다
     * @then 화면에 `최소 주문 수량은`·`수량 단위는` 경고 문구가 없다
     * @then 수량 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 필요 증거금·손익·ROE가 모두 `—`로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[EC-9][EC-3] 내린 환산 수량이 0인 상태로 코인으로 바꾸면 수량 입력란이 0이 되고 경고 없이 결과는 —다", async () => {
      const { user } = renderCalculator();
      await fillUsdt(user, { entry: "100000", amount: "19", exit: "101000" });
      expectWarningLinked(field("수량"), `${WARN} 최소 주문 수량은 0.001 BTC입니다.`);

      await chooseUnit(user, "코인");

      expect(field("수량").value).toBe("0");
      expectNoWarningText("최소 주문 수량은", "수량 단위는");
      expectNoWarningLinked(field("수량"));
      expect(readResults()).toEqual({ margin: DASH, pnl: DASH, roe: DASH });
      expectNoNaNOrInfinity();
    });
  });

  describe("입력이 바뀌면 경고를 즉시 다시 판정한다", () => {
    /**
     * @spec EC-2
     * @given 코인 모드 BTCUSDT에서 레버리지 120, 진입가 100000, 수량 0.15가 입력돼 있고 경고가 없다
     * @when 심볼을 SOLUSDT로 바꾼다
     * @then 레버리지 입력란 아래에 `⚠ SOLUSDT의 최대 레버리지는 100배입니다.`가 표시된다
     * @then 레버리지 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @then 수량 입력란 아래에 `⚠ 수량 단위는 0.1 SOL입니다.`가 표시된다
     * @then 수량 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     */
    it("[EC-2] 심볼을 바꾸면 새 심볼 기준으로 레버리지·수량 경고가 나타난다", async () => {
      const { user } = renderCalculator();
      await typeInto(user, "레버리지", "120");
      await typeInto(user, "진입가", "100000");
      await typeInto(user, "수량", "0.15");
      expectNoWarningLinked(field("레버리지"));
      expectNoWarningLinked(field("수량"));

      await chooseSymbol(user, "SOLUSDT");
      expect(screen.getByRole("combobox", { name: "심볼" }).textContent).toContain("SOLUSDT");

      expectWarningLinked(field("레버리지"), `${WARN} SOLUSDT의 최대 레버리지는 100배입니다.`);
      expectWarningLinked(field("수량"), `${WARN} 수량 단위는 0.1 SOL입니다.`);
    });

    /**
     * @spec EC-2
     * @given 코인 모드 SOLUSDT에서 레버리지 120, 진입가 150, 수량 0.15가 입력돼 최대 레버리지 경고와 수량 단위 경고가 떠 있다
     * @when 심볼을 BTCUSDT로 바꾼다
     * @then 화면에 `최대 레버리지는`·`최소 주문 수량은`·`수량 단위는` 경고 문구가 없다
     * @then 레버리지 입력란과 수량 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     */
    it("[EC-2] 심볼을 바꿔 새 심볼 기준으로 조건을 벗어나지 않으면 경고가 사라진다", async () => {
      const { user } = renderCalculator();
      await chooseSymbol(user, "SOLUSDT");
      await typeInto(user, "레버리지", "120");
      await typeInto(user, "진입가", "150");
      await typeInto(user, "수량", "0.15");
      expectWarningLinked(field("레버리지"), `${WARN} SOLUSDT의 최대 레버리지는 100배입니다.`);
      expectWarningLinked(field("수량"), `${WARN} 수량 단위는 0.1 SOL입니다.`);

      await chooseSymbol(user, "BTCUSDT");
      expect(screen.getByRole("combobox", { name: "심볼" }).textContent).toContain("BTCUSDT");

      expectNoWarningText("최대 레버리지는", "최소 주문 수량은", "수량 단위는");
      expectNoWarningLinked(field("레버리지"));
      expectNoWarningLinked(field("수량"));
    });

    /**
     * @spec EC-2
     * @given USDT 모드 SOLUSDT 롱 레버리지 10에서 진입가 150, 금액 10 USDT가 입력돼 참고 수량이 `≈ 0.0 SOL`이고, 금액 입력란 아래에 `⚠ 최소 주문 수량은 0.1 SOL입니다.`가 떠 있으며 금액 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @when 심볼을 BTCUSDT로 바꾼다(금액 ÷ 진입가를 BTCUSDT의 qtyStep 0.001로 다시 내리면 0.066 BTC)
     * @then 화면에 `최소 주문 수량은` 경고 문구가 없다
     * @then 금액 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 참고 수량이 `≈ 0.066 BTC`로 표시된다
     * @then 필요 증거금이 `0.99 USDT`로 표시된다
     */
    it("[EC-2] USDT 모드에서 심볼을 바꾸면 새 수량 단위로 다시 내린 환산 수량으로 경고를 재판정해 경고가 사라진다", async () => {
      const { user } = renderCalculator();
      await fillUsdt(user, { symbol: "SOLUSDT", entry: "150", amount: "10" });
      expect(field("레버리지").value).toBe("10");
      expect(refQty().textContent).toBe("≈ 0.0 SOL");
      expectWarningLinked(field("수량"), `${WARN} 최소 주문 수량은 0.1 SOL입니다.`);

      await chooseSymbol(user, "BTCUSDT");

      expectNoWarningText("최소 주문 수량은");
      expectNoWarningLinked(field("수량"));
      expect(refQty().textContent).toBe("≈ 0.066 BTC");
      expect(result("필요 증거금")).toBe("0.99 USDT");
    });

    /**
     * @spec EC-3
     * @given 코인 모드 BTCUSDT에서 진입가 100000, 수량 0.0015가 입력돼 `⚠ 수량 단위는 0.001 BTC입니다.`가 떠 있다
     * @when 수량 단위를 USDT로 바꾼다(금액 150 USDT → 내린 환산 수량 0.001 BTC)
     * @then 화면에 `최소 주문 수량은`·`수량 단위는` 경고 문구가 없다
     * @then 금액 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 참고 수량이 `≈ 0.001 BTC`로 표시된다
     */
    it("[EC-3] 코인에서 USDT로 바꾸면 새 환산 수량으로 수량 경고를 다시 판정한다", async () => {
      const { user } = renderCalculator();
      await typeInto(user, "진입가", "100000");
      await typeInto(user, "수량", "0.0015");
      expectWarningLinked(field("수량"), `${WARN} 수량 단위는 0.001 BTC입니다.`);

      await chooseUnit(user, "USDT");
      expect(field("수량").value).toBe("150");

      expectNoWarningText("최소 주문 수량은", "수량 단위는");
      expectNoWarningLinked(field("수량"));
      expect(refQty().textContent).toBe("≈ 0.001 BTC");
    });

    /**
     * @spec EC-3
     * @given USDT 모드 BTCUSDT에서 금액 150 USDT, 진입가 100000이 입력돼 있다(내린 환산 수량 0.001 BTC, 경고 없음)
     * @when 진입가를 200000으로 바꾼다(내린 환산 수량 0)
     * @then 금액 입력란 아래에 `⚠ 최소 주문 수량은 0.001 BTC입니다.`가 표시된다
     * @then 금액 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     */
    it("[EC-3] USDT 모드에서 진입가가 바뀌어 환산 수량이 최소 주문 수량보다 작아지면 경고가 나타난다", async () => {
      const { user } = renderCalculator();
      await fillUsdt(user, { entry: "100000", amount: "150" });
      expect(refQty().textContent).toBe("≈ 0.001 BTC");
      expectNoWarningLinked(field("수량"));

      await typeInto(user, "진입가", "200000");

      expectWarningLinked(field("수량"), `${WARN} 최소 주문 수량은 0.001 BTC입니다.`);
    });

    /**
     * @spec EC-3
     * @given USDT 모드 BTCUSDT에서 금액 150 USDT, 진입가 200000이 입력돼 최소 주문 수량 경고가 떠 있다(내린 환산 수량 0)
     * @when 진입가를 100000으로 바꾼다(내린 환산 수량 0.001 BTC)
     * @then 화면에 `최소 주문 수량은` 경고 문구가 없다
     * @then 금액 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 참고 수량이 `≈ 0.001 BTC`로 표시된다
     */
    it("[EC-3] USDT 모드에서 진입가가 바뀌어 환산 수량이 최소 주문 수량 이상이 되면 경고가 사라진다", async () => {
      const { user } = renderCalculator();
      await fillUsdt(user, { entry: "200000", amount: "150" });
      expectWarningLinked(field("수량"), `${WARN} 최소 주문 수량은 0.001 BTC입니다.`);

      await typeInto(user, "진입가", "100000");

      expectNoWarningText("최소 주문 수량은");
      expectNoWarningLinked(field("수량"));
      expect(refQty().textContent).toBe("≈ 0.001 BTC");
    });
  });

  describe("입력란 원문이 비었거나 소수점만 있거나 0이면 그 입력란에 경고하지 않는다", () => {
    /**
     * @spec EC-4
     * @given BTCUSDT에서 레버리지 151이 입력돼 최대 레버리지 경고가 떠 있다. 표본: 레버리지 입력란을 빈 값, `0`, `00`으로 바꾼다(레버리지 입력란은 숫자만 받으므로 `.`는 입력되지 않는다)
     * @when 레버리지 입력란을 표본 값으로 바꾼다
     * @then 화면에 `최대 레버리지는` 경고 문구가 없다
     * @then 레버리지 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[EC-4] 레버리지 입력란이 빈 값·0이면 레버리지 경고가 없다", async () => {
      for (const sample of ["", "0", "00"]) {
        const { user, unmount } = renderCalculator();
        await typeInto(user, "레버리지", "151");
        expectWarningLinked(field("레버리지"), `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`);

        await typeInto(user, "레버리지", sample);

        expect(field("레버리지").value).toBe(sample);
        expectNoWarningText("최대 레버리지는");
        expectNoWarningLinked(field("레버리지"));
        expectNoNaNOrInfinity();
        unmount();
      }
    });

    /**
     * @spec EC-4
     * @given 코인 모드 BTCUSDT에서 진입가 100000, 수량 0.0005가 입력돼 최소 주문 수량 경고가 떠 있다. 표본: 수량 입력란을 빈 값, `.`, `0`, `0.0`, `00`으로 바꾼다
     * @when 수량 입력란을 표본 값으로 바꾼다
     * @then 화면에 `최소 주문 수량은`·`수량 단위는` 경고 문구가 없다
     * @then 수량 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[EC-4] 코인 모드 수량 입력란이 빈 값·.·0이면 수량 경고가 없다", async () => {
      for (const sample of ["", ".", "0", "0.0", "00"]) {
        const { user, unmount } = renderCalculator();
        await typeInto(user, "진입가", "100000");
        await typeInto(user, "수량", "0.0005");
        expectWarningLinked(field("수량"), `${WARN} 최소 주문 수량은 0.001 BTC입니다.`);

        await typeInto(user, "수량", sample);

        expect(field("수량").value).toBe(sample);
        expectNoWarningText("최소 주문 수량은", "수량 단위는");
        expectNoWarningLinked(field("수량"));
        expectNoNaNOrInfinity();
        unmount();
      }
    });

    /**
     * @spec EC-4
     * @given USDT 모드 BTCUSDT에서 진입가 100000, 금액 19 USDT가 입력돼 최소 주문 수량 경고가 떠 있다. 표본: 금액 입력란을 빈 값, `.`, `0`, `0.0`, `00`으로 바꾼다
     * @when 금액 입력란을 표본 값으로 바꾼다
     * @then 화면에 `최소 주문 수량은`·`수량 단위는` 경고 문구가 없다
     * @then 금액 입력란의 `aria-describedby`가 경고 요소를 가리키지 않는다(경고 요소가 없다)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     */
    it("[EC-4] USDT 모드 금액 입력란이 빈 값·.·0이면 수량 경고가 없다", async () => {
      for (const sample of ["", ".", "0", "0.0", "00"]) {
        const { user, unmount } = renderCalculator();
        await fillUsdt(user, { entry: "100000", amount: "19" });
        expectWarningLinked(field("수량"), `${WARN} 최소 주문 수량은 0.001 BTC입니다.`);

        await typeInto(user, "수량", sample);

        expect(field("수량").value).toBe(sample);
        expectNoWarningText("최소 주문 수량은", "수량 단위는");
        expectNoWarningLinked(field("수량"));
        expectNoNaNOrInfinity();
        unmount();
      }
    });
  });

  describe("심볼 정보 기준일과 손익 계산기 카드 이름이 보인다", () => {
    /**
     * @spec DoD-17
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 계산기를 렌더링한다
     * @then 심볼 선택 아래에 `심볼 정보 기준일 2026-11-22 (Bybit)`가 표시된다
     */
    it("[DoD-17] 심볼 선택 아래에 심볼 정보 기준일이 표시된다", async () => {
      renderCalculator();

      const asOf = screen.getByText("심볼 정보 기준일 2026-11-22 (Bybit)");
      expect(asOf.textContent).toBe("심볼 정보 기준일 2026-11-22 (Bybit)");
      expect(isAfter(asOf, screen.getByRole("combobox", { name: "심볼" }))).toBe(true);
    });

    /**
     * @spec DoD-19
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 계산기를 렌더링한다
     * @then 제목이 `손익 입력`인 카드와 `손익 결과`인 카드가 있다
     * @then 접근 이름이 `손익 입력`인 region과 `손익 결과`인 region이 있다
     * @then 제목이 `입력`·`결과`만인 카드가 없다
     */
    it("[DoD-19] 두 카드의 제목과 region 이름은 손익 입력·손익 결과다", async () => {
      renderCalculator();

      const inputRegion = screen.getByRole("region", { name: "손익 입력" });
      const resultRegion = screen.getByRole("region", { name: "손익 결과" });
      expect(within(inputRegion).getByText("손익 입력").textContent).toBe("손익 입력");
      expect(within(resultRegion).getByText("손익 결과").textContent).toBe("손익 결과");
      expect(screen.queryByText("입력")).toBeNull();
      expect(screen.queryByText("결과")).toBeNull();
      expect(screen.queryByRole("region", { name: "입력" })).toBeNull();
      expect(screen.queryByRole("region", { name: "결과" })).toBeNull();
    });
  });
});
