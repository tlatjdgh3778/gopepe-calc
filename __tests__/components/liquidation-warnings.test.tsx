import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { LiquidationCalculator } from "@/components/liquidation-calculator";

// 기대값은 lib/symbols.ts 심볼 정보로 손계산한 리터럴이다.
// 경고 문구의 `⚠`는 U+26A0, 빈 결과 `—`는 U+2014로 정확히 비교한다.
// 첫 화면 기본값은 BTCUSDT·롱·레버리지 10·마진 모드 격리다(스펙 DoD-5·DoD-31).
// 심볼 정보: BTCUSDT tick 0.1·scale 2·qtyStep 0.001·min 0.001·max 150·mmr 0.0033·한도 300000 /
// ETHUSDT tick 0.01·scale 2·qtyStep 0.01·min 0.01·max 150·mmr 0.0033·한도 300000 /
// SOLUSDT tick 0.01·scale 3·qtyStep 0.1·min 0.1·max 100·mmr 0.005·한도 50000.
// 조회는 스펙 4장의 접근 이름과 role로만 한다. "선택됨"은 F-1 토글과 같이 `aria-pressed="true"`로 본다.
// 입력란 경고는 입력란의 `aria-describedby` id 목록으로, 결과 경고는 `청산가 결과` region 안의
// 문서 순서(`추정 청산가` 값 요소 뒤, `청산가까지 거리` 이름 요소 앞)로 판정한다.

const WARN = "⚠"; // ⚠
const DASH = "—"; // —
const NO_LIQUIDATION = "청산 없음";

const STOP_WARNING = `${WARN} 손절 전에 청산됩니다.`;
const IMMEDIATE_WARNING = `${WARN} 진입 즉시 청산되는 포지션입니다.`;
const LIMIT_WARNING_300K = `${WARN} 포지션 가치가 유지증거금률 첫 단계 한도(300,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`;
const LIMIT_WARNING_50K = `${WARN} 포지션 가치가 유지증거금률 첫 단계 한도(50,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`;

type User = ReturnType<typeof userEvent.setup>;
type SymbolName = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type SideName = "롱" | "숏";
type ModeName = "격리" | "교차";
type FieldName = "레버리지" | "진입가" | "수량" | "계좌 잔고" | "손절가";
type ResultName = "추정 청산가" | "청산가까지 거리";
type Position = {
  symbol?: SymbolName;
  mode?: ModeName;
  side?: SideName;
  leverage?: string;
  entry?: string;
  qty?: string;
  balance?: string;
  stop?: string;
};

let consoleErrorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  // 관찰만 한다. 원래 console.error 동작은 그대로 둔다(대체하지 않는다).
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

/** `fast`는 키 입력 사이 대기를 없앤다(EC-13의 긴 입력과 연속 전환). */
function renderCalculator(options: { fast?: boolean } = {}) {
  const user = options.fast ? userEvent.setup({ delay: null }) : userEvent.setup();
  const { unmount } = render(<LiquidationCalculator />);
  return { user, unmount };
}

function field(name: FieldName): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

/** 기존 값을 지우고 실제 키 입력으로 새 값을 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, name: FieldName, value: string) {
  const input = field(name);
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

function toggle(group: "방향" | "마진 모드", name: string): HTMLElement {
  return within(screen.getByRole("group", { name: group })).getByRole("button", { name });
}

function isPressed(element: HTMLElement): boolean {
  return element.getAttribute("aria-pressed") === "true";
}

async function chooseSymbol(user: User, symbol: SymbolName) {
  await user.click(screen.getByRole("combobox", { name: "심볼" }));
  await user.click(await screen.findByRole("option", { name: symbol }));
}

async function chooseSide(user: User, side: SideName) {
  await user.click(toggle("방향", side));
}

async function chooseMode(user: User, mode: ModeName) {
  await user.click(toggle("마진 모드", mode));
}

/**
 * 심볼 → 마진 모드 → 방향 → 레버리지 → 진입가 → 수량 → 계좌 잔고 → 손절가 순서로 넣는다.
 * 지정하지 않은 항목과 기본값(BTCUSDT·격리·롱)은 건드리지 않는다.
 */
async function fillPosition(user: User, position: Position) {
  if (position.symbol !== undefined && position.symbol !== "BTCUSDT") {
    await chooseSymbol(user, position.symbol);
  }
  if (position.mode === "교차") {
    await chooseMode(user, "교차");
  }
  if (position.side === "숏") {
    await chooseSide(user, "숏");
  }
  if (position.leverage !== undefined) {
    await typeInto(user, "레버리지", position.leverage);
  }
  if (position.entry !== undefined) {
    await typeInto(user, "진입가", position.entry);
  }
  if (position.qty !== undefined) {
    await typeInto(user, "수량", position.qty);
  }
  if (position.balance !== undefined) {
    await typeInto(user, "계좌 잔고", position.balance);
  }
  if (position.stop !== undefined) {
    await typeInto(user, "손절가", position.stop);
  }
}

function resultRegion(): HTMLElement {
  return screen.getByRole("region", { name: "청산가 결과" });
}

/** 결과 행의 값 요소(이름이 `name`인 요소). */
function resultValue(name: ResultName): HTMLElement {
  return within(resultRegion()).getByLabelText(name);
}

function resultText(name: ResultName): string | null {
  return resultValue(name).textContent;
}

/** 결과 행의 이름(라벨 텍스트) 요소. */
function resultLabel(name: ResultName): HTMLElement {
  return within(resultRegion()).getByText(name);
}

