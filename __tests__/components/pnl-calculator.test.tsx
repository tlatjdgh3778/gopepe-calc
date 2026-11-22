import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { PnlCalculator } from "@/components/pnl-calculator";

// 기대 문자열의 부호·빈 값 기호는 코드 포인트로 정확히 비교한다.
const MINUS = "−"; // U+2212
const DASH = "—"; // U+2014

type User = ReturnType<typeof userEvent.setup>;
type FieldName = "레버리지" | "진입가" | "종료가" | "수량";
type ResultName = "필요 증거금" | "손익" | "ROE";
type Position = {
  symbol?: "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
  side?: "롱" | "숏";
  leverage?: string;
  entry?: string;
  qty?: string;
  exit?: string;
};

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
  const { unmount } = render(<PnlCalculator />);
  return { user, unmount };
}

function field(name: FieldName): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function result(name: ResultName): HTMLElement {
  return screen.getByLabelText(name);
}

function toggle(group: "방향" | "수량 단위", name: string): HTMLElement {
  return within(screen.getByRole("group", { name: group })).getByRole("button", { name });
}

/** 기존 값을 지우고 실제 키 입력으로 새 값을 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, name: FieldName, value: string) {
  const input = field(name);
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

/** 입력란을 클릭한 뒤 클립보드 붙여넣기 한 번으로 값을 넣는다. */
async function pasteInto(user: User, name: FieldName, value: string) {
  await user.click(field(name));
  await user.paste(value);
}

async function chooseSymbol(user: User, symbol: NonNullable<Position["symbol"]>) {
  await user.click(screen.getByRole("combobox", { name: "심볼" }));
  await user.click(await screen.findByRole("option", { name: symbol }));
}

async function chooseSide(user: User, side: "롱" | "숏") {
  await user.click(toggle("방향", side));
}

async function chooseUnit(user: User, unit: "코인" | "USDT") {
  await user.click(toggle("수량 단위", unit));
}

/** 심볼 → 방향 → 레버리지 → 진입가 → 수량 → 종료가 순서로 넣는다. 종료가가 마지막이다. */
async function fillPosition(user: User, position: Position) {
  if (position.symbol !== undefined && position.symbol !== "BTCUSDT") {
    await chooseSymbol(user, position.symbol);
  }
  if (position.side !== undefined) {
    await chooseSide(user, position.side);
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
  if (position.exit !== undefined) {
    await typeInto(user, "종료가", position.exit);
  }
}

/** 세 결과 값 요소의 표시 문자열을 읽는다. 기대값은 `toMatchObject`로 필요한 키만 비교한다. */
function readResults() {
  return {
    margin: result("필요 증거금").textContent,
    pnl: result("손익").textContent,
    roe: result("ROE").textContent,
  };
}

function expectNoNaNOrInfinity() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.getAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
}

