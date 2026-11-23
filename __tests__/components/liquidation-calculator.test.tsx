import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import Page from "@/app/page";
import { LiquidationCalculator } from "@/components/liquidation-calculator";

// 계획 T-5 완료 조건 (5): 각 case의 화면에 `NaN`·`Infinity`가 없음을 본문에서 공통으로 확인한다.
// 표본 기대값은 모두 손계산 리터럴이다. 심볼 정보(lib/symbols.ts 기준일 2026-11-22):
//   BTCUSDT tickSize 0.1, priceScale 2, mmr 0.0033 / ETHUSDT tickSize 0.01, priceScale 2, mmr 0.0033 /
//   SOLUSDT tickSize 0.01, priceScale 3, mmr 0.005
// 손계산 식: 격리 담보 = 진입가 × 수량 ÷ 레버리지, 교차 담보 = 계좌 잔고.
//   롱 원값 = (진입가 × 수량 − 담보) ÷ (수량 × (1 − mmr)), 숏 원값 = (진입가 × 수량 + 담보) ÷ (수량 × (1 + mmr)).
//   표시 = 롱은 틱 올림, 숏은 틱 내림 후 priceScale 자릿수와 천 단위 구분.
//   거리 = |틱에 맞춘 청산가 − 진입가| ÷ 진입가 × 100을 소수 2자리 버림 + `%`.
// 조회는 스펙 4장의 접근 이름과 role로만 한다. "선택됨"은 F-1 토글과 같이 `aria-pressed="true"`로 본다.
// "아래"는 문서 순서로 판정한다(계획 테스트 설계 증거의 해석).

// 기호와 문구는 코드 포인트까지 정확히 비교한다.
const DASH = "—"; // U+2014
const NO_LIQUIDATION = "청산 없음";
const CROSS_LEVERAGE_NOTE = "교차에서는 레버리지가 청산가에 영향을 주지 않습니다.";
const DISCLAIMER =
  "추정치입니다. 유지증거금률 첫 단계만 쓰고 수수료·유지증거금 공제액·마크가격·펀딩을 반영하지 않습니다. 교차는 계좌에 이 포지션 하나만 있다고 가정합니다. 거래소 표시값과 다를 수 있습니다.";

type User = ReturnType<typeof userEvent.setup>;
type SymbolName = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type FieldName = "레버리지" | "진입가" | "수량" | "계좌 잔고" | "손절가";
type ResultName = "추정 청산가" | "청산가까지 거리";
type Mode = "격리" | "교차";
type Side = "롱" | "숏";
type Position = {
  mode?: Mode;
  symbol?: SymbolName;
  side?: Side;
  leverage?: string;
  entry?: string;
  qty?: string;
  balance?: string;
  stop?: string;
};

function renderCalculator() {
  const user = userEvent.setup();
  const { unmount } = render(<LiquidationCalculator />);
  return { user, unmount };
}

function field(name: FieldName): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function queryField(name: FieldName): HTMLInputElement | null {
  return screen.queryByRole("textbox", { name }) as HTMLInputElement | null;
}

/** 결과 값 요소(`getByLabelText`). 표시 문자열은 textContent로 읽는다. */
function result(name: ResultName): HTMLElement {
  return screen.getByLabelText(name);
}

function readResults() {
  return {
    liquidation: result("추정 청산가").textContent,
    distance: result("청산가까지 거리").textContent,
  };
}

function toggle(group: "방향" | "마진 모드", name: string): HTMLElement {
  return within(screen.getByRole("group", { name: group })).getByRole("button", { name });
}