/** `a`가 `b` 바깥에서 문서 순서상 `b`보다 뒤에 있다(`b` 안에 들어 있지 않다). */
function isAfter(a: Node, b: Node): boolean {
  const position = b.compareDocumentPosition(a);
  return (
    (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
    (position & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0
  );
}

/** `a`가 `b` 바깥에서 문서 순서상 `b`보다 앞에 있다(`b`를 감싸지 않는다). */
function isBefore(a: Node, b: Node): boolean {
  const position = b.compareDocumentPosition(a);
  return (
    (position & Node.DOCUMENT_POSITION_PRECEDING) !== 0 &&
    (position & Node.DOCUMENT_POSITION_CONTAINS) === 0
  );
}

function describedByIds(input: HTMLElement): string[] {
  return (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
}

/** 입력란의 `aria-describedby` id 목록이 가리키는 요소 중 `⚠`로 시작하는 경고 문구 요소. */
function linkedWarnings(input: HTMLElement): HTMLElement[] {
  return describedByIds(input)
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null && (el.textContent ?? "").startsWith(WARN));
}

/** 경고 문구가 입력란 아래(문서 순서상 뒤)에 표시되고, 입력란의 `aria-describedby` id 목록이 그 요소를 가리킨다. */
function expectWarningLinked(input: HTMLElement, message: string): HTMLElement {
  const warning = screen.getByText(message);
  expect(warning.textContent).toBe(message);
  expect(isAfter(warning, input)).toBe(true);
  expect(warning.id).not.toBe("");
  expect(describedByIds(input)).toContain(warning.id);
  return warning;
}

/** 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다. */
function expectNoWarningLinked(input: HTMLElement) {
  expect(linkedWarnings(input)).toEqual([]);
}

/** 화면 어디에도 이 문구 조각이 없다. */
function expectNoText(...fragments: string[]) {
  for (const fragment of fragments) {
    expect(document.body.textContent).not.toContain(fragment);
  }
}

/**
 * `청산가 결과` region 안에 결과 경고 문구가 그대로 있고,
 * `추정 청산가` 값 요소보다 뒤, `청산가까지 거리` 이름(라벨 텍스트) 요소보다 앞에 있다.
 */
function expectResultWarning(message: string): HTMLElement {
  const warning = within(resultRegion()).getByText(message);
  expect(warning.textContent).toBe(message);
  expect(isAfter(warning, resultValue("추정 청산가"))).toBe(true);
  expect(isBefore(warning, resultLabel("청산가까지 거리"))).toBe(true);
  return warning;
}

function expectInputValues(values: Partial<Record<FieldName, string>>) {
  for (const [name, value] of Object.entries(values) as [FieldName, string][]) {
    expect(field(name).value).toBe(value);
  }
}

function expectNoNaNOrInfinity() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
}

/** 두 카드와 컨트롤·결과 행이 그대로 렌더돼 있고, 오류 문구가 없으며, 콘솔 오류가 기록되지 않았다. */
function expectCalculatorIntact() {
  expect(screen.getByRole("region", { name: "청산가 입력" })).toBeDefined();
  expect(resultRegion()).toBeDefined();
  expect(screen.getByRole("combobox", { name: "심볼" })).toBeDefined();
  expect(screen.getByRole("group", { name: "방향" })).toBeDefined();
  expect(screen.getByRole("group", { name: "마진 모드" })).toBeDefined();
  for (const name of ["레버리지", "진입가", "수량", "손절가"] as const) {
    expect(field(name)).toBeDefined();
  }
  for (const name of ["추정 청산가", "청산가까지 거리"] as const) {
    expect(resultValue(name)).toBeDefined();
  }
  expect(document.body.textContent).not.toMatch(/error|exception|오류/i);
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

function expectNoBrokenScreen() {
  expectNoNaNOrInfinity();
  expectCalculatorIntact();
}

describe("청산가 경고 — 위험한 입력과 결과를 경고하되 입력과 계산은 막지 않는다", () => {
  describe("레버리지가 심볼 최대치를 넘으면 레버리지 입력란 아래에 경고한다", () => {
    /**
     * @spec DoD-21
     * @given 표본(심볼 정보의 maxLeverage로 만든 리터럴): 격리 BTCUSDT 레버리지 151 → `⚠ BTCUSDT의 최대 레버리지는 150배입니다.`, 격리 ETHUSDT 레버리지 151 → `⚠ ETHUSDT의 최대 레버리지는 150배입니다.`, 격리 SOLUSDT 레버리지 101 → `⚠ SOLUSDT의 최대 레버리지는 100배입니다.`, 교차 BTCUSDT 레버리지 151 → `⚠ BTCUSDT의 최대 레버리지는 150배입니다.`
     * @when 표본의 마진 모드·심볼을 고르고 레버리지 입력란에 표본 값을 키 입력으로 넣는다
     * @then 레버리지 입력란 아래(문서 순서상 뒤)에 표본의 경고 문구가 그대로 표시된다
     * @then 레버리지 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     */
    it("[DoD-21] 레버리지가 심볼 최대치를 넘으면 레버리지 입력란에 최대 레버리지 경고가 연결돼 표시된다", async () => {
      const samples: { mode: ModeName; symbol: SymbolName; leverage: string; message: string }[] = [
        {
          mode: "격리",
          symbol: "BTCUSDT",
          leverage: "151",
          message: `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`,
        },
        {
          mode: "격리",
          symbol: "ETHUSDT",
          leverage: "151",
          message: `${WARN} ETHUSDT의 최대 레버리지는 150배입니다.`,
        },
        {
          mode: "격리",
          symbol: "SOLUSDT",
          leverage: "101",
          message: `${WARN} SOLUSDT의 최대 레버리지는 100배입니다.`,
        },
        {
          mode: "교차",
          symbol: "BTCUSDT",
          leverage: "151",
          message: `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`,
        },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, {
          mode: sample.mode,
          symbol: sample.symbol,
          leverage: sample.leverage,
        });
        expect(field("레버리지").value).toBe(sample.leverage);
        expectWarningLinked(field("레버리지"), sample.message);
        unmount();
      }
    });

    /**
     * @spec DoD-21
     * @given 격리 모드다. 표본(심볼 최대치와 같거나 작은 값): BTCUSDT 레버리지 150, ETHUSDT 레버리지 150, SOLUSDT 레버리지 100, BTCUSDT 기본 레버리지 10
     * @when 표본의 심볼을 고르고 레버리지 입력란에 표본 값을 키 입력으로 넣는다
     * @then 레버리지 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다
     * @then 화면에 `최대 레버리지는` 문구가 없다
     */
    it("[DoD-21] 레버리지가 심볼 최대치 이하이면 최대 레버리지 경고가 없다", async () => {
      const samples: { symbol: SymbolName; leverage?: string }[] = [
        { symbol: "BTCUSDT", leverage: "150" },
        { symbol: "ETHUSDT", leverage: "150" },
        { symbol: "SOLUSDT", leverage: "100" },
        // 기본 레버리지 10은 입력하지 않고 첫 화면 값을 그대로 쓴다.
        { symbol: "BTCUSDT" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { symbol: sample.symbol, leverage: sample.leverage });
        expect(field("레버리지").value).toBe(sample.leverage ?? "10");
        expectNoWarningLinked(field("레버리지"));
        expectNoText("최대 레버리지는");
        unmount();
      }
    });
  });

  describe("수량이 최소 주문 수량보다 작거나 수량 단위의 배수가 아니면 수량 입력란 아래에 경고한다", () => {
    /**
     * @spec DoD-22
     * @given 격리 롱 레버리지 10, 진입가 100000이다. 표본(최소 주문 수량보다 작은 값, 심볼 정보의 minOrderQty로 만든 리터럴): BTCUSDT 수량 0.0005 → `⚠ 최소 주문 수량은 0.001 BTC입니다.`, ETHUSDT 수량 0.005 → `⚠ 최소 주문 수량은 0.01 ETH입니다.`, SOLUSDT 수량 0.05 → `⚠ 최소 주문 수량은 0.1 SOL입니다.`
     * @when 표본의 심볼을 고르고 수량 입력란에 표본 값을 키 입력으로 넣는다
     * @then 수량 입력란 아래(문서 순서상 뒤)에 표본의 최소 주문 수량 경고 문구가 그대로 표시된다
     * @then 수량 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     * @then 수량 단위 경고는 표시되지 않아 수량 입력란 경고는 하나뿐이다
     */
    it("[DoD-22] 수량이 최소 주문 수량보다 작으면 수량 입력란에 최소 주문 수량 경고가 연결돼 표시된다", async () => {
      const samples: { symbol: SymbolName; qty: string; message: string }[] = [
        { symbol: "BTCUSDT", qty: "0.0005", message: `${WARN} 최소 주문 수량은 0.001 BTC입니다.` },
        { symbol: "ETHUSDT", qty: "0.005", message: `${WARN} 최소 주문 수량은 0.01 ETH입니다.` },
        { symbol: "SOLUSDT", qty: "0.05", message: `${WARN} 최소 주문 수량은 0.1 SOL입니다.` },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { symbol: sample.symbol, entry: "100000", qty: sample.qty });
        const qtyInput = field("수량");
        const warning = expectWarningLinked(qtyInput, sample.message);
        expect(linkedWarnings(qtyInput)).toEqual([warning]);
        expectNoText("수량 단위는");
        unmount();
      }
    });

    /**
     * @spec DoD-22
     * @given 격리 롱 레버리지 10, 진입가 100000이다. 표본(최소 주문 수량 이상이고 qtyStep의 배수가 아닌 값, 심볼 정보의 qtyStep으로 만든 리터럴): BTCUSDT 수량 0.0015 → `⚠ 수량 단위는 0.001 BTC입니다.`, ETHUSDT 수량 0.015 → `⚠ 수량 단위는 0.01 ETH입니다.`, SOLUSDT 수량 0.15 → `⚠ 수량 단위는 0.1 SOL입니다.`
     * @when 표본의 심볼을 고르고 수량 입력란에 표본 값을 키 입력으로 넣는다
     * @then 수량 입력란 아래(문서 순서상 뒤)에 표본의 수량 단위 경고 문구가 그대로 표시된다
     * @then 수량 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     */
    it("[DoD-22] 수량이 수량 단위의 배수가 아니면 수량 입력란에 수량 단위 경고가 연결돼 표시된다", async () => {
      const samples: { symbol: SymbolName; qty: string; message: string }[] = [
        { symbol: "BTCUSDT", qty: "0.0015", message: `${WARN} 수량 단위는 0.001 BTC입니다.` },
        { symbol: "ETHUSDT", qty: "0.015", message: `${WARN} 수량 단위는 0.01 ETH입니다.` },
        { symbol: "SOLUSDT", qty: "0.15", message: `${WARN} 수량 단위는 0.1 SOL입니다.` },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { symbol: sample.symbol, entry: "100000", qty: sample.qty });
        expect(field("수량").value).toBe(sample.qty);
        expectWarningLinked(field("수량"), sample.message);
        unmount();
      }
    });

    /**
     * @spec DoD-22
     * @given 격리 롱 레버리지 10, 진입가 100000이다. 표본(최소 주문 수량 이상이고 qtyStep의 배수인 값, 부동소수점 오차 경계 포함): BTCUSDT 0.001(minOrderQty와 같음), BTCUSDT 0.003, ETHUSDT 0.07, SOLUSDT 0.3
     * @when 표본의 심볼을 고르고 수량 입력란에 표본 값을 키 입력으로 넣는다
     * @then 수량 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다
     * @then 화면에 `최소 주문 수량은`·`수량 단위는` 문구가 없다
     */
    it("[DoD-22] 수량이 최소 주문 수량 이상이고 수량 단위의 배수이면 수량 경고가 없다", async () => {
      const samples: { symbol: SymbolName; qty: string }[] = [
        { symbol: "BTCUSDT", qty: "0.001" },
        { symbol: "BTCUSDT", qty: "0.003" },
        { symbol: "ETHUSDT", qty: "0.07" },
        { symbol: "SOLUSDT", qty: "0.3" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { symbol: sample.symbol, entry: "100000", qty: sample.qty });
        expect(field("수량").value).toBe(sample.qty);
        expectNoWarningLinked(field("수량"));
        expectNoText("최소 주문 수량은", "수량 단위는");
        unmount();
      }
    });

    /**
     * @spec EC-14
     * @given 격리 BTCUSDT 롱 레버리지 10에서 진입가 100000, 수량 0.0005가 입력돼 `⚠ 최소 주문 수량은 0.001 BTC입니다.`가 떠 있다. 표본: 수량 입력란을 빈 값, `.`, `0`, `0.0`, `00`으로 바꾼다
     * @when 수량 입력란을 표본 값으로 바꾼다
     * @then 수량 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다
     * @then 화면에 `최소 주문 수량은`·`수량 단위는` 문구가 없다
     */
    it("[EC-14] 수량 원문이 빈 값·.·0이면 수량 경고를 판정하지 않는다", async () => {
      const minWarning = `${WARN} 최소 주문 수량은 0.001 BTC입니다.`;
      const { user } = renderCalculator();
      await fillPosition(user, { entry: "100000", qty: "0.0005" });
      for (const sample of ["", ".", "0", "0.0", "00"]) {
        // 표본마다 경고가 떠 있는 상태에서 시작한다.
        await typeInto(user, "수량", "0.0005");
        expectWarningLinked(field("수량"), minWarning);

        await typeInto(user, "수량", sample);
        expect(field("수량").value).toBe(sample);
        expectNoWarningLinked(field("수량"));
        expectNoText("최소 주문 수량은", "수량 단위는");
      }
    });
  });

  describe("손절가가 틱에 맞춘 청산가보다 불리하면 손절가 입력란 아래에 손절 전 청산을 경고한다", () => {
    /**
     * @spec DoD-24
     * @given BTCUSDT 격리 레버리지 10, 진입가 100000, 수량 0.1이다(틱에 맞춘 청산가: 롱 90298.0 → 표시 `90,298.00`, 원값 90297.983…; 숏 109638.1 → 표시 `109,638.10`, 원값 109638.193…). 표본(경고가 뜨는 값): 롱 손절가 90298(표시 청산가와 같음), 롱 90297.99(원값보다 크고 틱에 맞춘 값 이하), 롱 85000, 숏 손절가 109638.1(표시 청산가와 같음), 숏 109638.15(틱에 맞춘 값 이상이고 원값보다 작음), 숏 115000
     * @when 표본의 방향을 고르고 손절가 입력란에 표본 값을 키 입력으로 넣는다
     * @then 손절가 입력란 아래(문서 순서상 뒤)에 `⚠ 손절 전에 청산됩니다.`가 그대로 표시된다
     * @then 손절가 입력란의 `aria-describedby` id 목록이 그 경고 문구 요소를 가리킨다
     */
    it("[DoD-24] 롱은 손절가가 틱에 맞춘 청산가 이하, 숏은 이상이면 손절가 입력란에 손절 전 청산 경고가 연결돼 표시된다", async () => {
      const samples: { side: SideName; stop: string; liquidation: string }[] = [
        { side: "롱", stop: "90298", liquidation: "90,298.00" },
        { side: "롱", stop: "90297.99", liquidation: "90,298.00" },
        { side: "롱", stop: "85000", liquidation: "90,298.00" },
        { side: "숏", stop: "109638.1", liquidation: "109,638.10" },
        { side: "숏", stop: "109638.15", liquidation: "109,638.10" },
        { side: "숏", stop: "115000", liquidation: "109,638.10" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, {
          side: sample.side,
          entry: "100000",
          qty: "0.1",
          stop: sample.stop,
        });
        expect(resultText("추정 청산가")).toBe(sample.liquidation);
        expectWarningLinked(field("손절가"), STOP_WARNING);
        unmount();
      }
    });

    /**
     * @spec DoD-24
     * @given BTCUSDT 격리 레버리지 10, 진입가 100000, 수량 0.1이다(틱에 맞춘 청산가: 롱 90298.0, 숏 109638.1). 표본(경고가 뜨지 않는 값): 롱 손절가 90298.01(표시 청산가보다 큼), 롱 95000, 숏 손절가 109638.09(표시 청산가보다 작음), 숏 105000
     * @when 표본의 방향을 고르고 손절가 입력란에 표본 값을 키 입력으로 넣는다
     * @then 손절가 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다
     * @then 화면에 `손절 전에 청산됩니다.` 문구가 없다
     */
    it("[DoD-24] 롱은 손절가가 틱에 맞춘 청산가보다 크고 숏은 작으면 손절 전 청산 경고가 없다", async () => {
      const samples: { side: SideName; stop: string; liquidation: string }[] = [
        { side: "롱", stop: "90298.01", liquidation: "90,298.00" },
        { side: "롱", stop: "95000", liquidation: "90,298.00" },
        { side: "숏", stop: "109638.09", liquidation: "109,638.10" },
        { side: "숏", stop: "105000", liquidation: "109,638.10" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, {
          side: sample.side,
          entry: "100000",
          qty: "0.1",
          stop: sample.stop,
        });
        expect(resultText("추정 청산가")).toBe(sample.liquidation);
        expectNoWarningLinked(field("손절가"));
        expectNoText("손절 전에 청산됩니다.");
        unmount();
      }
    });

    /**
     * @spec EC-3
     * @given BTCUSDT 격리 롱 레버리지 10, 진입가 100000, 수량 0.1, 손절가 90000이 입력돼 `⚠ 손절 전에 청산됩니다.`가 떠 있다(표시 청산가 `90,298.00`). 표본: 손절가 입력란을 빈 값, `0`, `0.0`, `00`으로 바꾼다
     * @when 손절가 입력란을 표본 값으로 바꾼다
     * @then 손절가 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다
     * @then 화면에 `손절 전에 청산됩니다.` 문구가 없다
     */
    it("[EC-3] 손절가가 빈 값이거나 0 이하이면 손절 경고를 판정하지 않는다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, { entry: "100000", qty: "0.1" });
      expect(resultText("추정 청산가")).toBe("90,298.00");
      for (const sample of ["", "0", "0.0", "00"]) {
        // 표본마다 경고가 떠 있는 상태에서 시작한다.
        await typeInto(user, "손절가", "90000");
        expectWarningLinked(field("손절가"), STOP_WARNING);

        await typeInto(user, "손절가", sample);
        expect(field("손절가").value).toBe(sample);
        expectNoWarningLinked(field("손절가"));
        expectNoText("손절 전에 청산됩니다.");
      }
    });

    /**
     * @spec EC-6
     * @given BTCUSDT 진입가 100000, 수량 0.1이다. 표본(추정 청산가가 `—`·`청산 없음`인 상태): 격리 롱 레버리지 빈 값·손절가 90000 → `—`, 격리 숏 레버리지 빈 값·손절가 110000 → `—`, 교차 롱 계좌 잔고 빈 값·손절가 90000 → `—`, 격리 롱 레버리지 1·손절가 90000 → `청산 없음`, 교차 롱 계좌 잔고 10000·손절가 90000 → `청산 없음`
     * @when 표본대로 마진 모드·방향·레버리지(또는 계좌 잔고)·손절가를 키 입력으로 넣는다
     * @then `추정 청산가`가 표본의 표시(`—` 또는 `청산 없음`)다
     * @then 손절가 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다
     * @then 화면에 `손절 전에 청산됩니다.` 문구가 없다
     */
    it("[EC-6] 추정 청산가가 — 또는 청산 없음이면 손절 경고를 표시하지 않는다", async () => {
      const samples: (Position & { liquidation: string })[] = [
        { mode: "격리", side: "롱", leverage: "", stop: "90000", liquidation: DASH },
        { mode: "격리", side: "숏", leverage: "", stop: "110000", liquidation: DASH },
        { mode: "교차", side: "롱", balance: "", stop: "90000", liquidation: DASH },
        { mode: "격리", side: "롱", leverage: "1", stop: "90000", liquidation: NO_LIQUIDATION },
        { mode: "교차", side: "롱", balance: "10000", stop: "90000", liquidation: NO_LIQUIDATION },
      ];
      for (const { liquidation, ...position } of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { ...position, entry: "100000", qty: "0.1" });
        expect(resultText("추정 청산가")).toBe(liquidation);
        expectNoWarningLinked(field("손절가"));
        expectNoText("손절 전에 청산됩니다.");
        unmount();
      }
    });

    /**
     * @spec EC-9 EC-7
     * @given BTCUSDT 격리 레버리지 10, 진입가 100000, 수량 0.1이다(틱에 맞춘 청산가: 롱 90298.0, 숏 109638.1). 표본(이익 쪽 손절가): 롱 손절가 100000(진입가와 같음), 롱 120000, 숏 손절가 100000(진입가와 같음), 숏 80000 (EC-7 부정 상태 겸용: 표시 청산가가 롱은 진입가 미만, 숏은 진입가 초과)
     * @when 표본의 방향을 고르고 손절가 입력란에 표본 값을 키 입력으로 넣는다
     * @then 손절가 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않는다
     * @then 화면 어디에도 `⚠`로 시작하는 경고 문구가 없다
     */
    it("[EC-7][EC-9] 손절가가 이익 쪽이고 손절 전 청산 조건이 아니면 어떤 경고도 표시하지 않는다", async () => {
      const samples: { side: SideName; stop: string; liquidation: string }[] = [
        { side: "롱", stop: "100000", liquidation: "90,298.00" },
        { side: "롱", stop: "120000", liquidation: "90,298.00" },
        { side: "숏", stop: "100000", liquidation: "109,638.10" },
        { side: "숏", stop: "80000", liquidation: "109,638.10" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, {
          side: sample.side,
          entry: "100000",
          qty: "0.1",
          stop: sample.stop,
        });
        expect(resultText("추정 청산가")).toBe(sample.liquidation);
        expectNoWarningLinked(field("손절가"));
        expect(document.body.textContent).not.toContain(WARN);
        unmount();
      }
    });

    /**
     * @spec EC-9 DoD-24
     * @given BTCUSDT 교차 모드, 진입가 100000, 수량 0.1, 계좌 잔고 20이다(틱에 맞춘 청산가: 롱 100130.5 → `100,130.50`, 숏 99870.4 → `99,870.40`). 표본(이익 쪽이면서 DoD-24 조건을 만족하는 손절가): 롱 손절가 100100(진입가 이상, 청산가 이하), 숏 손절가 99900(진입가 이하, 청산가 이상). 결과 카드에는 EC-7 즉시 청산 경고도 표시된다(이 case는 그것을 판정하지 않는다)
     * @when 표본의 방향을 고르고 손절가 입력란에 표본 값을 키 입력으로 넣는다
     * @then 손절가 입력란 아래에 `⚠ 손절 전에 청산됩니다.`가 표시되고 `aria-describedby` id 목록이 그 요소를 가리킨다
     * @then 손절가 입력란의 `aria-describedby`가 가리키는 `⚠` 경고 요소는 `⚠ 손절 전에 청산됩니다.` 하나뿐이다
     */
    it("[EC-9][DoD-24] 손절가가 이익 쪽이어도 DoD-24 조건을 만족하면 손절가 입력란에는 손절 전 청산 경고 하나만 연결된다", async () => {
      const samples: { side: SideName; stop: string; liquidation: string }[] = [
        { side: "롱", stop: "100100", liquidation: "100,130.50" },
        { side: "숏", stop: "99900", liquidation: "99,870.40" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, {
          mode: "교차",
          side: sample.side,
          entry: "100000",
          qty: "0.1",
          balance: "20",
          stop: sample.stop,
        });
        expect(resultText("추정 청산가")).toBe(sample.liquidation);
        const stopInput = field("손절가");
        const warning = expectWarningLinked(stopInput, STOP_WARNING);
        expect(linkedWarnings(stopInput)).toEqual([warning]);
        unmount();
      }
    });
  });

  describe("포지션 가치가 유지증거금률 첫 단계 한도를 넘으면 결과 카드에 한도 경고를 표시한다", () => {
    /**
     * @spec DoD-26
     * @given 격리 레버리지 10이다. 표본(진입가 × 수량 > riskLimitValue, 손계산 리터럴): BTCUSDT 롱 진입가 100000·수량 3.001(300,100) → `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(300,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`, BTCUSDT 숏 진입가 100000·수량 3.001 → 같은 문구(300,000), ETHUSDT 롱 진입가 3000·수량 100.01(300,030) → 같은 문구(300,000), SOLUSDT 롱 진입가 1000·수량 50.1(50,100) → `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(50,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`
     * @when 표본의 심볼·방향을 고르고 진입가·수량을 키 입력으로 넣는다
     * @then `청산가 결과` region 안에 표본의 한도 경고 문구가 그대로 표시된다
     * @then 한도 경고 문구 요소는 `추정 청산가` 값 요소보다 문서 순서상 뒤에 있다
     * @then 한도 경고 문구 요소는 `청산가까지 거리` 이름(라벨 텍스트) 요소보다 문서 순서상 앞에 있다
     */
    it("[DoD-26] 진입가 × 수량이 첫 단계 한도를 넘으면 결과 카드의 추정 청산가 아래에 한도 경고가 표시된다", async () => {
      const samples: (Position & { message: string })[] = [
        {
          symbol: "BTCUSDT",
          side: "롱",
          entry: "100000",
          qty: "3.001",
          message: LIMIT_WARNING_300K,
        },
        {
          symbol: "BTCUSDT",
          side: "숏",
          entry: "100000",
          qty: "3.001",
          message: LIMIT_WARNING_300K,
        },
        {
          symbol: "ETHUSDT",
          side: "롱",
          entry: "3000",
          qty: "100.01",
          message: LIMIT_WARNING_300K,
        },
        { symbol: "SOLUSDT", side: "롱", entry: "1000", qty: "50.1", message: LIMIT_WARNING_50K },
      ];
      for (const { message, ...position } of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, position);
        expect(field("진입가").value).toBe(position.entry);
        expect(field("수량").value).toBe(position.qty);
        expectResultWarning(message);
        unmount();
      }
    });

    /**
     * @spec DoD-26
     * @given 격리 롱 레버리지 10이다. 표본(진입가 × 수량 ≤ riskLimitValue): BTCUSDT 진입가 100000·수량 3(300,000과 같음), ETHUSDT 진입가 3000·수량 100(300,000과 같음), SOLUSDT 진입가 1000·수량 50(50,000과 같음), BTCUSDT 진입가 100000·수량 0.1(10,000)
     * @when 표본의 심볼을 고르고 진입가·수량을 키 입력으로 넣는다
     * @then 화면에 `유지증거금률 첫 단계 한도` 문구가 없다
     */
    it("[DoD-26] 진입가 × 수량이 첫 단계 한도와 같거나 작으면 한도 경고가 없다", async () => {
      const samples: Position[] = [
        { symbol: "BTCUSDT", entry: "100000", qty: "3" },
        { symbol: "ETHUSDT", entry: "3000", qty: "100" },
        { symbol: "SOLUSDT", entry: "1000", qty: "50" },
        { symbol: "BTCUSDT", entry: "100000", qty: "0.1" },
      ];
      for (const position of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, position);
        expect(field("진입가").value).toBe(position.entry);
        expect(field("수량").value).toBe(position.qty);
        expectNoText("유지증거금률 첫 단계 한도");
        unmount();
      }
    });

    /**
     * @spec EC-12
     * @given 교차 모드다. 표본(진입가 × 수량 > riskLimitValue): BTCUSDT 롱 진입가 100000·수량 3.001·계좌 잔고 50000 → `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(300,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`, BTCUSDT 숏 같은 입력 → 같은 문구, SOLUSDT 롱 진입가 1000·수량 50.1·계좌 잔고 10000 → `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(50,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`
     * @when 마진 모드를 교차로 바꾸고 표본의 심볼·방향을 고른 뒤 진입가·수량·계좌 잔고를 키 입력으로 넣는다
     * @then `청산가 결과` region 안에 표본의 한도 경고 문구가 그대로 표시된다
     * @then 한도 경고 문구 요소는 `추정 청산가` 값 요소보다 문서 순서상 뒤에 있다
     * @then 한도 경고 문구 요소는 `청산가까지 거리` 이름(라벨 텍스트) 요소보다 문서 순서상 앞에 있다
     */
    it("[EC-12] 교차 모드에서도 진입가 × 수량이 첫 단계 한도를 넘으면 한도 경고가 표시된다", async () => {
      const samples: (Position & { message: string })[] = [
        {
          symbol: "BTCUSDT",
          side: "롱",
          entry: "100000",
          qty: "3.001",
          balance: "50000",
          message: LIMIT_WARNING_300K,
        },
        {
          symbol: "BTCUSDT",
          side: "숏",
          entry: "100000",
          qty: "3.001",
          balance: "50000",
          message: LIMIT_WARNING_300K,
        },
        {
          symbol: "SOLUSDT",
          side: "롱",
          entry: "1000",
          qty: "50.1",
          balance: "10000",
          message: LIMIT_WARNING_50K,
        },
      ];
      for (const { message, ...position } of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { ...position, mode: "교차" });
        expect(field("진입가").value).toBe(position.entry);
        expect(field("수량").value).toBe(position.qty);
        expect(field("계좌 잔고").value).toBe(position.balance);
        expectResultWarning(message);
        unmount();
      }
    });

    /**
     * @spec EC-12
     * @given 교차 롱이다. 표본(진입가 × 수량 ≤ riskLimitValue): BTCUSDT 진입가 100000·수량 3·계좌 잔고 50000(300,000과 같음), SOLUSDT 진입가 1000·수량 50·계좌 잔고 10000(50,000과 같음), BTCUSDT 진입가 100000·수량 0.1·계좌 잔고 2000
     * @when 마진 모드를 교차로 바꾸고 표본의 심볼을 고른 뒤 진입가·수량·계좌 잔고를 키 입력으로 넣는다
     * @then 화면에 `유지증거금률 첫 단계 한도` 문구가 없다
     */
    it("[EC-12] 교차 모드에서 진입가 × 수량이 첫 단계 한도와 같거나 작으면 한도 경고가 없다", async () => {
      const samples: Position[] = [
        { symbol: "BTCUSDT", entry: "100000", qty: "3", balance: "50000" },
        { symbol: "SOLUSDT", entry: "1000", qty: "50", balance: "10000" },
        { symbol: "BTCUSDT", entry: "100000", qty: "0.1", balance: "2000" },
      ];
      for (const position of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { ...position, mode: "교차" });
        expect(field("진입가").value).toBe(position.entry);
        expect(field("수량").value).toBe(position.qty);
        expect(field("계좌 잔고").value).toBe(position.balance);
        expectNoText("유지증거금률 첫 단계 한도");
        unmount();
      }
    });

    /**
     * @spec EC-15
     * @given BTCUSDT 롱, 진입가 100000, 수량 3.001(300,100)이다. 표본(추정 청산가가 `—`·`청산 없음`인 상태): 격리 레버리지 빈 값 → `—`, 격리 레버리지 1 → `청산 없음`, 교차 계좌 잔고 빈 값 → `—`, 교차 계좌 잔고 400000 → `청산 없음`
     * @when 표본대로 마진 모드와 레버리지(또는 계좌 잔고)를 키 입력으로 넣는다
     * @then `추정 청산가`가 표본의 표시(`—` 또는 `청산 없음`)이고 `청산가까지 거리`는 `—`다
     * @then `청산가 결과` region 안에 `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(300,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`가 `추정 청산가` 값 요소보다 문서 순서상 뒤에 표시된다
     * @then 그 한도 경고 문구 요소는 `청산가까지 거리` 이름(라벨 텍스트) 요소보다 문서 순서상 앞에 있다
     */
    it("[EC-15] 추정 청산가가 — 또는 청산 없음이어도 진입가 × 수량이 한도를 넘으면 한도 경고가 표시된다", async () => {
      const samples: (Position & { liquidation: string })[] = [
        { mode: "격리", leverage: "", liquidation: DASH },
        { mode: "격리", leverage: "1", liquidation: NO_LIQUIDATION },
        { mode: "교차", balance: "", liquidation: DASH },
        { mode: "교차", balance: "400000", liquidation: NO_LIQUIDATION },
      ];
      for (const { liquidation, ...position } of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { ...position, entry: "100000", qty: "3.001" });
        expect(resultText("추정 청산가")).toBe(liquidation);
        expect(resultText("청산가까지 거리")).toBe(DASH);
        expectResultWarning(LIMIT_WARNING_300K);
        unmount();
      }
    });
  });

  describe("틱에 맞춘 청산가가 진입가에 닿거나 넘어서면 결과 카드에 즉시 청산을 경고한다", () => {
    /**
     * @spec EC-7
     * @given BTCUSDT 진입가 100000, 수량 0.1이다(포지션 가치 10,000으로 한도 이하). 표본(손계산 리터럴, 추정 청산가·청산가까지 거리): 격리 롱 레버리지 400 → `100,080.30`·`0.08%`, 격리 숏 레버리지 400 → `99,920.20`·`0.07%`, 교차 롱 계좌 잔고 20 → `100,130.50`·`0.13%`, 교차 숏 계좌 잔고 20 → `99,870.40`·`0.12%`, 경계(원값은 조건 밖이고 틱에 맞춘 값이 진입가와 같음): 교차 롱 계좌 잔고 33.0005 → 원값 99999.99498… → `100,000.00`·`0.00%`, 교차 숏 계좌 잔고 33.0005 → 원값 100000.00498… → `100,000.00`·`0.00%`
     * @when 표본대로 마진 모드·방향·레버리지(또는 계좌 잔고)·진입가·수량을 키 입력으로 넣는다
     * @then `추정 청산가`와 `청산가까지 거리`가 표본의 값 그대로 표시된다
     * @then `청산가 결과` region 안에 `⚠ 진입 즉시 청산되는 포지션입니다.`가 `추정 청산가` 값 요소보다 문서 순서상 뒤에 표시된다
     * @then 즉시 청산 경고 문구 요소는 `청산가까지 거리` 이름(라벨 텍스트) 요소보다 문서 순서상 앞에 있다
     */
    it("[EC-7] 틱에 맞춘 청산가가 롱은 진입가 이상, 숏은 진입가 이하이면 값과 거리를 그대로 표시하고 즉시 청산 경고를 표시한다", async () => {
      const samples: (Position & { liquidation: string; distance: string })[] = [
        { mode: "격리", side: "롱", leverage: "400", liquidation: "100,080.30", distance: "0.08%" },
        { mode: "격리", side: "숏", leverage: "400", liquidation: "99,920.20", distance: "0.07%" },
        { mode: "교차", side: "롱", balance: "20", liquidation: "100,130.50", distance: "0.13%" },
        { mode: "교차", side: "숏", balance: "20", liquidation: "99,870.40", distance: "0.12%" },
        // 경계: 원값은 조건 밖이고 틱에 맞춘 값이 진입가와 같다.
        {
          mode: "교차",
          side: "롱",
          balance: "33.0005",
          liquidation: "100,000.00",
          distance: "0.00%",
        },
        {
          mode: "교차",
          side: "숏",
          balance: "33.0005",
          liquidation: "100,000.00",
          distance: "0.00%",
        },
      ];
      for (const { liquidation, distance, ...position } of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, { ...position, entry: "100000", qty: "0.1" });
        expect(resultText("추정 청산가")).toBe(liquidation);
        expect(resultText("청산가까지 거리")).toBe(distance);
        expectResultWarning(IMMEDIATE_WARNING);
        unmount();
      }
    });

    /**
     * @spec EC-8 EC-7 DoD-26
     * @given SOLUSDT 격리 레버리지 400, 진입가 1000, 수량 100(포지션 가치 100,000 > 50,000)이다. 표본(손계산 리터럴): 롱 → 원값 1002.5125… → 추정 청산가 `1,002.520`·거리 `0.25%`, 숏 → 원값 997.5124… → `997.510`·`0.24%`
     * @when 심볼을 SOLUSDT로 고르고 표본의 방향·레버리지·진입가·수량을 키 입력으로 넣는다
     * @then `추정 청산가`와 `청산가까지 거리`가 표본의 값 그대로 표시된다
     * @then `청산가 결과` region 안에 `⚠ 진입 즉시 청산되는 포지션입니다.`와 `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(50,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`가 모두 표시된다
     * @then 두 경고 요소는 모두 `추정 청산가` 값 요소보다 문서 순서상 뒤에 있다
     * @then 두 경고 요소는 모두 `청산가까지 거리` 이름(라벨 텍스트) 요소보다 문서 순서상 앞에 있다
     * @then 즉시 청산 경고 요소가 한도 경고 요소보다 문서 순서상 앞에 있다
     */
    it("[EC-8] 즉시 청산 조건과 한도 초과 조건이 함께 성립하면 즉시 청산 경고 → 한도 경고 순서로 모두 표시한다", async () => {
      const samples: { side: SideName; liquidation: string; distance: string }[] = [
        { side: "롱", liquidation: "1,002.520", distance: "0.25%" },
        { side: "숏", liquidation: "997.510", distance: "0.24%" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, {
          symbol: "SOLUSDT",
          side: sample.side,
          leverage: "400",
          entry: "1000",
          qty: "100",
        });
        expect(resultText("추정 청산가")).toBe(sample.liquidation);
        expect(resultText("청산가까지 거리")).toBe(sample.distance);
        const immediate = expectResultWarning(IMMEDIATE_WARNING);
        const limit = expectResultWarning(LIMIT_WARNING_50K);
        expect(isBefore(immediate, limit)).toBe(true);
        unmount();
      }
    });
  });

  describe("경고가 떠도 입력과 계산은 막히지 않는다", () => {
    /**
     * @spec DoD-27 DoD-21 DoD-22 DoD-24 DoD-26 EC-7
     * @given BTCUSDT 격리다. 표본(경고 종류별 입력 → 추정 청산가·청산가까지 거리, 손계산 리터럴): 레버리지 경고 = 롱 레버리지 151·진입가 100000·수량 0.1 → `99,666.70`·`0.33%`, 최소 주문 수량 경고 = 롱 레버리지 10·진입가 100000·수량 0.0005 → `90,298.00`·`9.70%`, 수량 단위 경고 = 롱 레버리지 10·진입가 100000·수량 0.0015 → `90,298.00`·`9.70%`, 손절 경고 = 롱 레버리지 10·진입가 100000·수량 0.1·손절가 90000 → `90,298.00`·`9.70%`, 한도 경고 = 롱 레버리지 10·진입가 100000·수량 3.001 → `90,298.00`·`9.70%`, 즉시 청산 경고 = 롱 레버리지 400·진입가 100000·수량 0.1 → `100,080.30`·`0.08%`
     * @when 표본의 입력을 키 입력으로 넣어 해당 경고가 표시되게 한다
     * @then 표본의 경고 문구가 화면에 표시돼 있다
     * @then 경고가 붙은 입력란을 포함한 모든 입력란이 비활성·읽기 전용이 아니고, 입력란 값은 키 입력한 원문 그대로다
     * @then `추정 청산가`와 `청산가까지 거리`가 표본의 값 그대로 표시된다
     */
    it("[DoD-27] 레버리지·수량·손절·한도·즉시 청산 경고가 떠도 입력은 막히지 않고 추정 청산가와 거리가 계산·표시된다", async () => {
      const samples: {
        inputs: Partial<Record<FieldName, string>>;
        message: string;
        liquidation: string;
        distance: string;
      }[] = [
        {
          inputs: { 레버리지: "151", 진입가: "100000", 수량: "0.1" },
          message: `${WARN} BTCUSDT의 최대 레버리지는 150배입니다.`,
          liquidation: "99,666.70",
          distance: "0.33%",
        },
        {
          inputs: { 레버리지: "10", 진입가: "100000", 수량: "0.0005" },
          message: `${WARN} 최소 주문 수량은 0.001 BTC입니다.`,
          liquidation: "90,298.00",
          distance: "9.70%",
        },
        {
          inputs: { 레버리지: "10", 진입가: "100000", 수량: "0.0015" },
          message: `${WARN} 수량 단위는 0.001 BTC입니다.`,
          liquidation: "90,298.00",
          distance: "9.70%",
        },
        {
          inputs: { 레버리지: "10", 진입가: "100000", 수량: "0.1", 손절가: "90000" },
          message: STOP_WARNING,
          liquidation: "90,298.00",
          distance: "9.70%",
        },
        {
          inputs: { 레버리지: "10", 진입가: "100000", 수량: "3.001" },
          message: LIMIT_WARNING_300K,
          liquidation: "90,298.00",
          distance: "9.70%",
        },
        {
          inputs: { 레버리지: "400", 진입가: "100000", 수량: "0.1" },
          message: IMMEDIATE_WARNING,
          liquidation: "100,080.30",
          distance: "0.08%",
        },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        for (const [name, value] of Object.entries(sample.inputs) as [FieldName, string][]) {
          await typeInto(user, name, value);
        }
        expect(screen.getByText(sample.message).textContent).toBe(sample.message);
        for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
          expect(input.disabled).toBe(false);
          expect(input.readOnly).toBe(false);
          expect(input.getAttribute("aria-disabled")).not.toBe("true");
          expect(input.getAttribute("aria-readonly")).not.toBe("true");
        }
        expectInputValues(sample.inputs);
        expect(resultText("추정 청산가")).toBe(sample.liquidation);
        expect(resultText("청산가까지 거리")).toBe(sample.distance);
        unmount();
      }
    });
  });

  describe("심볼을 바꾸면 입력값은 남고 결과와 경고를 새 심볼 기준으로 다시 판정한다", () => {
    /**
     * @spec EC-11
     * @given BTCUSDT 격리 롱 레버리지 10에서 진입가 1000, 수량 100(포지션 가치 100,000), 손절가 903.5가 입력돼 있고, 교차에서 계좌 잔고 2000을 넣은 뒤 격리로 돌아왔다(격리는 계좌 잔고를 쓰지 않는다). 추정 청산가 `903.00`, 청산가까지 거리 `9.70%`가 표시되고 손절 경고와 한도 경고가 없다
     * @when 심볼을 BTCUSDT에서 SOLUSDT로 바꾼다
     * @then 방향·레버리지·마진 모드·진입가·수량·손절가 입력값은 바뀌지 않는다
     * @then 추정 청산가가 SOLUSDT의 tickSize·priceScale·mmr로 다시 계산돼 `904.530`(원값 904.5226…, 0.01 단위 올림), 청산가까지 거리가 `9.54%`로 표시된다
     * @then 손절가 입력란 아래에 `⚠ 손절 전에 청산됩니다.`가 표시되고 `aria-describedby` id 목록이 그 요소를 가리킨다
     * @then `청산가 결과` region 안 `추정 청산가` 값 요소 뒤에 `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(50,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`가 표시된다
     * @then 한도 경고 문구 요소는 `청산가까지 거리` 이름(라벨 텍스트) 요소보다 문서 순서상 앞에 있다
     * @then 심볼을 바꾼 뒤 교차로 바꾸면 계좌 잔고가 `2000`이다
     */
    it("[EC-11] BTCUSDT에서 SOLUSDT로 바꾸면 입력값은 유지되고 결과가 다시 계산되며 손절 경고와 한도 경고가 나타난다", async () => {
      const inputs = { 레버리지: "10", 진입가: "1000", 수량: "100", 손절가: "903.5" } as const;
      const { user } = renderCalculator();
      await fillPosition(user, { entry: inputs.진입가, qty: inputs.수량, stop: inputs.손절가 });
      await chooseMode(user, "교차");
      await typeInto(user, "계좌 잔고", "2000");
      await chooseMode(user, "격리");

      // 전제: BTCUSDT 기준 결과이고 손절 경고·한도 경고가 없다.
      expect(resultText("추정 청산가")).toBe("903.00");
      expect(resultText("청산가까지 거리")).toBe("9.70%");
      expectNoWarningLinked(field("손절가"));
      expectNoText("손절 전에 청산됩니다.", "유지증거금률 첫 단계 한도");

      await chooseSymbol(user, "SOLUSDT");

      expect(isPressed(toggle("방향", "롱"))).toBe(true);
      expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
      expectInputValues(inputs);
      expect(resultText("추정 청산가")).toBe("904.530");
      expect(resultText("청산가까지 거리")).toBe("9.54%");
      expectWarningLinked(field("손절가"), STOP_WARNING);
      expectResultWarning(LIMIT_WARNING_50K);

      await chooseMode(user, "교차");
      expect(field("계좌 잔고").value).toBe("2000");
    });

    /**
     * @spec EC-11
     * @given SOLUSDT 격리 롱 레버리지 10에서 진입가 1000, 수량 100, 손절가 903.5가 입력돼 추정 청산가 `904.530`, 청산가까지 거리 `9.54%`, 손절 경고와 `(50,000 USDT)` 한도 경고가 표시돼 있다
     * @when 심볼을 SOLUSDT에서 BTCUSDT로 바꾼다
     * @then 방향·레버리지·마진 모드·진입가·수량·손절가 입력값은 바뀌지 않는다
     * @then 추정 청산가가 BTCUSDT 기준으로 `903.00`(원값 902.9798…, 0.1 단위 올림), 청산가까지 거리가 `9.70%`로 표시된다
     * @then 손절가 입력란의 `aria-describedby`가 `⚠`로 시작하는 경고 요소를 가리키지 않고 화면에 `손절 전에 청산됩니다.` 문구가 없다
     * @then 화면에 `유지증거금률 첫 단계 한도` 문구가 없다
     */
    it("[EC-11] SOLUSDT에서 BTCUSDT로 바꾸면 입력값은 유지되고 결과가 다시 계산되며 손절 경고와 한도 경고가 사라진다", async () => {
      const inputs = { 레버리지: "10", 진입가: "1000", 수량: "100", 손절가: "903.5" } as const;
      const { user } = renderCalculator();
      await fillPosition(user, {
        symbol: "SOLUSDT",
        entry: inputs.진입가,
        qty: inputs.수량,
        stop: inputs.손절가,
      });

      // 전제: SOLUSDT 기준 결과이고 손절 경고와 50,000 USDT 한도 경고가 떠 있다.
      expect(resultText("추정 청산가")).toBe("904.530");
      expect(resultText("청산가까지 거리")).toBe("9.54%");
      expectWarningLinked(field("손절가"), STOP_WARNING);
      expectResultWarning(LIMIT_WARNING_50K);

      await chooseSymbol(user, "BTCUSDT");

      expect(isPressed(toggle("방향", "롱"))).toBe(true);
      expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
      expectInputValues(inputs);
      expect(resultText("추정 청산가")).toBe("903.00");
      expect(resultText("청산가까지 거리")).toBe("9.70%");
      expectNoWarningLinked(field("손절가"));
      expectNoText("손절 전에 청산됩니다.");
      expectNoText("유지증거금률 첫 단계 한도");
    });
  });

  describe("어떤 입력과 전환에도 화면이 깨지지 않는다", () => {
    /**
     * @spec EC-13
     * @given 표본(격리·교차, 롱·숏 각각에서 반복): 레버리지 빈 값·`0`·`00`·`999999999999999999999`, 진입가·수량·계좌 잔고·손절가 각각 빈 값·`.`·`0`·`0.0`·`0.00000001`·`99999999999999999999`·`9`를 400자 이어 붙인 값(숫자로 바꾸면 Infinity), 진입가 `99999999999999999999`·수량 `99999999999999999999`를 함께 넣은 값
     * @when 표본의 값을 해당 입력란에 키 입력으로 넣는다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 청산가 입력·청산가 결과 카드가 그대로 렌더돼 있고 오류 메시지가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-13] 비정상·극단 입력에도 NaN·Infinity·오류 메시지가 나타나지 않고 console.error가 호출되지 않는다", async () => {
      // 숫자로 바꾸면 Infinity가 되는 400자 값.
      const longNines = "9".repeat(400);
      const leverageSamples = ["", "0", "00", "999999999999999999999"];
      const decimalSamples = ["", ".", "0", "0.0", "0.00000001", "99999999999999999999", longNines];
      const base = {
        레버리지: "10",
        진입가: "100000",
        수량: "0.1",
        "계좌 잔고": "2000",
        손절가: "90000",
      };

      for (const mode of ["격리", "교차"] as const) {
        for (const side of ["롱", "숏"] as const) {
          const { user, unmount } = renderCalculator({ fast: true });
          await fillPosition(user, {
            mode,
            side,
            leverage: base.레버리지,
            entry: base.진입가,
            qty: base.수량,
            // 계좌 잔고 입력란은 교차에서만 보인다(DoD-6).
            balance: mode === "교차" ? base["계좌 잔고"] : undefined,
            stop: base.손절가,
          });

          const targets: { name: FieldName; samples: string[] }[] = [
            { name: "레버리지", samples: leverageSamples },
            { name: "진입가", samples: decimalSamples },
            { name: "수량", samples: decimalSamples },
            ...(mode === "교차" ? [{ name: "계좌 잔고" as const, samples: decimalSamples }] : []),
            { name: "손절가", samples: decimalSamples },
          ];
          for (const { name, samples } of targets) {
            for (const sample of samples) {
              await typeInto(user, name, sample);
              expect(field(name).value).toBe(sample);
              expectNoBrokenScreen();
            }
            await typeInto(user, name, base[name]);
          }

          await typeInto(user, "진입가", "99999999999999999999");
          await typeInto(user, "수량", "99999999999999999999");
          expectNoBrokenScreen();
          unmount();
        }
      }
    }, 120_000);

    /**
     * @spec EC-13
     * @given BTCUSDT 격리 롱 레버리지 10, 진입가 100000, 수량 0.1, 손절가 90000이 입력돼 있고 교차에서 계좌 잔고 2000을 넣은 적이 있다
     * @when 마진 모드 격리↔교차, 방향 롱↔숏, 심볼 BTCUSDT→ETHUSDT→SOLUSDT→BTCUSDT 전환을 사이 대기 없이 연달아 반복한다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 청산가 입력·청산가 결과 카드가 그대로 렌더돼 있고 오류 메시지가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[EC-13] 마진 모드·방향·심볼을 빠르게 바꿔도 NaN·Infinity·오류 메시지가 나타나지 않고 console.error가 호출되지 않는다", async () => {
      const { user } = renderCalculator({ fast: true });
      await fillPosition(user, { leverage: "10", entry: "100000", qty: "0.1", stop: "90000" });
      await chooseMode(user, "교차");
      await typeInto(user, "계좌 잔고", "2000");
      await chooseMode(user, "격리");

      // 사이에 확인 없이 전환을 연달아 반복한다.
      for (let round = 0; round < 3; round += 1) {
        await chooseMode(user, "교차");
        await chooseSide(user, "숏");
        await chooseSymbol(user, "ETHUSDT");
        await chooseMode(user, "격리");
        await chooseSide(user, "롱");
        await chooseSymbol(user, "SOLUSDT");
        await chooseMode(user, "교차");
        await chooseSymbol(user, "BTCUSDT");
        await chooseMode(user, "격리");
      }

      // 연속 전환이 실제로 끝까지 반영됐는지(격리·롱) 확인한 뒤 화면을 본다.
      expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
      expect(isPressed(toggle("방향", "롱"))).toBe(true);
      expectNoBrokenScreen();
    });
  });
});