function expectControlsIntactWithoutConsoleError() {
  expect(screen.getByRole("combobox", { name: "심볼" })).toBeDefined();
  expect(screen.getByRole("group", { name: "방향" })).toBeDefined();
  expect(screen.getByRole("group", { name: "수량 단위" })).toBeDefined();
  for (const name of ["레버리지", "진입가", "종료가", "수량"] as const) {
    expect(field(name)).toBeDefined();
  }
  for (const name of ["필요 증거금", "손익", "ROE"] as const) {
    expect(result(name)).toBeDefined();
  }
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

function expectNoBrokenScreen() {
  expectNoNaNOrInfinity();
  expectControlsIntactWithoutConsoleError();
}

// C1 = BTCUSDT 롱 레버리지 10, 진입가 65000, 종료가 67250.5, 수량 0.12 (스펙 DoD-5 사례 표)
const C1: Position = { leverage: "10", entry: "65000", qty: "0.12", exit: "67250.5" };
const C1_RESULTS = { margin: "780.00 USDT", pnl: "+270.0600 USDT", roe: "+34.62%" };

describe("포지션 손익 계산 — 입력하면 계산 버튼 없이 필요 증거금·손익·ROE가 바로 표시된다", () => {
  describe("첫 화면을 열면 기본값과 이름 붙은 컨트롤이 보인다", () => {
    /**
     * @spec DoD-9
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 계산기를 렌더링한다
     * @then 심볼은 BTCUSDT가 선택돼 있다
     * @then 방향은 롱이 선택돼 있다
     * @then 레버리지는 10이다
     * @then 수량 단위는 코인이 선택돼 있다
     * @then 진입가·종료가·수량 입력란은 비어 있다
     * @then 필요 증거금·손익·ROE는 모두 `—`로 표시된다
     */
    it("[DoD-9] 첫 화면은 BTCUSDT·롱·레버리지 10·코인 단위이고 입력란은 비어 있으며 세 결과는 —다", async () => {
      renderCalculator();

      expect(screen.getByRole("combobox", { name: "심볼" }).textContent).toContain("BTCUSDT");
      expect(toggle("방향", "롱").getAttribute("aria-pressed")).toBe("true");
      expect(toggle("방향", "숏").getAttribute("aria-pressed")).toBe("false");
      expect(field("레버리지").value).toBe("10");
      expect(toggle("수량 단위", "코인").getAttribute("aria-pressed")).toBe("true");
      expect(toggle("수량 단위", "USDT").getAttribute("aria-pressed")).toBe("false");
      expect(field("진입가").value).toBe("");
      expect(field("종료가").value).toBe("");
      expect(field("수량").value).toBe("");
      expect(readResults()).toMatchObject({ margin: DASH, pnl: DASH, roe: DASH });
    });

    /**
     * @spec DoD-19
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 입력 컨트롤과 결과를 접근 이름으로 찾는다
     * @then 심볼, 방향, 레버리지, 진입가, 종료가, 수량, 수량 단위라는 이름의 입력 컨트롤이 각각 있다
     * @then 방향 컨트롤 안에 롱, 숏이라는 이름의 선택지가 있다
     * @then 수량 단위 컨트롤 안에 코인, USDT라는 이름의 선택지가 있다
     * @then 필요 증거금, 손익, ROE라는 이름의 결과가 각각 있다
     */
    it("[DoD-19] 입력 컨트롤과 결과를 스펙의 접근 이름으로 찾을 수 있다", async () => {
      renderCalculator();

      expect(screen.getByRole("combobox", { name: "심볼" })).toBeDefined();
      const side = screen.getByRole("group", { name: "방향" });
      expect(field("레버리지")).toBeDefined();
      expect(field("진입가")).toBeDefined();
      expect(field("종료가")).toBeDefined();
      expect(field("수량")).toBeDefined();
      const unit = screen.getByRole("group", { name: "수량 단위" });

      expect(within(side).getByRole("button", { name: "롱" })).toBeDefined();
      expect(within(side).getByRole("button", { name: "숏" })).toBeDefined();
      expect(within(unit).getByRole("button", { name: "코인" })).toBeDefined();
      expect(within(unit).getByRole("button", { name: "USDT" })).toBeDefined();

      expect(screen.getByLabelText("필요 증거금")).toBeDefined();
      expect(screen.getByLabelText("손익")).toBeDefined();
      expect(screen.getByLabelText("ROE")).toBeDefined();
    });
  });

  describe("값을 입력하면 계산 버튼 없이 결과가 즉시 갱신된다", () => {
    /**
     * @spec DoD-10
     * @given 첫 화면에서 종료가는 비워 둔다. 표본(스펙 DoD-5 사례 표와 공유, 기대값은 손계산 리터럴, 심볼별 자릿수는 DoD-20 case가 본다): C1 = BTCUSDT 롱 레버리지 10, 진입가 65000, 수량 0.12 → 필요 증거금 `780.00 USDT`
     * @when 진입가·수량·레버리지를 키 입력으로 넣는다
     * @then 버튼을 누르지 않아도 필요 증거금이 `780.00 USDT`(부호 없는 USDT 형식)로 표시된다
     * @then 종료가가 비어 있으므로 손익과 ROE는 `—`로 표시된다
     */
    it("[DoD-10] 진입가·수량·레버리지를 넣으면 필요 증거금이 부호 없이 표시되고 손익·ROE는 —다", async () => {
      const { user } = renderCalculator();

      await typeInto(user, "진입가", "65000");
      await typeInto(user, "수량", "0.12");
      await typeInto(user, "레버리지", "10");

      // 계산 버튼을 누르지 않는다.
      expect(readResults()).toMatchObject({ margin: "780.00 USDT", pnl: DASH, roe: DASH });
    });

    /**
     * @spec DoD-11
     * @given 표본의 진입가·수량·레버리지가 입력돼 있다. 표본(스펙 DoD-5 사례 표와 공유, 기대값은 DoD-18 버림·DoD-20 자릿수로 손계산한 리터럴): C1 = BTCUSDT 롱 레버리지 10, 진입가 65000, 종료가 67250.5, 수량 0.12 → 손익 `+270.0600 USDT`, ROE 원값 34.6230769 → `+34.62%` (음수 signed 형식은 DoD-20·DoD-12 case가 본다)
     * @when 종료가를 키 입력으로 넣는다
     * @then 버튼을 누르지 않아도 손익이 표본의 기대값(`signed` 형식)으로 표시된다
     * @then 버튼을 누르지 않아도 ROE가 표본의 기대값으로 표시된다
     * @then 손익과 ROE는 종료가 키 입력 직후 타이머 대기 없이 표시된다
     */
    it("[DoD-11] 종료가까지 넣으면 손익(signed)과 ROE가 즉시 표시된다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, { leverage: "10", entry: "65000", qty: "0.12" });

      await user.type(field("종료가"), "67250.5");

      // 키 입력 직후 동기로 읽는다(waitFor·findBy·타이머 대기 없음).
      expect(result("손익").textContent).toBe("+270.0600 USDT");
      expect(result("ROE").textContent).toBe("+34.62%");
    });

    /**
     * @spec DoD-20
     * @given 첫 화면이다. 표본(스펙 DoD-5 사례 표와 공유, 기대값은 DoD-18 버림으로 손계산한 리터럴): C2 = BTCUSDT 숏 20, 진입가 98765.4, 종료가 99999.9, 수량 0.042 → `207.40 USDT` / `−51.8490 USDT` / `−24.99%`, C3 = ETHUSDT 롱 25, 진입가 3456.78, 종료가 3210.55, 수량 1.37 → `189.43 USDT` / `−337.3351 USDT` / `−178.07%`, C5 = SOLUSDT 롱 15, 진입가 150.12, 종료가 150.12, 수량 12.3 → `123.098 USDT` / `0.0000 USDT` / `0.00%`, C6 = SOLUSDT 숏 3, 진입가 142.5, 종료가 131.88, 수량 40 → `1,900.000 USDT` / `+424.8000 USDT` / `+22.35%` (`−`는 U+2212)
     * @when 표본의 심볼·방향·레버리지·진입가·종료가·수량을 키 입력으로 넣는다
     * @then 필요 증거금이 BTCUSDT·ETHUSDT에서는 소수 2자리, SOLUSDT에서는 소수 3자리로 표본의 기대값과 같게 표시된다
     * @then 손익이 소수 4자리로 표본의 기대값과 같게 표시된다
     * @then ROE가 소수 2자리로 표본의 기대값과 같게 표시된다
     */
    it("[DoD-20] 필요 증거금은 심볼별 자릿수, 손익은 4자리, ROE는 2자리로 표시된다", async () => {
      const samples: Array<{ position: Position; margin: string; pnl: string; roe: string }> = [
        {
          // C2
          position: {
            symbol: "BTCUSDT",
            side: "숏",
            leverage: "20",
            entry: "98765.4",
            qty: "0.042",
            exit: "99999.9",
          },
          margin: "207.40 USDT",
          pnl: `${MINUS}51.8490 USDT`,
          roe: `${MINUS}24.99%`,
        },
        {
          // C3
          position: {
            symbol: "ETHUSDT",
            side: "롱",
            leverage: "25",
            entry: "3456.78",
            qty: "1.37",
            exit: "3210.55",
          },
          margin: "189.43 USDT",
          pnl: `${MINUS}337.3351 USDT`,
          roe: `${MINUS}178.07%`,
        },
        {
          // C5
          position: {
            symbol: "SOLUSDT",
            side: "롱",
            leverage: "15",
            entry: "150.12",
            qty: "12.3",
            exit: "150.12",
          },
          margin: "123.098 USDT",
          pnl: "0.0000 USDT",
          roe: "0.00%",
        },
        {
          // C6
          position: {
            symbol: "SOLUSDT",
            side: "숏",
            leverage: "3",
            entry: "142.5",
            qty: "40",
            exit: "131.88",
          },
          margin: "1,900.000 USDT",
          pnl: "+424.8000 USDT",
          roe: "+22.35%",
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, sample.position);

        expect(readResults()).toMatchObject({
          margin: sample.margin,
          pnl: sample.pnl,
          roe: sample.roe,
        });
        unmount();
      }
    });

    /**
     * @spec EC-3
     * @given 진입가·종료가·수량·레버리지가 모두 입력돼 결과 세 개가 표시돼 있다. 표본: 진입가·수량 입력란 각각을 빈 값, 소수점 `.`만 있는 값, 0으로 바꾼다
     * @when 진입가 또는 수량을 표본 값으로 바꾼다
     * @then 필요 증거금·손익·ROE가 모두 `—`로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-3] 진입가 또는 수량이 빈 값·.·0이면 세 결과 모두 —로 표시한다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, C1);
      expect(readResults()).toMatchObject(C1_RESULTS);

      for (const name of ["진입가", "수량"] as const) {
        for (const sample of ["", ".", "0"]) {
          await typeInto(user, name, sample);

          expect(readResults()).toMatchObject({ margin: DASH, pnl: DASH, roe: DASH });
          expectNoBrokenScreen();

          await typeInto(user, name, C1[name === "진입가" ? "entry" : "qty"] ?? "");
          expect(readResults()).toMatchObject(C1_RESULTS);
        }
      }
    });

    /**
     * @spec EC-3
     * @given 진입가·종료가·수량·레버리지가 모두 입력돼 결과 세 개가 표시돼 있다. 표본: 종료가 입력란을 빈 값, 소수점 `.`만 있는 값, 0으로 바꾼다
     * @when 종료가를 표본 값으로 바꾼다
     * @then 손익·ROE는 `—`로 표시된다
     * @then 필요 증거금은 진입가 × 수량 ÷ 레버리지로 계산된 값으로 계속 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-3] 종료가가 빈 값·.·0이면 손익·ROE만 —로 표시하고 필요 증거금은 표시한다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, C1);
      expect(readResults()).toMatchObject(C1_RESULTS);

      for (const sample of ["", ".", "0"]) {
        await typeInto(user, "종료가", sample);

        // 증거금 65000 × 0.12 ÷ 10 = 780
        expect(readResults()).toMatchObject({ margin: "780.00 USDT", pnl: DASH, roe: DASH });
        expectNoBrokenScreen();

        await typeInto(user, "종료가", "67250.5");
        expect(readResults()).toMatchObject(C1_RESULTS);
      }
    });

    /**
     * @spec EC-3
     * @given 진입가·종료가·수량·레버리지가 모두 입력돼 결과 세 개가 표시돼 있다. 표본: 레버리지 입력란을 빈 값, 0으로 바꾼다
     * @when 레버리지를 표본 값으로 바꾼다
     * @then 필요 증거금·ROE는 `—`로 표시된다
     * @then 손익은 진입가·종료가·수량으로 계산된 값으로 계속 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-3] 레버리지가 빈 값·0이면 필요 증거금·ROE만 —로 표시하고 손익은 표시한다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, C1);
      expect(readResults()).toMatchObject(C1_RESULTS);

      for (const sample of ["", "0"]) {
        await typeInto(user, "레버리지", sample);

        // 손익 (67250.5 − 65000) × 0.12 = 270.06
        expect(readResults()).toMatchObject({ margin: DASH, pnl: "+270.0600 USDT", roe: DASH });
        expectNoBrokenScreen();

        await typeInto(user, "레버리지", "10");
        expect(readResults()).toMatchObject(C1_RESULTS);
      }
    });
  });

  describe("손익과 ROE는 표시값의 부호에 따라 이익·손실 상태로 표시된다", () => {
    /**
     * @spec DoD-12
     * @given 표본의 심볼·방향·레버리지·진입가·수량이 입력돼 있다. 표본(스펙 DoD-5 사례 표와 공유): 롱에서 종료가가 진입가보다 높은 C1(`+270.0600 USDT`, `+34.62%`), 숏에서 종료가가 진입가보다 낮은 C6(`+424.8000 USDT`, `+22.35%`)
     * @when 종료가를 키 입력으로 넣어 손익·ROE 표시값이 양수가 된다
     * @then 손익은 이익 상태로 표시된다
     * @then ROE는 이익 상태로 표시된다
     */
    it("[DoD-12] 표시값이 양수인 손익·ROE는 이익 상태로 표시된다", async () => {
      const samples: Array<{ position: Position; pnl: string; roe: string }> = [
        // C1: 롱, 종료가 > 진입가
        {
          position: { symbol: "BTCUSDT", side: "롱", ...C1 },
          pnl: "+270.0600 USDT",
          roe: "+34.62%",
        },
        // C6: 숏, 종료가 < 진입가
        {
          position: {
            symbol: "SOLUSDT",
            side: "숏",
            leverage: "3",
            entry: "142.5",
            qty: "40",
            exit: "131.88",
          },
          pnl: "+424.8000 USDT",
          roe: "+22.35%",
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, sample.position);

        expect(readResults()).toMatchObject({ pnl: sample.pnl, roe: sample.roe });
        expect(result("손익").getAttribute("data-tone")).toBe("profit");
        expect(result("ROE").getAttribute("data-tone")).toBe("profit");
        unmount();
      }
    });

    /**
     * @spec DoD-12
     * @given 표본의 심볼·방향·레버리지·진입가·수량이 입력돼 있다. 표본(스펙 DoD-5 사례 표와 공유): 롱에서 종료가가 진입가보다 낮은 C3(`−337.3351 USDT`, `−178.07%`), 숏에서 종료가가 진입가보다 높은 C2(`−51.8490 USDT`, `−24.99%`)
     * @when 종료가를 키 입력으로 넣어 손익·ROE 표시값이 음수가 된다
     * @then 손익은 손실 상태로 표시된다
     * @then ROE는 손실 상태로 표시된다
     */
    it("[DoD-12] 표시값이 음수인 손익·ROE는 손실 상태로 표시된다", async () => {
      const samples: Array<{ position: Position; pnl: string; roe: string }> = [
        // C3: 롱, 종료가 < 진입가
        {
          position: {
            symbol: "ETHUSDT",
            side: "롱",
            leverage: "25",
            entry: "3456.78",
            qty: "1.37",
            exit: "3210.55",
          },
          pnl: `${MINUS}337.3351 USDT`,
          roe: `${MINUS}178.07%`,
        },
        // C2: 숏, 종료가 > 진입가
        {
          position: {
            symbol: "BTCUSDT",
            side: "숏",
            leverage: "20",
            entry: "98765.4",
            qty: "0.042",
            exit: "99999.9",
          },
          pnl: `${MINUS}51.8490 USDT`,
          roe: `${MINUS}24.99%`,
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, sample.position);

        expect(readResults()).toMatchObject({ pnl: sample.pnl, roe: sample.roe });
        expect(result("손익").getAttribute("data-tone")).toBe("loss");
        expect(result("ROE").getAttribute("data-tone")).toBe("loss");
        unmount();
      }
    });

    /**
     * @spec EC-12
     * @given 표본의 심볼·방향·레버리지·진입가·수량이 입력돼 있다. 표본(기대값은 DoD-18 버림으로 손계산): 종료가가 진입가와 같은 C5(SOLUSDT 롱 15, 150.12 → 150.12, 수량 12.3), 원값이 양수지만 버림으로 0이 되는 값(BTCUSDT 롱 10, 진입가 100000, 종료가 100000.0001, 수량 0.9 → 손익 원값 0.00009, ROE 원값 0.000001%), 원값이 음수지만 버림으로 0이 되는 값(BTCUSDT 롱 10, 진입가 100000, 종료가 99999.9999, 수량 0.9 → 손익 원값 −0.00009, ROE 원값 −0.000001%)
     * @when 종료가를 키 입력으로 넣어 손익이 `0.0000 USDT`, ROE가 `0.00%`로 표시된다
     * @then 손익은 부호 없는 `0.0000 USDT`이고 중립 상태로 표시된다
     * @then ROE는 부호 없는 `0.00%`이고 중립 상태로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-12] 표시값이 0인 손익·ROE는 중립 상태로 표시된다", async () => {
      const samples: Position[] = [
        // C5: 종료가 = 진입가
        {
          symbol: "SOLUSDT",
          side: "롱",
          leverage: "15",
          entry: "150.12",
          qty: "12.3",
          exit: "150.12",
        },
        // 손익 원값 0.0001 × 0.9 = 0.00009, ROE 원값 0.00009 ÷ 9000 × 100 = 0.000001
        {
          symbol: "BTCUSDT",
          side: "롱",
          leverage: "10",
          entry: "100000",
          qty: "0.9",
          exit: "100000.0001",
        },
        // 손익 원값 −0.00009, ROE 원값 −0.000001
        {
          symbol: "BTCUSDT",
          side: "롱",
          leverage: "10",
          entry: "100000",
          qty: "0.9",
          exit: "99999.9999",
        },
      ];

      for (const position of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, position);

        expect(result("손익").textContent).toBe("0.0000 USDT");
        expect(result("손익").getAttribute("data-tone")).toBe("neutral");
        expect(result("ROE").textContent).toBe("0.00%");
        expect(result("ROE").getAttribute("data-tone")).toBe("neutral");
        expectNoBrokenScreen();
        unmount();
      }
    });

    /**
     * @spec DoD-12 EC-12
     * @given 표본의 심볼·방향·레버리지·진입가·수량이 입력돼 있다. 표본(기대값은 DoD-18 버림으로 손계산): 손익만 0인 경우(BTCUSDT 롱 10, 진입가 1, 종료가 1.001, 수량 0.05 → 손익 원값 0.00005 → `0.0000 USDT`, ROE 원값 1 → `+1.00%`), ROE만 0인 경우(BTCUSDT 롱 1, 진입가 100000, 종료가 100000.01, 수량 1 → 손익 원값 0.01 → `+0.0100 USDT`, ROE 원값 0.00001 → `0.00%`)
     * @when 종료가를 키 입력으로 넣는다
     * @then 표시값이 0(`0.0000 USDT` 또는 `0.00%`)인 결과는 중립 상태로 표시된다
     * @then 표시값이 0이 아닌 결과는 자기 표시값의 부호에 따라 이익 또는 손실 상태로 표시된다(두 표본 모두 이익 상태)
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[DoD-12][EC-12] 손익과 ROE는 각자의 표시값으로 상태를 정한다", async () => {
      const samples: Array<{
        position: Position;
        pnl: string;
        pnlTone: string;
        roe: string;
        roeTone: string;
      }> = [
        {
          // 손익 원값 0.001 × 0.05 = 0.00005 → 0, ROE 원값 0.00005 ÷ 0.005 × 100 = 1
          position: {
            symbol: "BTCUSDT",
            side: "롱",
            leverage: "10",
            entry: "1",
            qty: "0.05",
            exit: "1.001",
          },
          pnl: "0.0000 USDT",
          pnlTone: "neutral",
          roe: "+1.00%",
          roeTone: "profit",
        },
        {
          // 손익 원값 0.01 × 1 = 0.01, ROE 원값 0.01 ÷ 100000 × 100 = 0.00001 → 0
          position: {
            symbol: "BTCUSDT",
            side: "롱",
            leverage: "1",
            entry: "100000",
            qty: "1",
            exit: "100000.01",
          },
          pnl: "+0.0100 USDT",
          pnlTone: "profit",
          roe: "0.00%",
          roeTone: "neutral",
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, sample.position);

        expect(readResults()).toMatchObject({ pnl: sample.pnl, roe: sample.roe });
        expect(result("손익").getAttribute("data-tone")).toBe(sample.pnlTone);
        expect(result("ROE").getAttribute("data-tone")).toBe(sample.roeTone);
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("수량 단위를 바꾸면 수량이 환산돼 입력란에 채워진다", () => {
    /**
     * @spec DoD-13
     * @given 수량 단위가 코인이고 진입가와 코인 수량이 입력돼 있다. 표본: 끝의 0이 지워지는 값(수량 0.004, 진입가 50 → 원값 0.2 → `0.2`), 소수 8자리를 넘어 사사오입으로 올라가는 값(수량 0.123456789, 진입가 2 → 원값 0.246913578 → `0.24691358`, 버림이었다면 `0.24691357`), 1000 이상 값(수량 0.12, 진입가 65000 → 원값 7800 → `7800`), JS 기본 문자열화에서 지수 표기가 되는 1e-6 미만 값(수량 0.000000012, 진입가 10 → 원값 1.2e-7 → `0.00000012`), 8자리 다음 자리가 정확히 5인 사사오입 경계(수량 0.00000005, 진입가 0.5 → 원값 2.5e-8 → `0.00000003`, 10진 값 기준 사사오입이며 halfEven·toFixed·버림이었다면 `0.00000002`)
     * @when 수량 단위를 USDT로 바꾼다
     * @then 수량 입력란에 수량 × 진입가가 지수 표기 없이, 천 단위 구분(쉼표) 없이 소수 최대 8자리로 10진 사사오입하고(DoD-18의 버림은 적용하지 않는다) 끝의 0을 지운 형식으로 채워진다
     */
    it("[DoD-13] 코인 → USDT로 바꾸면 수량 × 진입가가 입력란에 채워진다", async () => {
      const samples = [
        { entry: "50", qty: "0.004", filled: "0.2" },
        { entry: "2", qty: "0.123456789", filled: "0.24691358" },
        { entry: "65000", qty: "0.12", filled: "7800" },
        { entry: "10", qty: "0.000000012", filled: "0.00000012" },
        { entry: "0.5", qty: "0.00000005", filled: "0.00000003" },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await typeInto(user, "진입가", sample.entry);
        await typeInto(user, "수량", sample.qty);

        await chooseUnit(user, "USDT");

        expect(toggle("수량 단위", "USDT").getAttribute("aria-pressed")).toBe("true");
        expect(field("수량").value).toBe(sample.filled);
        unmount();
      }
    });

    /**
     * @spec EC-10
     * @given 수량 단위가 USDT이고 진입가·종료가·레버리지·USDT 금액이 입력돼 결과가 표시돼 있다
     * @when 진입가를 다른 값으로 바꾼다
     * @then 수량 입력란의 USDT 금액은 바뀌지 않는다
     * @then 환산 코인 수량이 새 진입가 기준(금액 ÷ 새 진입가)으로 다시 표시된다
     * @then 필요 증거금·손익·ROE가 새 진입가와 새 코인 수량으로 다시 계산돼 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-10] USDT 모드에서 진입가가 바뀌면 금액은 유지되고 코인 수량과 결과가 다시 계산된다", async () => {
      const { user } = renderCalculator();
      await chooseUnit(user, "USDT");
      await fillPosition(user, { leverage: "10", entry: "100000", qty: "20000", exit: "110000" });
      // 수량 20000 ÷ 100000 = 0.2, 증거금 100000 × 0.2 ÷ 10 = 2000, 손익 10000 × 0.2 = 2000, ROE 100
      expect(screen.getByText("≈ 0.200 BTC")).toBeDefined();
      expect(readResults()).toMatchObject({
        margin: "2,000.00 USDT",
        pnl: "+2,000.0000 USDT",
        roe: "+100.00%",
      });

      await typeInto(user, "진입가", "80000");

      expect(field("수량").value).toBe("20000");
      // 수량 20000 ÷ 80000 = 0.25, 증거금 80000 × 0.25 ÷ 10 = 2000, 손익 30000 × 0.25 = 7500, ROE 7500 ÷ 2000 × 100 = 375
      expect(screen.getByText("≈ 0.250 BTC")).toBeDefined();
      expect(screen.queryByText("≈ 0.200 BTC")).toBeNull();
      expect(readResults()).toMatchObject({
        margin: "2,000.00 USDT",
        pnl: "+7,500.0000 USDT",
        roe: "+375.00%",
      });
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-11
     * @given 수량 입력란에 값이 있고 진입가가 비어 있거나 소수점 `.`만 있거나 0이다. 표본: 진입가 빈 값·`.`·0 각각에 대해 코인 → USDT 전환, USDT → 코인 전환
     * @when 수량 단위를 바꾼다
     * @then 수량 입력란이 비워진다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-11] 진입가가 비어 있거나 .만 있거나 0이면 수량 단위를 바꿀 때 수량 입력란이 비워진다", async () => {
      for (const entry of ["", ".", "0"]) {
        // 코인 → USDT
        {
          const { user, unmount } = renderCalculator();
          await typeInto(user, "수량", "0.5");
          await typeInto(user, "진입가", entry);

          await chooseUnit(user, "USDT");

          expect(field("수량").value).toBe("");
          expectNoBrokenScreen();
          unmount();
        }
        // USDT → 코인
        {
          const { user, unmount } = renderCalculator();
          await chooseUnit(user, "USDT");
          await typeInto(user, "수량", "100");
          await typeInto(user, "진입가", entry);

          await chooseUnit(user, "코인");

          expect(field("수량").value).toBe("");
          expectNoBrokenScreen();
          unmount();
        }
      }
    });

    /**
     * @spec EC-13 EC-3
     * @given 수량 단위가 USDT이다. 표본: BTCUSDT에서 금액이 비어 있음, 금액이 0, 진입가가 비어 있음, 진입가가 0 / ETHUSDT에서 금액이 비어 있음
     * @when 코인 수량을 환산할 수 없는 상태가 된다
     * @then 참고 수량이 `≈ — {기초 코인}` 형식(BTCUSDT면 `≈ — BTC`, ETHUSDT면 `≈ — ETH`)으로 표시된다
     * @then 필요 증거금·손익·ROE가 `—`로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-13][EC-3] 코인 수량을 환산할 수 없으면 참고 수량을 ≈ — {기초 코인}으로, 결과를 —로 표시한다", async () => {
      const samples: Array<{
        symbol: NonNullable<Position["symbol"]>;
        entry: string;
        exit: string;
        change: { name: "진입가" | "수량"; value: string };
        reference: string;
      }> = [
        {
          symbol: "BTCUSDT",
          entry: "100000",
          exit: "110000",
          change: { name: "수량", value: "" },
          reference: `≈ ${DASH} BTC`,
        },
        {
          symbol: "BTCUSDT",
          entry: "100000",
          exit: "110000",
          change: { name: "수량", value: "0" },
          reference: `≈ ${DASH} BTC`,
        },
        {
          symbol: "BTCUSDT",
          entry: "100000",
          exit: "110000",
          change: { name: "진입가", value: "" },
          reference: `≈ ${DASH} BTC`,
        },
        {
          symbol: "BTCUSDT",
          entry: "100000",
          exit: "110000",
          change: { name: "진입가", value: "0" },
          reference: `≈ ${DASH} BTC`,
        },
        {
          symbol: "ETHUSDT",
          entry: "3000",
          exit: "3300",
          change: { name: "수량", value: "" },
          reference: `≈ ${DASH} ETH`,
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await chooseUnit(user, "USDT");
        // 먼저 환산 가능한 금액으로 결과를 띄운 뒤, 환산할 수 없는 상태로 바꾼다.
        await fillPosition(user, {
          symbol: sample.symbol,
          leverage: "10",
          entry: sample.entry,
          qty: "100",
          exit: sample.exit,
        });
        expect(result("필요 증거금").textContent).not.toBe(DASH);

        await typeInto(user, sample.change.name, sample.change.value);

        expect(screen.getByText(sample.reference)).toBeDefined();
        expect(readResults()).toMatchObject({ margin: DASH, pnl: DASH, roe: DASH });
        expectNoBrokenScreen();
        unmount();
      }
    });
  });

  describe("심볼이나 방향을 바꾸면 입력값은 남고 결과만 다시 계산된다", () => {
    /**
     * @spec EC-9
     * @given BTCUSDT에서 C2 입력(숏, 레버리지 20, 진입가 98765.4, 종료가 99999.9, 수량 0.042)이 들어가 필요 증거금 `207.40 USDT`, 손익 `−51.8490 USDT`, ROE `−24.99%`가 표시돼 있다(`−`는 U+2212)
     * @when 심볼을 BTCUSDT에서 SOLUSDT로 바꾼다
     * @then 방향·레버리지·진입가·종료가·수량 입력값은 바뀌지 않는다
     * @then 필요 증거금이 SOLUSDT 자릿수로 다시 계산돼 `207.407 USDT`로 표시된다(원값 207.40734, 3자리 버림)
     * @then 손익은 `−51.8490 USDT`, ROE는 `−24.99%`로 그대로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-9] 심볼을 바꿔도 입력값은 유지되고 결과가 다시 계산된다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, {
        side: "숏",
        leverage: "20",
        entry: "98765.4",
        qty: "0.042",
        exit: "99999.9",
      });
      expect(readResults()).toMatchObject({
        margin: "207.40 USDT",
        pnl: `${MINUS}51.8490 USDT`,
        roe: `${MINUS}24.99%`,
      });

      await chooseSymbol(user, "SOLUSDT");

      expect(screen.getByRole("combobox", { name: "심볼" }).textContent).toContain("SOLUSDT");
      expect(toggle("방향", "숏").getAttribute("aria-pressed")).toBe("true");
      expect(field("레버리지").value).toBe("20");
      expect(field("진입가").value).toBe("98765.4");
      expect(field("종료가").value).toBe("99999.9");
      expect(field("수량").value).toBe("0.042");
      // 증거금 원값 98765.4 × 0.042 ÷ 20 = 207.40734 → SOLUSDT 3자리 버림
      expect(readResults()).toMatchObject({
        margin: "207.407 USDT",
        pnl: `${MINUS}51.8490 USDT`,
        roe: `${MINUS}24.99%`,
      });
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-9
     * @given 롱으로 진입가·종료가·수량·레버리지가 입력돼 결과가 표시돼 있다
     * @when 방향을 숏으로 바꾼다
     * @then 레버리지·진입가·종료가·수량 입력값은 바뀌지 않는다
     * @then 손익이 숏 공식((진입가 − 종료가) × 수량)으로 다시 계산돼 표시된다
     * @then ROE가 다시 계산된 손익 기준으로 표시된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-9] 방향을 바꿔도 입력값은 유지되고 결과가 다시 계산된다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, { side: "롱", ...C1 });
      expect(readResults()).toMatchObject(C1_RESULTS);

      await chooseSide(user, "숏");

      expect(toggle("방향", "숏").getAttribute("aria-pressed")).toBe("true");
      expect(field("레버리지").value).toBe("10");
      expect(field("진입가").value).toBe("65000");
      expect(field("종료가").value).toBe("67250.5");
      expect(field("수량").value).toBe("0.12");
      // 숏 손익 (65000 − 67250.5) × 0.12 = −270.06, ROE −270.06 ÷ 780 × 100 = −34.6230769
      expect(readResults()).toMatchObject({
        margin: "780.00 USDT",
        pnl: `${MINUS}270.0600 USDT`,
        roe: `${MINUS}34.62%`,
      });
      expectNoBrokenScreen();
    });
  });

  describe("허용되지 않는 문자가 섞인 입력은 통째로 무시된다", () => {
    /**
     * @spec EC-1
     * @given 레버리지 입력란에 직전 값이 있다. 표본: 키 입력은 허용되지 않는 글자 하나(`.`, `,`, `+`, `-`, 문자) / 붙여넣기(한 번의 변경)는 위 글자 하나, 숫자와 위 글자가 섞인 값(`1e5`, `-5`, `+5`, `Infinity`, `1.5`, `1,000`)
     * @when 레버리지 입력란에 표본을 넣는다
     * @then 레버리지 입력란은 직전 값을 유지한다
     * @then 결과는 직전 값 기준 표시 그대로다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-1] 레버리지에 숫자가 아닌 문자가 섞인 변경은 무시되고 직전 값이 유지된다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, C1);
      expect(readResults()).toMatchObject(C1_RESULTS);

      const typed = [".", ",", "+", "-", "a"];
      const pasted = [".", ",", "+", "-", "a", "1e5", "-5", "+5", "Infinity", "1.5", "1,000"];

      for (const sample of typed) {
        await user.type(field("레버리지"), sample);

        expect(field("레버리지").value).toBe("10");
        expect(readResults()).toMatchObject(C1_RESULTS);
        expectNoBrokenScreen();
      }
      for (const sample of pasted) {
        await pasteInto(user, "레버리지", sample);

        expect(field("레버리지").value).toBe("10");
        expect(readResults()).toMatchObject(C1_RESULTS);
        expectNoBrokenScreen();
      }
    });

    /**
     * @spec EC-1
     * @given 레버리지 입력란에 직전 값이 있다. 표본: 숫자만으로 된 키 입력, 숫자만으로 된 붙여넣기
     * @when 레버리지 입력란에 표본을 넣는다
     * @then 레버리지 입력란에 넣은 숫자가 반영된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-1] 레버리지에 숫자만으로 된 변경은 반영된다", async () => {
      const { user } = renderCalculator();
      expect(field("레버리지").value).toBe("10");

      await typeInto(user, "레버리지", "25");
      expect(field("레버리지").value).toBe("25");
      expectNoBrokenScreen();

      await user.clear(field("레버리지"));
      await pasteInto(user, "레버리지", "50");
      expect(field("레버리지").value).toBe("50");
      expectNoBrokenScreen();
    });

    /**
     * @spec EC-2
     * @given 진입가·종료가·수량(코인 모드)·USDT 금액(USDT 모드의 수량) 입력란에 각각 직전 값이 있다. 표본(입력란마다): 키 입력은 허용되지 않는 글자 하나(`,`, `+`, `-`, 문자, 직전 값에 소수점이 있을 때의 두 번째 `.`) / 붙여넣기(한 번의 변경)는 위 글자 하나, 숫자와 위 글자가 섞인 값(`1e5`, `-5`, `+5`, `Infinity`, `1,000`, 두 번째 소수점이 든 `1.2.3`)
     * @when 각 입력란에 표본을 넣는다
     * @then 그 입력란은 직전 값을 유지한다
     * @then 결과는 직전 값 기준 표시 그대로다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-2] 가격·수량 입력란에 허용되지 않는 문자가 섞인 변경은 무시되고 직전 값이 유지된다", async () => {
      const { user } = renderCalculator();
      // 모든 입력란의 직전 값에 소수점이 있게 둔다(두 번째 소수점 표본용). 결과는 C1과 같다.
      await fillPosition(user, { leverage: "10", entry: "65000.0", qty: "0.12", exit: "67250.5" });
      expect(readResults()).toMatchObject(C1_RESULTS);

      const typed = [",", "+", "-", "a", "."];
      const pasted = [",", "+", "-", "a", ".", "1e5", "-5", "+5", "Infinity", "1,000", "1.2.3"];

      async function expectRejected(name: "진입가" | "종료가" | "수량", previous: string) {
        for (const sample of typed) {
          await user.type(field(name), sample);

          expect(field(name).value).toBe(previous);
          expect(readResults()).toMatchObject(C1_RESULTS);
          expectNoBrokenScreen();
        }
        for (const sample of pasted) {
          await pasteInto(user, name, sample);

          expect(field(name).value).toBe(previous);
          expect(readResults()).toMatchObject(C1_RESULTS);
          expectNoBrokenScreen();
        }
      }

      await expectRejected("진입가", "65000.0");
      await expectRejected("종료가", "67250.5");
      await expectRejected("수량", "0.12");

      // USDT 모드의 수량(USDT 금액): 7800.0 ÷ 65000 = 0.12 이므로 결과는 C1과 같다.
      await chooseUnit(user, "USDT");
      await typeInto(user, "수량", "7800.0");
      expect(readResults()).toMatchObject(C1_RESULTS);
      await expectRejected("수량", "7800.0");
    });

    /**
     * @spec EC-2
     * @given 진입가·종료가·수량(코인 모드)·USDT 금액(USDT 모드의 수량) 입력란이 있다. 표본(입력란마다, 키 입력과 붙여넣기 각각): 숫자만으로 된 값, 숫자와 소수점 하나로 된 값
     * @when 각 입력란에 표본을 넣는다
     * @then 그 입력란에 넣은 값이 반영된다
     * @then 화면 텍스트와 입력란 값에 `NaN`·`Infinity`가 없다
     * @then 계산기 컨트롤이 그대로 렌더돼 있고 콘솔 오류가 기록되지 않는다
     */
    it("[EC-2] 가격·수량 입력란에 숫자와 소수점 하나로 된 변경은 반영된다", async () => {
      const { user } = renderCalculator();
      const samples = ["123", "12.5"];

      async function expectAccepted(name: "진입가" | "종료가" | "수량") {
        for (const sample of samples) {
          await typeInto(user, name, sample);
          expect(field(name).value).toBe(sample);
          expectNoBrokenScreen();

          await user.clear(field(name));
          await pasteInto(user, name, sample);
          expect(field(name).value).toBe(sample);
          expectNoBrokenScreen();
        }
      }

      await expectAccepted("진입가");
      await expectAccepted("종료가");
      await expectAccepted("수량");

      await chooseUnit(user, "USDT");
      expect(toggle("수량 단위", "USDT").getAttribute("aria-pressed")).toBe("true");
      await expectAccepted("수량");
    });
  });
});