function isPressed(element: HTMLElement): boolean {
  return element.getAttribute("aria-pressed") === "true";
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

async function chooseMode(user: User, mode: Mode) {
  await user.click(toggle("마진 모드", mode));
}

async function chooseSide(user: User, side: Side) {
  await user.click(toggle("방향", side));
}

/** 마진 모드 → 심볼 → 방향 → 레버리지 → 진입가 → 수량 → 계좌 잔고 → 손절가 순서로 넣는다. */
async function fillPosition(user: User, position: Position) {
  if (position.mode !== undefined) {
    await chooseMode(user, position.mode);
  }
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
  if (position.balance !== undefined) {
    await typeInto(user, "계좌 잔고", position.balance);
  }
  if (position.stop !== undefined) {
    await typeInto(user, "손절가", position.stop);
  }
}

/** `a`가 문서 순서상 `b`보다 뒤(화면상 아래)에 있다. */
function isAfter(a: Node, b: Node): boolean {
  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** `hidden` 속성으로 숨겨지지 않은, 문구가 정확히 같은 요소들. */
function visibleTexts(text: string): HTMLElement[] {
  return screen.queryAllByText(text).filter((el) => el.closest("[hidden]") === null);
}

function expectNoNaNOrInfinity() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.queryAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
}

function expectNoProfitLossTone(element: HTMLElement) {
  expect(["profit", "loss"]).not.toContain(element.getAttribute("data-tone"));
}

// 격리 BTCUSDT 롱 레버리지 10, 진입가 100000, 수량 0.1 → `90,298.00`·`9.70%`
const ISOLATED_BTC_LONG: Position = { leverage: "10", entry: "100000", qty: "0.1" };
const ISOLATED_BTC_LONG_RESULTS = { liquidation: "90,298.00", distance: "9.70%" };
// 교차 BTCUSDT 롱, 진입가 100000, 수량 0.1, 계좌 잔고 2000 → `80,264.90`·`19.73%`
const CROSS_BTC_LONG: Position = { mode: "교차", entry: "100000", qty: "0.1", balance: "2000" };
const CROSS_BTC_LONG_RESULTS = { liquidation: "80,264.90", distance: "19.73%" };

describe("청산가 계산 — 마진 모드와 포지션을 입력하면 추정 청산가와 진입가 대비 거리가 바로 표시된다", () => {
  describe("홈 화면의 탭 목록에서 청산가 탭을 골라 청산가 계산기를 연다", () => {
    /**
     * @spec DoD-1
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더링한다. 목표가 탭은 등록돼 있을 수도, 없을 수도 있다
     * @when 탭 목록의 탭 순서를 본다
     * @then 이름이 `청산가`인 탭이 있다
     * @then `청산가` 탭은 `손익` 탭보다 뒤에 있다
     * @then 이름이 `목표가`인 탭이 있으면 `청산가` 탭은 `목표가` 탭보다도 뒤에 있다
     */
    it("[DoD-1] 청산가 탭은 손익 탭 뒤(목표가 탭이 있으면 목표가 뒤)에 있다", async () => {
      render(<Page />);

      const labels = screen.getAllByRole("tab").map((tab) => tab.textContent);
      const liquidationIndex = labels.indexOf("청산가");
      expect(liquidationIndex).toBeGreaterThanOrEqual(0);
      const pnlIndex = labels.indexOf("손익");
      expect(pnlIndex).toBeGreaterThanOrEqual(0);
      expect(liquidationIndex).toBeGreaterThan(pnlIndex);
      // 목표가 탭은 등록 여부가 정해지지 않았다. 없으면 indexOf가 −1이라 아래 비교는 항상 성립하고,
      // 있으면 청산가 탭이 목표가 탭보다 뒤인지 본다.
      const targetIndex = labels.indexOf("목표가");
      expect(liquidationIndex).toBeGreaterThan(targetIndex);
      expectNoNaNOrInfinity();
    });

    /**
     * @spec DoD-1
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더링한다
     * @when `청산가` 탭을 누른다
     * @then `청산가` 탭이 선택된다
     * @then 이름이 `청산가`인 탭 패널이 보인다
     * @then 그 탭 패널 안에 청산가 계산기(`청산가 입력`·`청산가 결과` 영역)가 보인다
     */
    it("[DoD-1] 청산가 탭을 누르면 청산가 탭 패널에 청산가 계산기가 보인다", async () => {
      const user = userEvent.setup();
      render(<Page />);

      const tab = screen.getByRole("tab", { name: "청산가" });
      await user.click(tab);

      expect(tab.getAttribute("aria-selected")).toBe("true");
      // 탭 패널은 탭 id가 등록된 뒤 이름이 붙으므로 자동 재시도 조회로 찾는다.
      const panel = await screen.findByRole("tabpanel", { name: "청산가" });
      expect(panel.hidden).toBe(false);
      expect(within(panel).getByRole("region", { name: "청산가 입력" })).toBeDefined();
      expect(within(panel).getByRole("region", { name: "청산가 결과" })).toBeDefined();
      expect(within(panel).getByRole("group", { name: "마진 모드" })).toBeDefined();
      expectNoNaNOrInfinity();
    });
  });

  describe("첫 화면을 열면 청산가 카드와 이름 붙은 입력, 기본값이 보인다", () => {
    /**
     * @spec DoD-3
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 청산가 계산기를 렌더링한다
     * @then 접근 이름이 `청산가 입력`인 region이 있고 그 카드 제목이 `청산가 입력`이다
     * @then 접근 이름이 `청산가 결과`인 region이 있고 그 카드 제목이 `청산가 결과`다
     */
    it("[DoD-3] 두 카드의 제목과 region 이름은 청산가 입력·청산가 결과다", async () => {
      renderCalculator();

      const inputRegion = screen.getByRole("region", { name: "청산가 입력" });
      const resultRegion = screen.getByRole("region", { name: "청산가 결과" });
      expect(within(inputRegion).getByText("청산가 입력").textContent).toBe("청산가 입력");
      expect(within(resultRegion).getByText("청산가 결과").textContent).toBe("청산가 결과");
      expectNoNaNOrInfinity();
    });

    /**
     * @spec DoD-4
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when `청산가 입력` 영역 안에서 입력 컨트롤을 접근 이름으로 찾는다
     * @then 심볼, 방향, 레버리지, 마진 모드, 진입가, 수량, 손절가라는 이름의 입력 컨트롤이 각각 있다
     * @then 방향 컨트롤 안에 `롱`, `숏`이라는 이름의 선택지가 있다
     */
    it("[DoD-4] 청산가 입력 카드에 심볼·방향(롱/숏)·레버리지·마진 모드·진입가·수량·손절가 입력이 있다", async () => {
      renderCalculator();

      const inputRegion = within(screen.getByRole("region", { name: "청산가 입력" }));
      expect(inputRegion.getByRole("combobox", { name: "심볼" })).toBeDefined();
      const side = inputRegion.getByRole("group", { name: "방향" });
      expect(inputRegion.getByRole("textbox", { name: "레버리지" })).toBeDefined();
      expect(inputRegion.getByRole("group", { name: "마진 모드" })).toBeDefined();
      expect(inputRegion.getByRole("textbox", { name: "진입가" })).toBeDefined();
      expect(inputRegion.getByRole("textbox", { name: "수량" })).toBeDefined();
      expect(inputRegion.getByRole("textbox", { name: "손절가" })).toBeDefined();

      expect(within(side).getByRole("button", { name: "롱" })).toBeDefined();
      expect(within(side).getByRole("button", { name: "숏" })).toBeDefined();
      expectNoNaNOrInfinity();
    });

    /**
     * @spec DoD-31
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 첫 화면을 보고, 이어서 계좌 잔고 입력란을 보기 위해 마진 모드만 `교차`로 바꾼다
     * @then 심볼은 `BTCUSDT`가 선택돼 있다
     * @then 방향은 `롱`이 선택돼 있다
     * @then 레버리지는 `10`이다
     * @then 진입가·수량·손절가 입력란은 비어 있다
     * @then `교차`로 바꿨을 때 나타난 계좌 잔고 입력란은 비어 있다
     */
    it("[DoD-31] 첫 화면은 BTCUSDT·롱·레버리지 10이고 진입가·수량·계좌 잔고·손절가는 비어 있다", async () => {
      const { user } = renderCalculator();

      expect(screen.getByRole("combobox", { name: "심볼" }).textContent).toContain("BTCUSDT");
      expect(isPressed(toggle("방향", "롱"))).toBe(true);
      expect(isPressed(toggle("방향", "숏"))).toBe(false);
      expect(field("레버리지").value).toBe("10");
      expect(field("진입가").value).toBe("");
      expect(field("수량").value).toBe("");
      expect(field("손절가").value).toBe("");
      expectNoNaNOrInfinity();

      // 계좌 잔고 입력란은 교차에서만 보이므로 마진 모드만 바꿔 확인한다.
      await chooseMode(user, "교차");

      expect(field("계좌 잔고").value).toBe("");
      expectNoNaNOrInfinity();
    });
  });

  describe("마진 모드는 격리·교차 두 버튼으로 고르고, 교차일 때만 계좌 잔고 입력과 레버리지 안내가 보인다", () => {
    /**
     * @spec DoD-5
     * @given 아무 입력도 하지 않은 첫 화면이다
     * @when 이름이 `마진 모드`인 그룹을 본다
     * @then 그룹 안에 `격리`, `교차` 두 버튼만 있다
     * @then `격리`가 선택돼 있고 `교차`는 선택돼 있지 않다
     */
    it("[DoD-5] 마진 모드 그룹에 격리·교차 두 버튼이 있고 처음에는 격리가 선택돼 있다", async () => {
      renderCalculator();

      const group = screen.getByRole("group", { name: "마진 모드" });
      const buttons = within(group).getAllByRole("button");
      expect(buttons.map((button) => button.textContent)).toEqual(["격리", "교차"]);
      expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
      expect(isPressed(toggle("마진 모드", "교차"))).toBe(false);
      expectNoNaNOrInfinity();
    });

    /**
     * @spec DoD-5
     * @given 첫 화면이다(격리 선택)
     * @when `교차` 버튼을 누르고, 이어서 `격리` 버튼을 누른다
     * @then `교차`를 누른 뒤에는 `교차`만 선택돼 있다
     * @then `격리`를 누른 뒤에는 `격리`만 선택돼 있다
     */
    it("[DoD-5] 마진 모드 버튼을 누르면 누른 모드가 선택된다", async () => {
      const { user } = renderCalculator();

      await chooseMode(user, "교차");

      expect(isPressed(toggle("마진 모드", "교차"))).toBe(true);
      expect(isPressed(toggle("마진 모드", "격리"))).toBe(false);

      await chooseMode(user, "격리");

      expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
      expect(isPressed(toggle("마진 모드", "교차"))).toBe(false);
      expectNoNaNOrInfinity();
    });

    /**
     * @spec DoD-6 DoD-7
     * @given 마진 모드가 `격리`다. 표본: 첫 화면, `교차`로 바꿨다가 다시 `격리`로 돌아온 화면
     * @when `계좌 잔고` 입력란과 레버리지 입력란, 그 주변을 본다
     * @then `계좌 잔고` 입력란이 보이지 않는다
     * @then 레버리지 입력란이 보인다
     * @then `교차에서는 레버리지가 청산가에 영향을 주지 않습니다.`가 화면에 없다
     */
    it("[DoD-6][DoD-7] 격리 모드에서는 계좌 잔고 입력란이 없고, 레버리지 입력란은 보이며 교차 레버리지 안내는 없다", async () => {
      const { user } = renderCalculator();

      const expectIsolatedView = () => {
        expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
        expect(queryField("계좌 잔고")).toBeNull();
        expect(field("레버리지")).toBeDefined();
        expect(visibleTexts(CROSS_LEVERAGE_NOTE)).toEqual([]);
        expectNoNaNOrInfinity();
      };

      // 표본 1: 첫 화면
      expectIsolatedView();

      // 표본 2: 교차로 바꿨다가 다시 격리로 돌아온 화면
      await chooseMode(user, "교차");
      await chooseMode(user, "격리");
      expectIsolatedView();
    });

    /**
     * @spec DoD-6 DoD-7
     * @given 첫 화면이다
     * @when 마진 모드를 `교차`로 바꾼다
     * @then `계좌 잔고` 입력란이 보인다
     * @then 레버리지 입력란이 보인다
     * @then 레버리지 입력란 아래에 `교차에서는 레버리지가 청산가에 영향을 주지 않습니다.`가 표시된다
     */
    it("[DoD-6][DoD-7] 교차 모드에서는 계좌 잔고 입력란이 보이고, 레버리지 입력란 아래에 레버리지가 청산가에 영향을 주지 않는다는 안내가 표시된다", async () => {
      const { user } = renderCalculator();

      await chooseMode(user, "교차");

      expect(field("계좌 잔고")).toBeDefined();
      const leverage = field("레버리지");
      expect(leverage).toBeDefined();
      const notes = visibleTexts(CROSS_LEVERAGE_NOTE);
      expect(notes).toHaveLength(1);
      expect(notes[0].textContent).toBe(CROSS_LEVERAGE_NOTE);
      expect(isAfter(notes[0], leverage)).toBe(true);
      expectNoNaNOrInfinity();
    });
  });

  describe("격리 모드는 진입가 × 수량 ÷ 레버리지를 담보로, 심볼의 유지증거금률로 청산가를 계산한다", () => {
    /**
     * @spec DoD-12
     * @given 마진 모드가 `격리`이고 손절가는 비워 둔다. 표본(심볼·방향·레버리지·진입가·수량 → 담보·mmr → 원값 → 표시): BTCUSDT 롱 10, 100000, 0.1 → 담보 1000, mmr 0.0033 → 90297.9833… → `90,298.00` / BTCUSDT 롱 20, 100000, 0.1 → 담보 500 → 95314.5379… → `95,314.60`(레버리지가 담보에 반영됨) / SOLUSDT 롱 10, 150, 10 → 담보 150, mmr 0.005 → 1350 ÷ 9.95 = 135.6783… → `135.680`(mmr 0.0033을 쓰면 135.4469… → `135.450`이 되므로 심볼의 mmr 사용이 구분된다)
     * @when 표본의 심볼·방향·레버리지·진입가·수량을 키 입력으로 넣는다
     * @then `추정 청산가`가 표본의 기대 문자열과 같게 표시된다
     */
    it("[DoD-12] 격리 모드의 추정 청산가는 진입가 × 수량 ÷ 레버리지 담보와 심볼의 mmr로 계산된다", async () => {
      const samples: Array<{ position: Position; liquidation: string }> = [
        // 담보 1000, mmr 0.0033 → 90297.9833…
        {
          position: { symbol: "BTCUSDT", side: "롱", leverage: "10", entry: "100000", qty: "0.1" },
          liquidation: "90,298.00",
        },
        // 담보 500 → 95314.5379… (레버리지가 담보에 반영됨)
        {
          position: { symbol: "BTCUSDT", side: "롱", leverage: "20", entry: "100000", qty: "0.1" },
          liquidation: "95,314.60",
        },
        // 담보 150, mmr 0.005 → 135.6783… (mmr 0.0033이면 `135.450`)
        {
          position: { symbol: "SOLUSDT", side: "롱", leverage: "10", entry: "150", qty: "10" },
          liquidation: "135.680",
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
        await fillPosition(user, sample.position);

        expect(result("추정 청산가").textContent).toBe(sample.liquidation);
        expectNoNaNOrInfinity();
        unmount();
      }
    });

    /**
     * @spec EC-1
     * @given 마진 모드가 `격리`이고 BTCUSDT 롱 레버리지 10, 진입가 100000, 수량 0.1이 입력돼 `90,298.00`·`9.70%`가 표시돼 있다. 표본: 진입가·수량·레버리지 입력란 각각을 빈 값, `0`으로 바꾼다(음수는 입력 규칙상 입력되지 않으므로 0 이하 표본은 `0`이다)
     * @when 진입가·수량·레버리지 중 하나를 표본 값으로 바꾼다
     * @then `추정 청산가`가 `—`로 표시된다
     * @then `청산가까지 거리`가 `—`로 표시된다
     */
    it("[EC-1] 격리 모드에서 진입가·수량·레버리지 중 하나라도 비었거나 0이면 추정 청산가·거리는 —다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, ISOLATED_BTC_LONG);
      expect(readResults()).toEqual(ISOLATED_BTC_LONG_RESULTS);

      const restore: Record<"진입가" | "수량" | "레버리지", string> = {
        진입가: "100000",
        수량: "0.1",
        레버리지: "10",
      };
      for (const name of ["진입가", "수량", "레버리지"] as const) {
        for (const sample of ["", "0"]) {
          await typeInto(user, name, sample);

          expect(readResults()).toEqual({ liquidation: DASH, distance: DASH });
          expectNoNaNOrInfinity();

          await typeInto(user, name, restore[name]);
          expect(readResults()).toEqual(ISOLATED_BTC_LONG_RESULTS);
        }
      }
    });
  });

  describe("교차 모드는 계좌 잔고를 담보로 계산하고, 레버리지는 결과에 영향을 주지 않는다", () => {
    /**
     * @spec DoD-13
     * @given 마진 모드가 `교차`이고 레버리지는 기본값 10, 손절가는 비워 둔다. 표본(심볼·방향·진입가·수량·계좌 잔고 → mmr → 원값 → 표시): BTCUSDT 롱, 100000, 0.1, 2000 → mmr 0.0033 → 8000 ÷ 0.09967 = 80264.8740… → `80,264.90` / BTCUSDT 숏, 100000, 0.1, 2000 → 12000 ÷ 0.10033 = 119605.3025… → `119,605.30` / SOLUSDT 롱, 150, 10, 300 → mmr 0.005 → 1200 ÷ 9.95 = 120.6030… → `120.610`(mmr 0.0033을 쓰면 120.3973… → `120.400`이 되므로 심볼의 mmr 사용이 구분된다)
     * @when 표본의 심볼·방향·진입가·수량·계좌 잔고를 키 입력으로 넣는다
     * @then `추정 청산가`가 표본의 기대 문자열과 같게 표시된다
     */
    it("[DoD-13] 교차 모드의 추정 청산가는 계좌 잔고 담보와 심볼의 mmr로 계산된다", async () => {
      const samples: Array<{ position: Position; liquidation: string }> = [
        // mmr 0.0033 → 8000 ÷ 0.09967 = 80264.8740…
        {
          position: {
            mode: "교차",
            symbol: "BTCUSDT",
            side: "롱",
            entry: "100000",
            qty: "0.1",
            balance: "2000",
          },
          liquidation: "80,264.90",
        },
        // 12000 ÷ 0.10033 = 119605.3025…
        {
          position: {
            mode: "교차",
            symbol: "BTCUSDT",
            side: "숏",
            entry: "100000",
            qty: "0.1",
            balance: "2000",
          },
          liquidation: "119,605.30",
        },
        // mmr 0.005 → 1200 ÷ 9.95 = 120.6030… (mmr 0.0033이면 `120.400`)
        {
          position: {
            mode: "교차",
            symbol: "SOLUSDT",
            side: "롱",
            entry: "150",
            qty: "10",
            balance: "300",
          },
          liquidation: "120.610",
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, sample.position);

        // 레버리지는 기본값 10 그대로다.
        expect(field("레버리지").value).toBe("10");
        expect(result("추정 청산가").textContent).toBe(sample.liquidation);
        expectNoNaNOrInfinity();
        unmount();
      }
    });

    /**
     * @spec DoD-14 EC-2
     * @given 마진 모드가 `교차`이고 BTCUSDT 롱, 진입가 100000, 수량 0.1, 계좌 잔고 2000이 입력돼 `80,264.90`·`19.73%`가 표시돼 있다. 표본: 레버리지를 `10` → `1` → `50` → 빈 값 순서로 바꾼다
     * @when 레버리지를 표본 값으로 하나씩 바꾼다
     * @then 각 레버리지 값에서 `추정 청산가`는 `80,264.90`으로 그대로다
     * @then 각 레버리지 값에서 `청산가까지 거리`는 `19.73%`로 그대로다
     */
    it("[DoD-14][EC-2] 교차 모드에서 레버리지를 바꿔도 추정 청산가와 거리는 바뀌지 않는다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, CROSS_BTC_LONG);
      expect(readResults()).toEqual(CROSS_BTC_LONG_RESULTS);

      for (const leverage of ["10", "1", "50", ""]) {
        await typeInto(user, "레버리지", leverage);

        expect(field("레버리지").value).toBe(leverage);
        expect(readResults()).toEqual(CROSS_BTC_LONG_RESULTS);
        expectNoNaNOrInfinity();
      }
    });

    /**
     * @spec EC-2
     * @given 마진 모드가 `교차`이고 BTCUSDT 롱, 진입가 100000, 수량 0.1, 계좌 잔고 2000이 입력돼 `80,264.90`·`19.73%`가 표시돼 있다. 표본: 진입가·수량·계좌 잔고 입력란 각각을 빈 값, `0`으로 바꾼다(음수는 입력 규칙상 입력되지 않으므로 0 이하 표본은 `0`이다)
     * @when 진입가·수량·계좌 잔고 중 하나를 표본 값으로 바꾼다
     * @then `추정 청산가`가 `—`로 표시된다
     * @then `청산가까지 거리`가 `—`로 표시된다
     */
    it("[EC-2] 교차 모드에서 진입가·수량·계좌 잔고 중 하나라도 비었거나 0이면 추정 청산가·거리는 —다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, CROSS_BTC_LONG);
      expect(readResults()).toEqual(CROSS_BTC_LONG_RESULTS);

      const restore: Record<"진입가" | "수량" | "계좌 잔고", string> = {
        진입가: "100000",
        수량: "0.1",
        "계좌 잔고": "2000",
      };
      for (const name of ["진입가", "수량", "계좌 잔고"] as const) {
        for (const sample of ["", "0"]) {
          await typeInto(user, name, sample);

          expect(readResults()).toEqual({ liquidation: DASH, distance: DASH });
          expectNoNaNOrInfinity();

          await typeInto(user, name, restore[name]);
          expect(readResults()).toEqual(CROSS_BTC_LONG_RESULTS);
        }
      }
    });
  });

  describe("추정 청산가는 방향별로 틱에 맞춰 심볼 자릿수로, 거리는 틱에 맞춘 청산가 기준으로 손익 색 없이 표시된다", () => {
    /**
     * @spec DoD-16
     * @given 마진 모드가 `격리`이고 손절가는 비워 둔다. 표본(심볼·방향·레버리지·진입가·수량 → 원값 → 틱에 맞춘 값 → 표시, 괄호는 가장 가까운 틱으로 반올림했을 때의 값): BTCUSDT 롱 20, 100000, 0.1 → 95314.5379… → 올림 95314.6 → `95,314.60`(95314.5) / BTCUSDT 숏 10, 100000, 0.1 → 109638.1939… → 내림 109638.1 → `109,638.10`(109638.2) / ETHUSDT 롱 20, 2000, 1 → 1900 ÷ 0.9967 = 1906.2907… → 올림 1906.30 → `1,906.30`(1906.29) / ETHUSDT 숏 10, 3000, 1 → 3300 ÷ 1.0033 = 3289.1458… → 내림 3289.14 → `3,289.14`(3289.15) / SOLUSDT 롱 10, 100, 10 → 900 ÷ 9.95 = 90.4522… → 올림 90.46 → `90.460`(90.45) / SOLUSDT 숏 10, 200, 5 → 1100 ÷ 5.025 = 218.9054… → 내림 218.90 → `218.900`(218.91)
     * @when 표본의 심볼·방향·레버리지·진입가·수량을 키 입력으로 넣는다
     * @then `추정 청산가`가 롱은 틱 올림, 숏은 틱 내림한 값으로 표본의 기대 문자열과 같게 표시된다
     * @then BTCUSDT·ETHUSDT는 소수 2자리, SOLUSDT는 소수 3자리이고 천 단위 구분이 들어간다
     */
    it("[DoD-16] 추정 청산가는 롱은 틱 올림, 숏은 틱 내림한 값을 심볼의 가격 자릿수로 표시한다", async () => {
      // 괄호는 가장 가까운 틱으로 반올림했을 때의 값이다. 모든 표본이 그 값과 달라 방향이 드러난다.
      const samples: Array<{ position: Position; liquidation: string }> = [
        // 95314.5379… → 올림 95314.6 (95314.5)
        {
          position: { symbol: "BTCUSDT", side: "롱", leverage: "20", entry: "100000", qty: "0.1" },
          liquidation: "95,314.60",
        },
        // 109638.1939… → 내림 109638.1 (109638.2)
        {
          position: { symbol: "BTCUSDT", side: "숏", leverage: "10", entry: "100000", qty: "0.1" },
          liquidation: "109,638.10",
        },
        // 1900 ÷ 0.9967 = 1906.2907… → 올림 1906.30 (1906.29)
        {
          position: { symbol: "ETHUSDT", side: "롱", leverage: "20", entry: "2000", qty: "1" },
          liquidation: "1,906.30",
        },
        // 3300 ÷ 1.0033 = 3289.1458… → 내림 3289.14 (3289.15)
        {
          position: { symbol: "ETHUSDT", side: "숏", leverage: "10", entry: "3000", qty: "1" },
          liquidation: "3,289.14",
        },
        // 900 ÷ 9.95 = 90.4522… → 올림 90.46 (90.45), 소수 3자리
        {
          position: { symbol: "SOLUSDT", side: "롱", leverage: "10", entry: "100", qty: "10" },
          liquidation: "90.460",
        },
        // 1100 ÷ 5.025 = 218.9054… → 내림 218.90 (218.91), 소수 3자리
        {
          position: { symbol: "SOLUSDT", side: "숏", leverage: "10", entry: "200", qty: "5" },
          liquidation: "218.900",
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
        await fillPosition(user, sample.position);

        expect(result("추정 청산가").textContent).toBe(sample.liquidation);
        expectNoNaNOrInfinity();
        unmount();
      }
    });

    /**
     * @spec DoD-19
     * @given 손절가는 비워 둔다. 표본(모드·심볼·방향·레버리지·진입가·수량·잔고 → 틱에 맞춘 청산가 → 거리, 괄호는 원값으로 계산했을 때의 표시): 격리 BTCUSDT 롱 10, 100000, 0.1 → 90298.0 → 9.702 → `9.70%` / 격리 BTCUSDT 숏 10, 100000, 0.1 → 109638.1 → 9.6381 → `9.63%` / 교차 BTCUSDT 롱, 100000, 0.1, 잔고 2000 → 80264.9 → 19.7351 → `19.73%` / 격리 SOLUSDT 롱 10, 80, 10 → 원값 72.3618… → 72.37 → 7.63 ÷ 80 × 100 = 9.5375 → `9.53%`(`9.54%`) / 격리 SOLUSDT 숏 10, 150, 10 → 원값 164.1791… → 164.17 → 14.17 ÷ 150 × 100 = 9.4466… → `9.44%`(`9.45%`)
     * @when 표본의 모드·심볼·방향·레버리지·진입가·수량(교차는 계좌 잔고)을 넣는다
     * @then `청산가까지 거리`가 틱에 맞춘 청산가 기준 값으로 표본의 기대 문자열과 같게 표시된다
     */
    it("[DoD-19] 청산가까지 거리는 틱에 맞춘 청산가와 진입가로 계산해 소수 2자리 %로 표시한다", async () => {
      // 괄호는 원값으로 계산했을 때의 표시다. SOLUSDT 두 표본은 그 값과 달라 기준이 드러난다.
      const samples: Array<{ position: Position; distance: string }> = [
        // 격리 → 90298.0 → 9.702
        {
          position: { symbol: "BTCUSDT", side: "롱", leverage: "10", entry: "100000", qty: "0.1" },
          distance: "9.70%",
        },
        // 격리 → 109638.1 → 9.6381
        {
          position: { symbol: "BTCUSDT", side: "숏", leverage: "10", entry: "100000", qty: "0.1" },
          distance: "9.63%",
        },
        // 교차 잔고 2000 → 80264.9 → 19.7351
        {
          position: {
            mode: "교차",
            symbol: "BTCUSDT",
            side: "롱",
            entry: "100000",
            qty: "0.1",
            balance: "2000",
          },
          distance: "19.73%",
        },
        // 격리 → 원값 72.3618… → 72.37 → 9.5375 (`9.54%`)
        {
          position: { symbol: "SOLUSDT", side: "롱", leverage: "10", entry: "80", qty: "10" },
          distance: "9.53%",
        },
        // 격리 → 원값 164.1791… → 164.17 → 9.4466… (`9.45%`)
        {
          position: { symbol: "SOLUSDT", side: "숏", leverage: "10", entry: "150", qty: "10" },
          distance: "9.44%",
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, sample.position);

        expect(result("청산가까지 거리").textContent).toBe(sample.distance);
        expectNoNaNOrInfinity();
        unmount();
      }
    });

    /**
     * @spec DoD-20
     * @given 표본: 첫 화면(결과 `—`), 격리 BTCUSDT 롱 10, 100000, 0.1(`90,298.00`·`9.70%`), 격리 BTCUSDT 숏 10, 100000, 0.1(`109,638.10`·`9.63%`), 교차 BTCUSDT 롱, 100000, 0.1, 잔고 2000(`80,264.90`·`19.73%`), 격리 BTCUSDT 롱 1, 100000, 0.1(`청산 없음`·`—`)
     * @when 표본 상태에서 두 결과를 본다
     * @then `추정 청산가` 결과의 `data-tone`이 `profit`도 `loss`도 아니다
     * @then `청산가까지 거리` 결과의 `data-tone`이 `profit`도 `loss`도 아니다
     */
    it("[DoD-20] 추정 청산가·청산가까지 거리에는 손익 색이 붙지 않는다", async () => {
      const samples: Array<{
        position: Position | null;
        results: { liquidation: string; distance: string };
      }> = [
        { position: null, results: { liquidation: DASH, distance: DASH } },
        {
          position: { side: "롱", leverage: "10", entry: "100000", qty: "0.1" },
          results: { liquidation: "90,298.00", distance: "9.70%" },
        },
        {
          position: { side: "숏", leverage: "10", entry: "100000", qty: "0.1" },
          results: { liquidation: "109,638.10", distance: "9.63%" },
        },
        { position: CROSS_BTC_LONG, results: CROSS_BTC_LONG_RESULTS },
        {
          position: { side: "롱", leverage: "1", entry: "100000", qty: "0.1" },
          results: { liquidation: NO_LIQUIDATION, distance: DASH },
        },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        if (sample.position !== null) {
          await fillPosition(user, sample.position);
        }

        expect(readResults()).toEqual(sample.results);
        expectNoProfitLossTone(result("추정 청산가"));
        expectNoProfitLossTone(result("청산가까지 거리"));
        expectNoNaNOrInfinity();
        unmount();
      }
    });
  });

  describe("롱의 계산 청산가가 0 이하이면 청산 없음으로 표시한다", () => {
    /**
     * @spec EC-4 EC-5
     * @given 손절가는 비워 둔다. 표본(모두 BTCUSDT 롱, 진입가 100000, 수량 0.1, 원값): 격리 레버리지 1 → 담보 10000 → 원값 0 / 교차 계좌 잔고 10000(= 진입가 × 수량) → 원값 0 / 교차 계좌 잔고 15000 → 원값 −5000 ÷ 0.09967 = −50165.54… (0 미만)
     * @when 표본의 모드·레버리지·진입가·수량·계좌 잔고를 넣는다
     * @then `추정 청산가`에 `청산 없음`이 표시된다
     * @then `청산가까지 거리`는 `—`로 표시된다
     */
    it("[EC-4][EC-5] 롱의 청산가 원값이 0 이하이면 추정 청산가는 청산 없음, 거리는 —다", async () => {
      const samples: Position[] = [
        // 격리 레버리지 1 → 담보 10000 → 원값 0
        { side: "롱", leverage: "1", entry: "100000", qty: "0.1" },
        // 교차 잔고 10000(= 진입가 × 수량) → 원값 0
        { mode: "교차", side: "롱", entry: "100000", qty: "0.1", balance: "10000" },
        // 교차 잔고 15000 → 원값 −50165.54… (0 미만)
        { mode: "교차", side: "롱", entry: "100000", qty: "0.1", balance: "15000" },
      ];

      for (const position of samples) {
        const { user, unmount } = renderCalculator();
        await fillPosition(user, position);

        expect(result("추정 청산가").textContent).toBe(NO_LIQUIDATION);
        expect(result("청산가까지 거리").textContent).toBe(DASH);
        expectNoNaNOrInfinity();
        unmount();
      }
    });
  });

  describe("마진 모드를 바꿔도 입력값이 남는다", () => {
    /**
     * @spec EC-10
     * @given 마진 모드가 `격리`이고 심볼 SOLUSDT, 방향 숏, 레버리지 20, 진입가 150, 수량 10, 손절가 155가 입력돼 있다
     * @when 마진 모드를 `교차`로 바꾸고, 이어서 다시 `격리`로 바꾼다
     * @then `교차`로 바꾼 뒤에도 심볼·방향·레버리지·진입가·수량·손절가가 입력한 값 그대로다
     * @then `격리`로 돌아온 뒤에도 심볼·방향·레버리지·진입가·수량·손절가가 입력한 값 그대로다
     */
    it("[EC-10] 마진 모드를 바꿔도 심볼·방향·레버리지·진입가·수량·손절가는 유지된다", async () => {
      const { user } = renderCalculator();
      await fillPosition(user, {
        symbol: "SOLUSDT",
        side: "숏",
        leverage: "20",
        entry: "150",
        qty: "10",
        stop: "155",
      });

      const expectInputsKept = () => {
        expect(screen.getByRole("combobox", { name: "심볼" }).textContent).toContain("SOLUSDT");
        expect(isPressed(toggle("방향", "숏"))).toBe(true);
        expect(isPressed(toggle("방향", "롱"))).toBe(false);
        expect(field("레버리지").value).toBe("20");
        expect(field("진입가").value).toBe("150");
        expect(field("수량").value).toBe("10");
        expect(field("손절가").value).toBe("155");
        expectNoNaNOrInfinity();
      };
      expectInputsKept();

      await chooseMode(user, "교차");
      expect(isPressed(toggle("마진 모드", "교차"))).toBe(true);
      expectInputsKept();

      await chooseMode(user, "격리");
      expect(isPressed(toggle("마진 모드", "격리"))).toBe(true);
      expectInputsKept();
    });

    /**
     * @spec EC-10
     * @given 마진 모드가 `교차`이고 계좌 잔고 2000이 입력돼 있다
     * @when 마진 모드를 `격리`로 바꾸고, 이어서 다시 `교차`로 바꾼다
     * @then 다시 나타난 계좌 잔고 입력란의 값이 `2000`이다
     */
    it("[EC-10] 격리로 갔다가 교차로 돌아오면 이전 계좌 잔고 값이 그대로 있다", async () => {
      const { user } = renderCalculator();
      await chooseMode(user, "교차");
      await typeInto(user, "계좌 잔고", "2000");
      expect(field("계좌 잔고").value).toBe("2000");

      await chooseMode(user, "격리");
      await chooseMode(user, "교차");

      expect(field("계좌 잔고").value).toBe("2000");
      expectNoNaNOrInfinity();
    });
  });

  describe("추정치 고지는 입력과 관계없이 항상 두 카드 아래에 보인다", () => {
    /**
     * @spec DoD-28
     * @given 표본: 첫 화면(입력 없음), 격리 BTCUSDT 롱 10, 100000, 0.1(`90,298.00`), 교차 BTCUSDT 롱, 100000, 0.1, 잔고 2000(`80,264.90`), 격리 BTCUSDT 롱 1, 100000, 0.1(`청산 없음`), 격리에서 진입가 `0`(결과 `—`)
     * @when 표본 상태에서 화면을 본다
     * @then `추정치입니다. 유지증거금률 첫 단계만 쓰고 수수료·유지증거금 공제액·마크가격·펀딩을 반영하지 않습니다. 교차는 계좌에 이 포지션 하나만 있다고 가정합니다. 거래소 표시값과 다를 수 있습니다.`가 표시된다
     * @then 고지는 `청산가 입력`·`청산가 결과` 두 영역 밖에 있고 문서 순서상 두 영역보다 뒤에 있다
     */
    it("[DoD-28] 추정치 고지 문구가 입력과 관계없이 두 카드 아래에 항상 표시된다", async () => {
      const samples: Array<{
        position: Position | null;
        liquidation: string;
      }> = [
        { position: null, liquidation: DASH },
        { position: ISOLATED_BTC_LONG, liquidation: "90,298.00" },
        { position: CROSS_BTC_LONG, liquidation: "80,264.90" },
        {
          position: { side: "롱", leverage: "1", entry: "100000", qty: "0.1" },
          liquidation: NO_LIQUIDATION,
        },
        { position: { ...ISOLATED_BTC_LONG, entry: "0" }, liquidation: DASH },
      ];

      for (const sample of samples) {
        const { user, unmount } = renderCalculator();
        if (sample.position !== null) {
          await fillPosition(user, sample.position);
        }
        expect(result("추정 청산가").textContent).toBe(sample.liquidation);

        const notices = visibleTexts(DISCLAIMER);
        expect(notices).toHaveLength(1);
        const notice = notices[0];
        expect(notice.textContent).toBe(DISCLAIMER);

        const inputRegion = screen.getByRole("region", { name: "청산가 입력" });
        const resultRegion = screen.getByRole("region", { name: "청산가 결과" });
        expect(inputRegion.contains(notice)).toBe(false);
        expect(resultRegion.contains(notice)).toBe(false);
        expect(isAfter(notice, inputRegion)).toBe(true);
        expect(isAfter(notice, resultRegion)).toBe(true);
        expectNoNaNOrInfinity();
        unmount();
      }
    });
  });
});
