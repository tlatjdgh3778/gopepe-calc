import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { PyramidTerminal } from "@/components/pyramid/pyramid-terminal";
import { SYMBOLS_AS_OF } from "@/lib/symbols";

// 골격: 스펙 docs/specs/pyramid-terminal.md (F-6 피라미딩 터미널), 계획 T-8.
// 연결 항목: DoD-8~DoD-21, DoD-31(h1), DoD-32~DoD-36, EC-1~EC-4, EC-6~EC-10, EC-30, EC-33, EC-34.
// 화면을 테스트마다 새로 렌더하고 vitest.setup.ts의 cleanup으로 DOM을 비운다.
// 기대 표시값은 스펙 §3 기준 사례 P1·P2 표의 표시 리터럴이다.
// 빈 결과 `—`는 U+2014, 경고 기호 `⚠`는 U+26A0, 음수 부호 `−`는 U+2212로 정확히 비교한다.
// 접근 이름은 정확 일치로 찾는다(`레버리지`와 `레버리지 슬라이더`를 구별한다).
// 결과는 region(`포지션 요약`, `포지션 경로`, `익절`, `손절`) 범위에서 찾는다.
// mock 경계: console.error의 vi.spyOn(관찰만)만 쓴다. 차트는 mock 없이 실제로 렌더하고
// 선 렌더는 판정하지 않는다(차트 데이터는 T-7, 실제 선·범례·툴팁은 E2E T-12).
// 각 EC case는 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않음을 함께 본다.
// 심볼 데이터(lib/symbols.ts): ETHUSDT maxLeverage 150·MMR 0.0033·riskLimitValue 300000,
// SOLUSDT maxLeverage 100·MMR 0.005·riskLimitValue 50000, BTCUSDT maxLeverage 150.

// 기호는 코드 포인트로 정확히 비교한다.
const DASH = "—"; // —
const WARN = "⚠"; // ⚠

const ZERO_WARNING = `${WARN} 0보다 커야 합니다.`;
const FEE_WARNING = `${WARN} 수수료율은 1% 미만이어야 합니다.`;
const INSTANT_WARNING = `${WARN} 진입 즉시 청산되는 포지션입니다.`;
const STOP_BEFORE_LIQUIDATION_WARNING = `${WARN} 손절 전에 청산될 수 있습니다. 손절가를 확인하세요.`;
const TIER_WARNING_ETH = `${WARN} 포지션 가치가 유지증거금률 첫 단계 한도(300,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`;
const NO_LIQUIDATION = "청산 없음";

type User = ReturnType<typeof userEvent.setup>;
type SymbolName = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
type RegionName = "포지션 설정" | "추가 진입" | "포지션 요약" | "포지션 경로" | "익절" | "손절";

const RESULT_REGIONS: readonly RegionName[] = ["포지션 요약", "포지션 경로", "익절", "손절"];

const SUMMARY_LABELS = [
  "평균 진입가",
  "추정 청산가",
  "실효 레버리지",
  "총 포지션 수량",
  "최종 진입 시 포지션 가치",
  "실제 투입 원금",
  "미실현 수익 포함 총 자산",
  "수수료 포함 본전가",
  "누적 진입 수수료",
] as const;
const TAKE_PROFIT_LABELS = ["예상 순수익", "ROE", "추가 진입 효과"] as const;
const TAKE_PROFIT_BAR_LABELS = ["추가 진입 없이", "피라미딩 적용"] as const;
const STOP_LOSS_LABELS = ["손절 시 예상 손익", "원금 대비", "손익비", "청산가까지 거리"] as const;

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
  render(<PyramidTerminal />);
  return { user };
}

function region(name: RegionName): HTMLElement {
  return screen.getByRole("region", { name });
}

/** 접근 이름(정확 일치)으로 찾은 입력란. */
function textbox(name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function slider(): HTMLInputElement {
  return screen.getByRole("slider", { name: "레버리지 슬라이더" }) as HTMLInputElement;
}

function sliderValue(): string | null {
  return slider().getAttribute("aria-valuenow");
}

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

/** region 안의 결과 값(`dd`, 이름은 `dt`) 표시 문자열. */
function result(regionName: RegionName, label: string): string | null {
  return within(region(regionName)).getByRole("definition", { name: label }).textContent;
}

function queryResult(regionName: RegionName, label: string): HTMLElement | null {
  return within(region(regionName)).queryByRole("definition", { name: label });
}

/** 기존 값을 지우고 새 값을 넣는다. 짧은 값은 한 글자씩, 긴 값은 붙여 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, input: HTMLInputElement, value: string) {
  await user.clear(input);
  if (value === "") return;
  if (value.length > 20) {
    await user.paste(value);
  } else {
    await user.type(input, value);
  }
}

async function setField(user: User, name: string, value: string) {
  await typeInto(user, textbox(name), value);
}

async function chooseSymbol(user: User, symbol: SymbolName) {
  await user.click(screen.getByRole("combobox", { name: "심볼" }));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: symbol }));
}

function sideButton(name: "롱" | "숏"): HTMLElement {
  return within(screen.getByRole("group", { name: "방향" })).getByRole("button", { name });
}

async function openFeeSettings(user: User) {
  const toggle = button("수수료 설정");
  if (toggle.getAttribute("aria-expanded") !== "true") {
    await user.click(toggle);
  }
}

async function setFee(user: User, value: string) {
  await openFeeSettings(user);
  await setField(user, "거래 수수료율", value);
}

function pathTable(): HTMLElement {
  return within(region("포지션 경로")).getByRole("table");
}

function bodyRows(): HTMLElement[] {
  const body = within(pathTable()).getAllByRole("rowgroup")[1];
  return within(body).queryAllByRole("row");
}

/** 본문 행의 진입 단계 칸과 나머지 7칸 표시 문자열. */
function readRow(row: HTMLElement): { name: string | null; cells: (string | null)[] } {
  return {
    name: within(row).getByRole("rowheader").textContent,
    cells: within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  };
}

function rowCell(row: HTMLElement, index: number): HTMLElement {
  return within(row).getAllByRole("cell")[index];
}

/** 결과 영역 4곳의 표시 문자열을 이어 붙인 값. 입력 전후 비교에 쓴다. */
/**
 * 결과 영역 4곳에서 사용자에게 보이는 값(결과 항목 값·경로 표 칸)만 이어 붙인 값. 입력 전후 비교에 쓴다.
 * 차트의 `<style>` 등 화면에 보이지 않는 텍스트는 넣지 않는다.
 */
function resultsText(): string {
  return RESULT_REGIONS.map((name) => {
    const scope = within(region(name));
    return [
      ...scope.queryAllByRole("definition"),
      ...scope.queryAllByRole("rowheader"),
      ...scope.queryAllByRole("cell"),
    ]
      .map((el) => el.textContent ?? "")
      .join("|");
  }).join("\n");
}

/** 심볼 선택란에 표시된 선택 값(장식 아이콘 제외). */
function selectedSymbol(): string | null {
  const combobox = screen.getByRole("combobox", { name: "심볼" });
  return combobox.querySelector('[data-slot="select-value"]')?.textContent ?? null;
}

/** 포지션 요약·포지션 경로·익절·손절 결과가 모두 `—`다(경로 표는 본문 행이 없다). */
function expectAllResultsEmpty() {
  const read = (regionName: RegionName, labels: readonly string[]) =>
    Object.fromEntries(labels.map((label) => [label, result(regionName, label)]));
  const allEmpty = (labels: readonly string[]) =>
    Object.fromEntries(labels.map((label) => [label, DASH]));

  expect(read("포지션 요약", SUMMARY_LABELS)).toEqual(allEmpty(SUMMARY_LABELS));
  expect(bodyRows()).toHaveLength(0);
  expect(read("익절", TAKE_PROFIT_LABELS)).toEqual(allEmpty(TAKE_PROFIT_LABELS));
  // 비교 막대 행은 결과가 없으면 그리지 않는다. 그려져 있다면 값이 `—`여야 한다.
  const barTexts = TAKE_PROFIT_BAR_LABELS.map((label) => queryResult("익절", label))
    .filter((el): el is HTMLElement => el !== null)
    .map((el) => el.textContent);
  expect(barTexts.filter((text) => text !== DASH)).toEqual([]);
  expect(read("손절", STOP_LOSS_LABELS)).toEqual(allEmpty(STOP_LOSS_LABELS));
}

/** 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않았다. */
function expectCleanScreen() {
  const text = document.body.textContent ?? "";
  expect(text).not.toContain("NaN");
  expect(text).not.toContain("Infinity");
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

/** 입력란에 걸린 경고 문구(`aria-describedby`). 없으면 null. */
function describedWarning(input: HTMLElement): string | null {
  const id = input.getAttribute("aria-describedby");
  if (id === null) return null;
  return document.getElementById(id)?.textContent ?? null;
}

function expectInDocumentOrder(elements: readonly HTMLElement[]) {
  for (let i = 1; i < elements.length; i += 1) {
    const relation = elements[i - 1].compareDocumentPosition(elements[i]);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
}

/** 기준 사례 P2를 입력한다(수수료율 0.055 그대로). */
async function inputP2(user: User) {
  await chooseSymbol(user, "SOLUSDT");
  await user.click(sideButton("숏"));
  await setField(user, "최초 진입가", "150");
  await setField(user, "초기 증거금", "500");
  await setField(user, "레버리지", "10");
  await setField(user, "1차 추가 진입가", "140");
  await setField(user, "1차 재투입 비율", "50");
  await setField(user, "2차 추가 진입가", "130");
  await setField(user, "2차 재투입 비율", "100");
  await setField(user, "익절가", "120");
  await setField(user, "손절가", "140");
}

describe("피라미딩 터미널 — 입력하는 즉시 포지션 요약과 단계별 경로를 본다", () => {
  describe("초기 상태", () => {
    /**
     * @spec DoD-8
     * @given 화면을 처음 연다
     * @when 입력란 값을 읽는다
     * @then 심볼은 ETHUSDT, 방향은 롱이 선택되어 있다
     * @then 최초 진입가 1900, 초기 증거금 1000, 레버리지 입력란 5, 레버리지 슬라이더 5다
     * @then 거래 수수료율은 0.055다
     * @then 추가 진입 단계는 2개이며 1차 (2100, 100), 2차 (2300, 100)이다
     * @then 익절가 2500, 손절가 2000이다
     */
    it("[DoD-8] 처음 열면 입력이 기본값(ETHUSDT·롱·1900·1000·5×·0.055·단계 2개·2500·2000)이다", async () => {
      const { user } = renderTerminal();

      expect(selectedSymbol()).toBe("ETHUSDT");
      expect(sideButton("롱").getAttribute("aria-pressed")).toBe("true");
      expect(sideButton("숏").getAttribute("aria-pressed")).toBe("false");
      expect(textbox("최초 진입가").value).toBe("1900");
      expect(textbox("초기 증거금").value).toBe("1000");
      expect(textbox("레버리지").value).toBe("5");
      expect(sliderValue()).toBe("5");
      await openFeeSettings(user);
      expect(textbox("거래 수수료율").value).toBe("0.055");
      expect(textbox("1차 추가 진입가").value).toBe("2100");
      expect(textbox("1차 재투입 비율").value).toBe("100");
      expect(textbox("2차 추가 진입가").value).toBe("2300");
      expect(textbox("2차 재투입 비율").value).toBe("100");
      expect(screen.queryByRole("textbox", { name: "3차 추가 진입가" })).toBeNull();
      expect(textbox("익절가").value).toBe("2500");
      expect(textbox("손절가").value).toBe("2000");
    });

    /**
     * @spec DoD-9 DoD-17 DoD-18 DoD-19 DoD-20 DoD-24 DoD-25 DoD-26
     * @given 화면을 처음 연다(기준 사례 P1)
     * @when 포지션 요약·포지션 경로·익절·손절 영역을 읽는다
     * @then 평균 진입가 2,066.17(틱에 맞추지 않음), 추정 청산가 1,895.20(원값 1895.1973…의 롱 틱 올림), 실효 레버리지 12.81×다
     * @then 평균 진입가 보조 문구는 `최초 진입 대비 +8.74% 이동`, 실효 레버리지 보조 문구는 `최초 5× → 12.81× 노출`이다
     * @then 총 포지션 수량 5.57 ETH, 최종 진입 시 포지션 가치 12,819.54 USDT, 실제 투입 원금 1,000.00 USDT다
     * @then 미실현 수익 포함 총 자산 2,296.92 USDT, 수수료 포함 본전가 2,068.45(틱에 맞추지 않음), 누적 진입 수수료 6.33 USDT다
     * @then 예상 순수익 +2,404.00 USDT, ROE +240.40%, 추가 진입 없이 +1,572.57 USDT, 추가 진입 효과 +831.42 USDT · 1.52배다
     * @then 손절 시 예상 손익 −381.32 USDT, 원금 대비 −38.13%, 손익비 1 : 6.30, 청산가까지 거리 17.60%(틱 청산가 기준)다
     * @then 리스크 문구의 역행 %는 10.06%다
     * @then 경로 표 최초 진입 행: 진입가 1,900.00 / 누적 평단 1,900.00 / 청산가 1,526.93 / 재투입 — / 시점 수익 — / 투입 증거금 1,000.00 USDT / 추가 수량 2.63 ETH
     * @then 경로 표 1차 추가 진입 행: 진입가 2,100.00 / 누적 평단 1,964.51 / 청산가 1,714.78 / 재투입 100% / 시점 수익 +526.31 USDT / 투입 증거금 526.31 USDT / 추가 수량 1.25 ETH
     * @then 경로 표 2차 추가 진입 행: 진입가 2,300.00 / 누적 평단 2,066.17 / 청산가 1,895.20 / 재투입 100% / 시점 수익 +1,303.25 USDT / 투입 증거금 776.94 USDT / 추가 수량 1.68 ETH
     * @then 경로 표의 시점 수익은 손익이므로 부호를 표시하고, 투입 증거금은 부호 없이 표시한다
     */
    it("[DoD-9][DoD-17][DoD-18][DoD-19][DoD-20][DoD-24][DoD-25][DoD-26] 처음 연 화면의 결과가 기준 사례 P1의 표시값과 같다", async () => {
      renderTerminal();

      expect(result("포지션 요약", "평균 진입가")).toBe("2,066.17");
      expect(result("포지션 요약", "추정 청산가")).toBe("1,895.20");
      expect(result("포지션 요약", "실효 레버리지")).toBe("12.81×");
      const summary = within(region("포지션 요약"));
      expect(summary.getByText("최초 진입 대비 +8.74% 이동")).toBeTruthy();
      expect(summary.getByText("최초 5× → 12.81× 노출")).toBeTruthy();
      expect(result("포지션 요약", "총 포지션 수량")).toBe("5.57 ETH");
      expect(result("포지션 요약", "최종 진입 시 포지션 가치")).toBe("12,819.54 USDT");
      expect(result("포지션 요약", "실제 투입 원금")).toBe("1,000.00 USDT");
      expect(result("포지션 요약", "미실현 수익 포함 총 자산")).toBe("2,296.92 USDT");
      expect(result("포지션 요약", "수수료 포함 본전가")).toBe("2,068.45");
      expect(result("포지션 요약", "누적 진입 수수료")).toBe("6.33 USDT");

      expect(result("익절", "예상 순수익")).toBe("+2,404.00 USDT");
      expect(result("익절", "ROE")).toBe("+240.40%");
      expect(result("익절", "추가 진입 없이")).toBe("+1,572.57 USDT");
      expect(result("익절", "추가 진입 효과")).toBe("+831.42 USDT · 1.52배");

      expect(result("손절", "손절 시 예상 손익")).toBe("−381.32 USDT");
      expect(result("손절", "원금 대비")).toBe("−38.13%");
      expect(result("손절", "손익비")).toBe("1 : 6.30");
      expect(result("손절", "청산가까지 거리")).toBe("17.60%");

      expect(
        summary.getByText("마지막 진입가에서 10.06% 역행하면 수수료 포함 전체 수익이 사라집니다."),
      ).toBeTruthy();

      // 칸 순서: 진입가 | 누적 평단 | 청산가 | 재투입 | 시점 수익 | 투입 증거금 | 추가 수량(행 머리글 제외).
      const rows = bodyRows().map(readRow);
      expect(rows).toEqual([
        {
          name: "최초 진입",
          cells: ["1,900.00", "1,900.00", "1,526.93", DASH, DASH, "1,000.00 USDT", "2.63 ETH"],
        },
        {
          name: "1차 추가 진입",
          cells: [
            "2,100.00",
            "1,964.51",
            "1,714.78",
            "100%",
            "+526.31 USDT",
            "526.31 USDT",
            "1.25 ETH",
          ],
        },
        {
          name: "2차 추가 진입",
          cells: [
            "2,300.00",
            "2,066.17",
            "1,895.20",
            "100%",
            "+1,303.25 USDT",
            "776.94 USDT",
            "1.68 ETH",
          ],
        },
      ]);
      // 시점 수익은 부호가 있고 투입 증거금은 부호가 없다.
      const stepCells = rows.slice(1).map((row) => ({ pnl: row.cells[4], margin: row.cells[5] }));
      expect(stepCells.map(({ pnl }) => pnl?.startsWith("+"))).toEqual([true, true]);
      expect(
        stepCells.map(({ margin }) => margin?.startsWith("+") || margin?.startsWith("−")),
      ).toEqual([false, false]);
    });
  });

  describe("기준 사례 P2 입력", () => {
    /**
     * @spec DoD-10 DoD-17 DoD-18 DoD-19 DoD-24 DoD-25 DoD-26
     * @given 심볼 SOLUSDT, 방향 숏, 최초 진입가 150, 초기 증거금 500, 레버리지 10, 단계 (140, 50)·(130, 100), 익절가 120, 손절가 140을 입력한다(수수료율 0.055 그대로)
     * @when 포지션 요약·포지션 경로·익절·손절 영역을 읽는다
     * @then 평균 진입가 138.461(틱에 맞추지 않음), 추정 청산가 142.970(원값 142.9764…의 숏 틱 내림), 실효 레버리지 24.14×다
     * @then 평균 진입가 보조 문구는 `최초 진입 대비 −7.69% 이동`, 실효 레버리지 보조 문구는 `최초 10× → 24.14× 노출`이다
     * @then 총 포지션 수량 92.8 SOL, 최종 진입 시 포지션 가치 12,071.42 USDT, 실제 투입 원금 500.00 USDT다
     * @then 미실현 수익 포함 총 자산 1,278.64 USDT, 수수료 포함 본전가 138.309(틱에 맞추지 않음), 누적 진입 수수료 7.07 USDT다
     * @then 예상 순수익 +1,701.08 USDT, ROE +340.21%, 추가 진입 없이 +995.05 USDT, 추가 진입 효과 +706.03 USDT · 1.70배다
     * @then 손절 시 예상 손익 −157.07 USDT, 원금 대비 −31.41%, 손익비 1 : 10.82, 청산가까지 거리 9.97%(틱 청산가 기준)다
     * @then 리스크 문구의 역행 %는 6.39%다
     * @then 경로 표 청산가 칸은 최초 164.000, 1차 157.460, 2차 142.970이다(원값 164.0072…·157.4660…·142.9764…의 숏 틱 0.01 내림, priceScale 3. 올림이면 164.010·157.470·142.980)
     */
    it("[DoD-10][DoD-17][DoD-18][DoD-19][DoD-24][DoD-25][DoD-26] 기준 사례 P2를 입력하면 결과가 P2의 표시값과 같다", async () => {
      const { user } = renderTerminal();
      await inputP2(user);

      expect(result("포지션 요약", "평균 진입가")).toBe("138.461");
      expect(result("포지션 요약", "추정 청산가")).toBe("142.970");
      expect(result("포지션 요약", "실효 레버리지")).toBe("24.14×");
      const summary = within(region("포지션 요약"));
      expect(summary.getByText("최초 진입 대비 −7.69% 이동")).toBeTruthy();
      expect(summary.getByText("최초 10× → 24.14× 노출")).toBeTruthy();
      expect(result("포지션 요약", "총 포지션 수량")).toBe("92.8 SOL");
      expect(result("포지션 요약", "최종 진입 시 포지션 가치")).toBe("12,071.42 USDT");
      expect(result("포지션 요약", "실제 투입 원금")).toBe("500.00 USDT");
      expect(result("포지션 요약", "미실현 수익 포함 총 자산")).toBe("1,278.64 USDT");
      expect(result("포지션 요약", "수수료 포함 본전가")).toBe("138.309");
      expect(result("포지션 요약", "누적 진입 수수료")).toBe("7.07 USDT");

      expect(result("익절", "예상 순수익")).toBe("+1,701.08 USDT");
      expect(result("익절", "ROE")).toBe("+340.21%");
      expect(result("익절", "추가 진입 없이")).toBe("+995.05 USDT");
      expect(result("익절", "추가 진입 효과")).toBe("+706.03 USDT · 1.70배");

      expect(result("손절", "손절 시 예상 손익")).toBe("−157.07 USDT");
      expect(result("손절", "원금 대비")).toBe("−31.41%");
      expect(result("손절", "손익비")).toBe("1 : 10.82");
      expect(result("손절", "청산가까지 거리")).toBe("9.97%");

      expect(
        summary.getByText("마지막 진입가에서 6.39% 역행하면 수수료 포함 전체 수익이 사라집니다."),
      ).toBeTruthy();

      expect(bodyRows().map((row) => readRow(row).cells[2])).toEqual([
        "164.000",
        "157.460",
        "142.970",
      ]);
    });
  });

  describe("입력 즉시 갱신", () => {
    /**
     * @spec DoD-11
     * @given 처음 연 화면(P1)에서 입력 하나씩을 바꾼다 — 표본: 심볼, 방향, 최초 진입가, 초기 증거금, 레버리지 입력란, 레버리지 슬라이더, 거래 수수료율, 1차 추가 진입가, 1차 재투입 비율, 익절가, 손절가
     * @when 각 입력을 바꾼 직후(계산 버튼을 누르지 않고) 결과를 읽는다
     * @then 화면에 계산 버튼이 없다
     * @then 표본마다 그 입력에 걸린 결과가 바꾸기 전 P1 표시값과 달라진다
     */
    it("[DoD-11] 어느 입력을 바꿔도 계산 버튼 없이 입력할 때마다 결과가 갱신된다", async () => {
      const samples: { name: string; change: (user: User) => Promise<void> }[] = [
        { name: "심볼", change: (user) => chooseSymbol(user, "SOLUSDT") },
        { name: "방향", change: (user) => user.click(sideButton("숏")) },
        { name: "최초 진입가", change: (user) => setField(user, "최초 진입가", "1800") },
        { name: "초기 증거금", change: (user) => setField(user, "초기 증거금", "1200") },
        { name: "레버리지 입력란", change: (user) => setField(user, "레버리지", "6") },
        {
          name: "레버리지 슬라이더",
          change: async (user) => {
            slider().focus();
            await user.keyboard("{ArrowRight}");
          },
        },
        { name: "거래 수수료율", change: (user) => setFee(user, "0.1") },
        { name: "1차 추가 진입가", change: (user) => setField(user, "1차 추가 진입가", "2200") },
        { name: "1차 재투입 비율", change: (user) => setField(user, "1차 재투입 비율", "50") },
        { name: "익절가", change: (user) => setField(user, "익절가", "2600") },
        { name: "손절가", change: (user) => setField(user, "손절가", "1950") },
      ];

      const unchanged: string[] = [];
      for (const sample of samples) {
        const { user } = renderTerminal();
        // 계산 버튼이 없다(`계산 기준`은 설명 다이얼로그 버튼이다).
        const buttonNames = screen.getAllByRole("button").map((el) => el.textContent?.trim() ?? "");
        expect(buttonNames.filter((name) => /^계산(하기)?$/.test(name))).toEqual([]);

        const before = resultsText();
        await sample.change(user);
        if (resultsText() === before) unchanged.push(sample.name);
        cleanup();
      }
      // 표본마다 계산 버튼 없이 결과가 바뀌었다.
      expect(unchanged).toEqual([]);
    });
  });

  describe("레버리지 슬라이더와 입력란", () => {
    /**
     * @spec DoD-12
     * @given 처음 연 화면에서 레버리지 슬라이더(role slider)에 포커스를 둔다
     * @when 키보드로 슬라이더 값을 1 올린다
     * @then 슬라이더 값은 6이다
     * @then 레버리지 입력란 값도 6으로 따라 바뀐다
     */
    it("[DoD-12] 슬라이더를 키보드로 조작하면 레버리지 입력란이 따라 바뀐다", async () => {
      const { user } = renderTerminal();

      slider().focus();
      await user.keyboard("{ArrowRight}");

      expect(sliderValue()).toBe("6");
      expect(textbox("레버리지").value).toBe("6");
    });

    /**
     * @spec DoD-12
     * @given 처음 연 화면이다
     * @when 레버리지 입력란을 지우고 10을 입력한다
     * @then 레버리지 슬라이더 값이 10으로 따라 바뀐다
     */
    it("[DoD-12] 레버리지 입력란을 바꾸면 슬라이더가 따라 바뀐다", async () => {
      const { user } = renderTerminal();

      await setField(user, "레버리지", "10");

      expect(sliderValue()).toBe("10");
    });

    /**
     * @spec DoD-12
     * @given 심볼 표본을 하나씩 선택한다 — 표본: ETHUSDT(maxLeverage 150), SOLUSDT(maxLeverage 100)
     * @when 레버리지 슬라이더의 범위와 단위를 읽는다
     * @then 슬라이더 최솟값은 1이다
     * @then 슬라이더 최댓값은 선택 심볼의 maxLeverage다
     * @then 슬라이더 단위는 1이다(키보드 한 단계에 1씩 바뀐다)
     */
    it("[DoD-12] 슬라이더 범위는 1~선택 심볼의 maxLeverage, 단위는 1이다", async () => {
      const samples: { symbol: SymbolName; max: string }[] = [
        { symbol: "ETHUSDT", max: "150" },
        { symbol: "SOLUSDT", max: "100" },
      ];

      for (const sample of samples) {
        const { user } = renderTerminal();
        if (sample.symbol !== "ETHUSDT") await chooseSymbol(user, sample.symbol);

        const thumb = slider();
        expect(thumb.getAttribute("min")).toBe("1");
        expect(thumb.getAttribute("max")).toBe(sample.max);
        expect(thumb.getAttribute("step")).toBe("1");

        // 키보드 한 단계에 1씩 바뀐다.
        const start = Number(sliderValue());
        thumb.focus();
        await user.keyboard("{ArrowRight}");
        expect(Number(sliderValue())).toBe(start + 1);
        await user.keyboard("{ArrowLeft}");
        expect(Number(sliderValue())).toBe(start);
        cleanup();
      }
    });
  });

  describe("심볼 변경", () => {
    /**
     * @spec DoD-13
     * @given ETHUSDT에서 레버리지를 SOLUSDT의 maxLeverage(100)를 넘는 값(예: 120)으로 두고 가격·증거금·단계·익절가·손절가를 기본값에서 바꿔 둔다
     * @when 열린 심볼 목록에서 SOLUSDT를 선택한다
     * @then 레버리지 입력란과 슬라이더가 100으로 바뀐다
     * @then 레버리지 관련 경고가 표시되지 않는다
     * @then 최초 진입가·초기 증거금·단계 가격·단계 재투입·익절가·손절가 입력값은 바꾸기 전 그대로다
     */
    it("[DoD-13] 새 심볼의 maxLeverage를 넘는 레버리지는 경고 없이 maxLeverage로 바뀌고 나머지 입력은 남는다", async () => {
      const { user } = renderTerminal();
      await setField(user, "레버리지", "120");
      await setField(user, "최초 진입가", "1800");
      await setField(user, "초기 증거금", "1200");
      await setField(user, "1차 추가 진입가", "2200");
      await setField(user, "1차 재투입 비율", "50");
      await setField(user, "2차 추가 진입가", "2400");
      await setField(user, "2차 재투입 비율", "80");
      await setField(user, "익절가", "2600");
      await setField(user, "손절가", "1950");

      await chooseSymbol(user, "SOLUSDT");

      expect(textbox("레버리지").value).toBe("100");
      expect(sliderValue()).toBe("100");
      expect(within(region("포지션 설정")).queryByText(new RegExp(WARN))).toBeNull();
      expect(describedWarning(textbox("레버리지"))).toBeNull();
      expect(textbox("최초 진입가").value).toBe("1800");
      expect(textbox("초기 증거금").value).toBe("1200");
      expect(textbox("1차 추가 진입가").value).toBe("2200");
      expect(textbox("1차 재투입 비율").value).toBe("50");
      expect(textbox("2차 추가 진입가").value).toBe("2400");
      expect(textbox("2차 재투입 비율").value).toBe("80");
      expect(textbox("익절가").value).toBe("2600");
      expect(textbox("손절가").value).toBe("1950");
    });

    /**
     * @spec DoD-14
     * @given 처음 연 화면에서 `수수료 설정` 영역을 펼친다
     * @when 입력란 목록을 읽는다
     * @then 유지증거금률 입력란이 없다
     */
    it("[DoD-14] 유지증거금률 입력란이 없다", async () => {
      const { user } = renderTerminal();
      await openFeeSettings(user);

      expect(screen.queryByRole("textbox", { name: /유지증거금/ })).toBeNull();
      expect(screen.queryByRole("spinbutton", { name: /유지증거금/ })).toBeNull();
      expect(screen.queryByLabelText(/유지증거금/)).toBeNull();
    });

    /**
     * @spec DoD-14 DoD-19
     * @given 처음 연 화면(P1)에서 다른 입력은 그대로 둔다
     * @when 심볼만 SOLUSDT로 바꾼다
     * @then 레버리지는 5 그대로다(SOLUSDT maxLeverage 100 이하)
     * @then 포지션 요약의 추정 청산가는 `1,898.440`이다(SOLUSDT maintenanceTier.mmr 0.005로 계산한 원값 1898.4371…을 틱 0.01로 롱 올림, priceScale 3)
     */
    it("[DoD-14] 심볼만 바꾸면 청산가가 그 심볼의 MMR로 계산된다", async () => {
      const { user } = renderTerminal();

      await chooseSymbol(user, "SOLUSDT");

      expect(textbox("레버리지").value).toBe("5");
      expect(result("포지션 요약", "추정 청산가")).toBe("1,898.440");
    });
  });

  describe("수수료 설정", () => {
    /**
     * @spec DoD-15
     * @given 화면을 처음 연다
     * @when `수수료 설정` 영역을 읽은 뒤 펼친다
     * @then 처음에는 `수수료 설정` 영역이 접혀 있다
     * @then 펼치면 그 영역 안에 `거래 수수료율` 입력란이 보인다
     * @then 거래 수수료율 입력란의 단위는 %다
     */
    it("[DoD-15] 거래 수수료율 입력란(%)은 처음에 접혀 있는 `수수료 설정` 영역 안에 있다", async () => {
      const { user } = renderTerminal();

      const toggle = button("수수료 설정");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("textbox", { name: "거래 수수료율" })).toBeNull();

      await user.click(toggle);

      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const feeGroup = screen.getByRole("group", { name: "수수료 설정" });
      expect(within(feeGroup).getByRole("textbox", { name: "거래 수수료율" })).toBeTruthy();
      expect(within(feeGroup).getByText("%")).toBeTruthy();
    });
  });

  describe("초기화", () => {
    /**
     * @spec DoD-16 DoD-23
     * @given 목표 수익률에 50을 입력하고, 심볼·방향·최초 진입가·초기 증거금·레버리지·거래 수수료율·단계(추가·삭제·값 변경)·익절가·손절가를 모두 기본값에서 바꿔 둔다
     * @when `초기화` 버튼을 누른다
     * @then 모든 입력이 DoD-8의 값(ETHUSDT·롱·1900·1000·5·0.055·(2100, 100)·(2300, 100)·2500·2000)으로 돌아간다
     * @then 추가 진입 단계는 다시 2개다
     * @then 목표 수익률 입력란은 "240.40"이다
     */
    it("[DoD-16][DoD-23] `↻ 초기화`를 누르면 모든 입력이 DoD-8의 값으로 돌아가고 목표 수익률은 240.40으로 다시 채워진다", async () => {
      const { user } = renderTerminal();
      await setField(user, "목표 수익률", "50");
      await chooseSymbol(user, "SOLUSDT");
      await user.click(sideButton("숏"));
      await setField(user, "최초 진입가", "150");
      await setField(user, "초기 증거금", "500");
      await setField(user, "레버리지", "10");
      await setFee(user, "0.1");
      await user.click(button("추가 진입 단계"));
      await user.click(button("1차 추가 진입 삭제"));
      await setField(user, "1차 추가 진입가", "140");
      await setField(user, "1차 재투입 비율", "50");
      await setField(user, "익절가", "120");
      await setField(user, "손절가", "140");

      await user.click(button("초기화"));

      expect(selectedSymbol()).toBe("ETHUSDT");
      expect(sideButton("롱").getAttribute("aria-pressed")).toBe("true");
      expect(sideButton("숏").getAttribute("aria-pressed")).toBe("false");
      expect(textbox("최초 진입가").value).toBe("1900");
      expect(textbox("초기 증거금").value).toBe("1000");
      expect(textbox("레버리지").value).toBe("5");
      expect(sliderValue()).toBe("5");
      await openFeeSettings(user);
      expect(textbox("거래 수수료율").value).toBe("0.055");
      expect(textbox("1차 추가 진입가").value).toBe("2100");
      expect(textbox("1차 재투입 비율").value).toBe("100");
      expect(textbox("2차 추가 진입가").value).toBe("2300");
      expect(textbox("2차 재투입 비율").value).toBe("100");
      expect(textbox("익절가").value).toBe("2500");
      expect(textbox("손절가").value).toBe("2000");
      const stepCards = within(region("추가 진입")).getAllByRole("group");
      expect(stepCards).toHaveLength(2);
      expect(screen.queryByRole("textbox", { name: "3차 추가 진입가" })).toBeNull();
      expect(textbox("목표 수익률").value).toBe("240.40");
    });
  });

  describe("손익 표시 색", () => {
    /**
     * @spec DoD-18
     * @given 결과 표본을 하나씩 본다 — 표본: P1(처음 연 화면), P2(DoD-10 입력). 각 표본에서 익절 예상 순수익과 경로 표 시점 수익은 수익, 손절 시 예상 손익은 손실이다
     * @when 익절 예상 순수익·경로 표 시점 수익·손절 시 예상 손익의 표시를 본다
     * @then 익절 예상 순수익·경로 표 시점 수익(수익 값)은 수익 색이다
     * @then 손절 시 예상 손익(손실 값)은 손실 색이다
     */
    it("[DoD-18] 수익 값은 수익 색, 손실 값은 손실 색으로 표시된다", async () => {
      const samples: { name: string; setup: (user: User) => Promise<void> }[] = [
        { name: "P1", setup: async () => {} },
        { name: "P2", setup: inputP2 },
      ];

      for (const sample of samples) {
        const { user } = renderTerminal();
        await sample.setup(user);

        const profitValues = [
          within(region("익절")).getByRole("definition", { name: "예상 순수익" }),
          ...bodyRows()
            .slice(1)
            .map((row) => rowCell(row, 4)),
        ];
        for (const el of profitValues) {
          expect(el.getAttribute("data-tone")).toBe("profit");
          expect(el.classList.contains("text-profit")).toBe(true);
        }
        const loss = within(region("손절")).getByRole("definition", { name: "손절 시 예상 손익" });
        expect(loss.getAttribute("data-tone")).toBe("loss");
        expect(loss.classList.contains("text-loss")).toBe(true);
        cleanup();
      }
    });
  });

  describe("포지션 경로", () => {
    /**
     * @spec DoD-20
     * @given 화면을 처음 연다(P1)
     * @when 포지션 경로 영역의 표를 읽는다
     * @then 열 머리글은 순서대로 `진입 단계 | 진입가 | 누적 평단 | 청산가 | 재투입 | 시점 수익 | 투입 증거금 | 추가 수량`다
     * @then 본문 행은 3개다(최초 진입 + 단계 2개)
     * @then 첫 행은 최초 진입이며 재투입·시점 수익 칸은 `—`, 투입 증거금은 초기 증거금이다
     * @then 둘째·셋째 행의 진입 단계 칸은 `1차 추가 진입`·`2차 추가 진입`이다
     * @then (행별 숫자 칸 표시값은 DoD-9 case에서 판정한다)
     */
    it("[DoD-20] 경로 표는 8열이고 첫 행은 최초 진입, 이후 단계마다 `N차 추가 진입` 행이다", async () => {
      renderTerminal();

      const headers = within(pathTable())
        .getAllByRole("columnheader")
        .map((el) => el.textContent);
      expect(headers).toEqual([
        "진입 단계",
        "진입가",
        "누적 평단",
        "청산가",
        "재투입",
        "시점 수익",
        "투입 증거금",
        "추가 수량",
      ]);

      // 칸 인덱스(행 머리글 제외): 3 재투입, 4 시점 수익, 5 투입 증거금.
      const rows = bodyRows().map(readRow);
      expect(rows).toHaveLength(3);
      expect(rows[0].name).toBe("최초 진입");
      expect(rows[0].cells[3]).toBe(DASH);
      expect(rows[0].cells[4]).toBe(DASH);
      expect(rows[0].cells[5]).toBe(result("포지션 요약", "실제 투입 원금"));
      expect(rows[1].name).toBe("1차 추가 진입");
      expect(rows[2].name).toBe("2차 추가 진입");
    });

    /**
     * @spec DoD-20
     * @given 1차 재투입 비율을 표본 값으로 하나씩 바꾼다 — 표본: 100 → `100%`, 12.5 → `12.5%`, 50 → `50%`, 12.50 → `12.5%`, 100.0 → `100%`
     * @when 경로 표의 1차 행 재투입 칸을 읽는다
     * @then 재투입 칸은 끝자리 0 없는 숫자 + `%`다
     */
    it("[DoD-20] 단계 행의 재투입 칸은 끝자리 0 없는 숫자 + `%`다", async () => {
      const samples: [input: string, expected: string][] = [
        ["100", "100%"],
        ["12.5", "12.5%"],
        ["50", "50%"],
        ["12.50", "12.5%"],
        ["100.0", "100%"],
      ];

      for (const [input, expected] of samples) {
        const { user } = renderTerminal();
        await setField(user, "1차 재투입 비율", input);
        expect(readRow(bodyRows()[1]).cells[3]).toBe(expected);
        cleanup();
      }
    });

    /**
     * @spec DoD-21
     * @given 화면을 처음 연다(P1). 차트는 mock 없이 실제로 렌더한다
     * @when 포지션 경로 영역을 읽는다
     * @then 포지션 경로 영역 안에 경로 차트 영역이 있다
     * @then 렌더 중 console.error가 호출되지 않는다
     * @then 선 3개·범례·툴팁의 실제 렌더는 이 테스트에서 판정하지 않는다(E2E T-12 몫)
     */
    it("[DoD-21] 포지션 경로에 차트 영역이 렌더되고 콘솔 오류가 없다(선 렌더는 E2E)", async () => {
      renderTerminal();

      expect(within(region("포지션 경로")).getByRole("figure")).toBeTruthy();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("화면 구조와 부가 요소", () => {
    /**
     * @spec DoD-31
     * @given 화면을 처음 연다
     * @when 제목(heading level 1)을 읽는다
     * @then h1은 `피라미딩 계산기`다
     */
    it("[DoD-31] h1은 `피라미딩 계산기`다", async () => {
      renderTerminal();

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("피라미딩 계산기");
    });

    /**
     * @spec DoD-32
     * @given 화면을 처음 연다
     * @when region 목록을 읽는다
     * @then 이름이 `포지션 설정`, `추가 진입`, `포지션 요약`, `포지션 경로`, `익절`, `손절`인 region이 각각 있다
     */
    it("[DoD-32] region 이름은 포지션 설정·추가 진입·포지션 요약·포지션 경로·익절·손절이다", async () => {
      renderTerminal();

      for (const name of [
        "포지션 설정",
        "추가 진입",
        "포지션 요약",
        "포지션 경로",
        "익절",
        "손절",
      ] as const) {
        expect(screen.getAllByRole("region", { name })).toHaveLength(1);
      }
    });

    /**
     * @spec DoD-33
     * @given 심볼 표본을 하나씩 선택한다 — 표본: ETHUSDT → `ETH / USDT`(처음 연 화면), SOLUSDT → `SOL / USDT`, BTCUSDT → `BTC / USDT`
     * @when 마켓 스트립을 읽는다
     * @then 선택 심볼이 `{기초} / USDT` 형식으로 표시된다
     * @then `무기한` 태그가 있다
     * @then 심볼 정보 기준일(SYMBOLS_AS_OF) 문구가 있다
     * @then `계산 기준` 버튼이 있다
     */
    it("[DoD-33] 마켓 스트립에 선택 심볼·`무기한` 태그·심볼 정보 기준일·`계산 기준` 버튼이 있다", async () => {
      const samples: { symbol: SymbolName; pair: string }[] = [
        { symbol: "ETHUSDT", pair: "ETH / USDT" },
        { symbol: "SOLUSDT", pair: "SOL / USDT" },
        { symbol: "BTCUSDT", pair: "BTC / USDT" },
      ];

      for (const sample of samples) {
        const { user } = renderTerminal();
        if (sample.symbol !== "ETHUSDT") await chooseSymbol(user, sample.symbol);

        expect(screen.getByText(sample.pair)).toBeTruthy();
        for (const other of samples.filter((s) => s.symbol !== sample.symbol)) {
          expect(screen.queryByText(other.pair)).toBeNull();
        }
        expect(screen.getByText("무기한")).toBeTruthy();
        expect(
          screen.getByText(
            (text) => text.includes("심볼 정보 기준일") && text.includes(SYMBOLS_AS_OF),
          ),
        ).toBeTruthy();
        expect(button("계산 기준")).toBeTruthy();
        cleanup();
      }
    });

    /**
     * @spec DoD-34
     * @given 화면을 처음 연다(추가 진입 단계 2개)
     * @when 입력·버튼을 접근 이름(정확 일치)으로 찾는다
     * @then `심볼`, `방향` 그룹 안의 `롱`·`숏`, `최초 진입가`, `초기 증거금`, `레버리지`(입력란), `레버리지 슬라이더`가 있다
     * @then `수수료 설정`을 펼치면 `거래 수수료율`이 있다
     * @then `1차 추가 진입가`, `1차 재투입 비율`, `1차 추가 진입 삭제`, `2차 추가 진입가`, `2차 재투입 비율`, `2차 추가 진입 삭제`가 화면 순서대로 있다
     * @then `추가 진입 단계`, `익절가`, `목표 수익률`, `손절가`, `초기화`, `계산 기준`이 있다
     */
    it("[DoD-34] 입력·버튼의 접근 이름이 스펙 목록과 정확히 일치한다", async () => {
      const { user } = renderTerminal();

      expect(screen.getByRole("combobox", { name: "심볼" })).toBeTruthy();
      const sideGroup = screen.getByRole("group", { name: "방향" });
      expect(within(sideGroup).getByRole("button", { name: "롱" })).toBeTruthy();
      expect(within(sideGroup).getByRole("button", { name: "숏" })).toBeTruthy();
      expect(textbox("최초 진입가")).toBeTruthy();
      expect(textbox("초기 증거금")).toBeTruthy();
      expect(textbox("레버리지")).toBeTruthy();
      expect(slider()).toBeTruthy();

      await openFeeSettings(user);
      expect(textbox("거래 수수료율")).toBeTruthy();

      const stepControls = [
        textbox("1차 추가 진입가"),
        textbox("1차 재투입 비율"),
        button("1차 추가 진입 삭제"),
        textbox("2차 추가 진입가"),
        textbox("2차 재투입 비율"),
        button("2차 추가 진입 삭제"),
      ];
      // 카드 안 순서: 삭제 버튼(제목 줄) → 가격 → 재투입. 단계 번호 순서로 1차 묶음이 2차 묶음보다 앞이다.
      expectInDocumentOrder([stepControls[0], stepControls[3]]);
      expectInDocumentOrder([stepControls[1], stepControls[4]]);
      expectInDocumentOrder([stepControls[2], stepControls[5]]);
      expectInDocumentOrder([stepControls[0], stepControls[1]]);
      expectInDocumentOrder([stepControls[3], stepControls[4]]);

      expect(button("추가 진입 단계")).toBeTruthy();
      expect(textbox("익절가")).toBeTruthy();
      expect(textbox("목표 수익률")).toBeTruthy();
      expect(textbox("손절가")).toBeTruthy();
      expect(button("초기화")).toBeTruthy();
      expect(button("계산 기준")).toBeTruthy();
    });

    /**
     * @spec DoD-35
     * @given 화면을 처음 연다
     * @when `계산 기준` 버튼을 누른다
     * @then 다이얼로그가 열린다
     * @then 다이얼로그에 계산 기준 단락 4개가 표시된다
     * @then 1~3단락은 시안(docs/product/references/pyramid-terminal-wireframe.html의 계산 기준 다이얼로그) 원문이다
     * @then 4단락의 첫 문장은 `청산은 총 자산이 심볼 첫 단계 유지증거금률 기준 유지증거금과 예상 청산 수수료에 도달하는 가격의 근사치입니다.`이고 나머지 문장은 시안 원문이다
     */
    it("[DoD-35] `계산 기준`을 누르면 다이얼로그가 열리고 계산 기준 4단락이 표시된다", async () => {
      const { user } = renderTerminal();

      await user.click(button("계산 기준"));

      const dialog = await screen.findByRole("dialog");
      const paragraphs = [
        "USDT 선형 무기한 계약의 단순화된 공유 담보 모델입니다. 실시간 시세와 연결되어 있지 않습니다.",
        "추가 수량 = 가용 미실현 수익 × 재투입 비율 × 최초 레버리지 ÷ 추가 진입가. 이전 단계에서 증거금으로 배정한 수익은 가용 수익에서 제외합니다.",
        "미실현 수익은 현금 담보에 중복 합산하지 않습니다. 총 자산은 원금 + 미실현 손익 − 진입 수수료입니다. 실효 레버리지는 최종 진입 시점의 포지션 가치 ÷ 최초 원금입니다.",
        "청산은 총 자산이 심볼 첫 단계 유지증거금률 기준 유지증거금과 예상 청산 수수료에 도달하는 가격의 근사치입니다. 거래소 위험 한도·펀딩·슬리피지·다른 포지션은 반영하지 않습니다. 격리에서 수익을 증거금으로 옮기려면 일부 실현이 필요하므로 실제 결과와 다릅니다.",
      ];
      const shown = within(dialog).getAllByText((_, el) => el?.tagName === "P");
      expect(shown.map((el) => el.textContent)).toEqual(paragraphs);
    });

    /**
     * @spec DoD-36
     * @given 화면을 처음 연다
     * @when 화면 하단을 읽는다
     * @then `청산가는 근사치이며 거래소·증거금 방식·펀딩비에 따라 달라집니다.` 고지가 있다
     */
    it("[DoD-36] 화면 하단에 청산가 추정치 고지가 있다", async () => {
      renderTerminal();

      expect(
        screen.getByText("청산가는 근사치이며 거래소·증거금 방식·펀딩비에 따라 달라집니다."),
      ).toBeTruthy();
    });
  });

  describe("기본 입력이 비정상일 때", () => {
    /**
     * @spec EC-1 EC-10
     * @given 입력 표본을 하나씩 넣는다 — 표본: 최초 진입가 빈칸, 최초 진입가 `.`, 초기 증거금 빈칸, 초기 증거금 `.`
     * @when 결과 영역을 읽는다
     * @then 포지션 요약·포지션 경로·익절·손절 결과가 모두 `—`다
     * @then 경고(`⚠`)가 표시되지 않는다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-1] 최초 진입가나 초기 증거금이 빈칸 또는 `.`이면 경고 없이 결과가 모두 `—`다", async () => {
      const samples: [field: "최초 진입가" | "초기 증거금", value: string][] = [
        ["최초 진입가", ""],
        ["최초 진입가", "."],
        ["초기 증거금", ""],
        ["초기 증거금", "."],
      ];

      for (const [field, value] of samples) {
        const { user } = renderTerminal();
        await setField(user, field, value);

        expectAllResultsEmpty();
        expect(screen.queryByText(new RegExp(WARN))).toBeNull();
        expectCleanScreen();
        cleanup();
      }
    });

    /**
     * @spec EC-2 EC-10
     * @given 입력 표본을 하나씩 넣는다 — 표본: 최초 진입가 0, 초기 증거금 0
     * @when 결과 영역과 그 입력란 아래를 읽는다
     * @then 포지션 요약·포지션 경로·익절·손절 결과가 모두 `—`다
     * @then 0을 넣은 입력란 아래(aria-describedby)에 `⚠ 0보다 커야 합니다.`가 표시된다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-2] 최초 진입가나 초기 증거금이 0이면 결과가 모두 `—`이고 그 입력란 아래 경고가 표시된다", async () => {
      for (const field of ["최초 진입가", "초기 증거금"] as const) {
        const { user } = renderTerminal();
        await setField(user, field, "0");

        expectAllResultsEmpty();
        expect(describedWarning(textbox(field))).toBe(ZERO_WARNING);
        expectCleanScreen();
        cleanup();
      }
    });

    /**
     * @spec EC-3 EC-10
     * @given `수수료 설정`을 펼치고 거래 수수료율을 지운다
     * @when 결과 영역을 읽는다
     * @then 포지션 요약·포지션 경로·익절·손절 결과가 모두 `—`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-3] 거래 수수료율이 빈칸이면 결과가 모두 `—`다", async () => {
      const { user } = renderTerminal();
      await setFee(user, "");

      expect(textbox("거래 수수료율").value).toBe("");
      expectAllResultsEmpty();
      expectCleanScreen();
    });

    /**
     * @spec EC-4 EC-10
     * @given `수수료 설정`을 펼치고 거래 수수료율에 표본을 하나씩 넣는다 — 표본: 1(경계), 1.5
     * @when 결과 영역과 수수료율 입력란 아래를 읽는다
     * @then 포지션 요약·포지션 경로·익절·손절 결과가 모두 `—`다
     * @then `⚠ 수수료율은 1% 미만이어야 합니다.`가 표시된다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-4] 거래 수수료율이 1 이상이면 결과가 모두 `—`이고 수수료율 경고가 표시된다", async () => {
      for (const value of ["1", "1.5"]) {
        const { user } = renderTerminal();
        await setFee(user, value);

        expectAllResultsEmpty();
        expect(describedWarning(textbox("거래 수수료율"))).toBe(FEE_WARNING);
        expectCleanScreen();
        cleanup();
      }
    });

    /**
     * @spec EC-6 EC-10
     * @given 레버리지 입력란을 지우고 포커스를 그 입력란에 둔다
     * @when 결과 영역을 읽는다
     * @then 포지션 요약·포지션 경로·익절·손절 결과가 모두 `—`다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-6] 레버리지 입력란이 빈칸인 동안 결과가 모두 `—`다", async () => {
      const { user } = renderTerminal();
      await setField(user, "레버리지", "");

      expect(document.activeElement).toBe(textbox("레버리지"));
      expectAllResultsEmpty();
      expectCleanScreen();
    });

    /**
     * @spec EC-30 EC-10
     * @given 기본 입력을 무효로 만든다(최초 진입가 빈칸)
     * @when 포지션 요약·포지션 경로·익절 영역을 읽는다
     * @then 경로 표에 본문 행이 없다
     * @then 경로 차트가 그려지지 않는다
     * @then 비교 막대(`추가 진입 없이`·`피라미딩 적용`)가 표시되지 않는다
     * @then 평단 이동·레버리지 변화 보조 문구가 표시되지 않는다
     * @then 목표 수익률 입력란은 빈칸이다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-30] 계산 결과가 없으면 표 본문·차트·비교 막대·보조 문구가 없고 목표 수익률은 빈칸이다", async () => {
      const { user } = renderTerminal();
      await setField(user, "최초 진입가", "");

      expect(bodyRows()).toHaveLength(0);
      expect(within(region("포지션 경로")).queryByRole("figure")).toBeNull();
      expect(queryResult("익절", "추가 진입 없이")).toBeNull();
      expect(queryResult("익절", "피라미딩 적용")).toBeNull();
      const summary = within(region("포지션 요약"));
      expect(summary.queryByText(/최초 진입 대비/)).toBeNull();
      expect(summary.queryByText(/노출/)).toBeNull();
      expect(textbox("목표 수익률").value).toBe("");
      expectCleanScreen();
    });
  });

  describe("레버리지 범위 밖 입력", () => {
    /**
     * @spec EC-7 EC-10
     * @given ETHUSDT(maxLeverage 150)에서 레버리지 입력란에 표본을 하나씩 넣는다 — 표본: 0 → 1, 151 → 150
     * @when 레버리지 입력란에서 포커스를 뺀다
     * @then 레버리지 입력란 값이 표본의 기대값(1 또는 maxLeverage)으로 바뀐다
     * @then 레버리지 슬라이더 값도 같은 값이다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-7] 레버리지 0이나 maxLeverage 초과 값은 포커스를 빼면 1 또는 maxLeverage로 바뀐다", async () => {
      const samples: [input: string, expected: string][] = [
        ["0", "1"],
        ["151", "150"],
      ];

      for (const [input, expected] of samples) {
        const { user } = renderTerminal();
        await setField(user, "레버리지", input);
        await user.tab();

        expect(textbox("레버리지").value).toBe(expected);
        expect(sliderValue()).toBe(expected);
        expectCleanScreen();
        cleanup();
      }
    });

    /**
     * @spec EC-33 EC-10
     * @given ETHUSDT에서 레버리지 입력란에 표본을 하나씩 입력하고 포커스를 그대로 둔다 — 표본: 0 → 1로 맞춤, 151 → 150으로 맞춤
     * @when 포커스를 빼기 전에 레버리지 입력란·슬라이더·결과를 읽는다
     * @then 레버리지 입력란에는 입력한 원문이 그대로 있다
     * @then 레버리지 슬라이더 값은 1~maxLeverage로 맞춘 값이다
     * @then 결과는 맞춘 레버리지(표본의 기대값)를 직접 입력했을 때의 결과와 같다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-33] 포커스 이탈 전 범위 밖 레버리지는 계산과 슬라이더에 1~maxLeverage로 맞춘 값이 쓰인다", async () => {
      const samples: [input: string, clamped: string][] = [
        ["0", "1"],
        ["151", "150"],
      ];

      for (const [input, clamped] of samples) {
        const { user } = renderTerminal();
        await setField(user, "레버리지", input);

        expect(document.activeElement).toBe(textbox("레버리지"));
        expect(textbox("레버리지").value).toBe(input);
        expect(sliderValue()).toBe(clamped);
        const withRaw = resultsText();
        expectCleanScreen();

        await setField(user, "레버리지", clamped);
        expect(withRaw).toBe(resultsText());
        cleanup();
      }
    });

    /**
     * @spec EC-33 EC-10
     * @given 레버리지 입력란을 지운다
     * @when 레버리지 입력란에서 포커스를 뺀다
     * @then 레버리지 입력란은 빈칸 그대로다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-33] 빈칸인 레버리지 입력란에서 포커스를 빼면 빈칸이 그대로다", async () => {
      const { user } = renderTerminal();
      await setField(user, "레버리지", "");

      await user.tab();

      expect(textbox("레버리지").value).toBe("");
      expectCleanScreen();
    });
  });

  describe("청산·한도 경계", () => {
    /**
     * @spec EC-8 EC-10
     * @given P1에서 레버리지 1, `수수료 설정`의 거래 수수료율 0으로 바꾸고 1차·2차 추가 진입을 삭제한다(청산가 원값 0)
     * @when 포지션 요약과 경로 표를 읽는다
     * @then 포지션 요약의 추정 청산가는 `청산 없음`이다
     * @then 경로 표 최초 진입 행의 청산가 칸은 `청산 없음`이다
     * @then 차트 점 비움은 이 테스트에서 판정하지 않는다(차트 데이터 T-7 몫)
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-8] 단계 없이 청산가 원값이 0이면 요약과 최초 행에 `청산 없음`이 표시된다", async () => {
      const { user } = renderTerminal();
      await setField(user, "레버리지", "1");
      await setFee(user, "0");
      await user.click(button("2차 추가 진입 삭제"));
      await user.click(button("1차 추가 진입 삭제"));

      expect(result("포지션 요약", "추정 청산가")).toBe(NO_LIQUIDATION);
      const rows = bodyRows();
      expect(rows).toHaveLength(1);
      expect(readRow(rows[0]).cells[2]).toBe(NO_LIQUIDATION);
      expectCleanScreen();
    });

    /**
     * @spec EC-8 EC-10
     * @given P1에서 레버리지 1, 거래 수수료율 0으로 바꾸고 추가 진입 단계를 (2100, 100) 하나만 남긴다(최초 행 청산가 원값 0, 1차 행 원값 183.2133…)
     * @when 포지션 요약과 경로 표를 읽는다
     * @then 경로 표 최초 진입 행의 청산가 칸은 `청산 없음`이다
     * @then 경로 표 1차 추가 진입 행의 청산가 칸은 `183.22`다(롱 틱 올림)
     * @then 포지션 요약의 추정 청산가는 `183.22`다(마지막 포함 단계까지 반영한 값)
     * @then 차트 점 비움은 이 테스트에서 판정하지 않는다(차트 데이터 T-7 몫)
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-8] 원값이 0 이하인 행만 표에서 `청산 없음`이고 양수인 행은 틱 청산가다", async () => {
      const { user } = renderTerminal();
      await setField(user, "레버리지", "1");
      await setFee(user, "0");
      await user.click(button("2차 추가 진입 삭제"));

      const rows = bodyRows();
      expect(rows).toHaveLength(2);
      expect(readRow(rows[0]).cells[2]).toBe(NO_LIQUIDATION);
      expect(readRow(rows[1]).cells[2]).toBe("183.22");
      expect(result("포지션 요약", "추정 청산가")).toBe("183.22");
      expectCleanScreen();
    });

    /**
     * @spec EC-9 EC-10
     * @given P1에서 레버리지만 30으로 바꾼다(최초 포지션 가치 30,000 ≤ 300,000, 최종 포지션 가치 505,488.72… > 300,000 — 최초 포지션 가치로 판정하는 틀린 구현을 가르기 위한 표본)
     * @when 포지션 요약 영역을 읽는다
     * @then `⚠ 포지션 가치가 유지증거금률 첫 단계 한도(300,000 USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`가 표시된다(한도 표기는 formatPrice(riskLimitValue, 0))
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-9] 최종 포지션 가치가 riskLimitValue를 넘으면 포지션 요약에 한도 초과 경고가 표시된다", async () => {
      const { user } = renderTerminal();
      await setField(user, "레버리지", "30");

      expect(within(region("포지션 요약")).getByText(TIER_WARNING_ETH)).toBeTruthy();
      expectCleanScreen();
    });

    /**
     * @spec EC-9
     * @given 화면을 처음 연다(P1, 최종 포지션 가치 12,819.54 USDT로 riskLimitValue 300000 이하)
     * @when 포지션 요약 영역을 읽는다
     * @then 한도 초과 경고가 표시되지 않는다
     */
    it("[EC-9] 최종 포지션 가치가 riskLimitValue 이하이면 한도 초과 경고가 없다", async () => {
      renderTerminal();

      expect(
        within(region("포지션 요약")).queryByText(/포지션 가치가 유지증거금률 첫 단계 한도/),
      ).toBeNull();
    });

    /**
     * @spec EC-10
     * @given 극단 입력 표본을 하나씩 넣는다 — 표본: 최초 진입가 `1` 뒤에 `0`을 300개 붙인 문자열(입력란은 지수 표기 `e`를 받지 않는다), 초기 증거금 매우 작은 값(예: 0.0000001), 1차 추가 진입가 `1` 뒤에 `0`을 300개 붙인 문자열
     * @when 화면 전체 텍스트를 읽는다
     * @then 화면에 `NaN`·`Infinity`가 표시되지 않는다
     * @then console.error가 호출되지 않는다
     */
    it("[EC-10] 극단 입력에서도 `NaN`·`Infinity`가 표시되지 않고 콘솔 오류가 없다", async () => {
      const huge = `1${"0".repeat(300)}`;
      const samples: [field: string, value: string][] = [
        ["최초 진입가", huge],
        ["초기 증거금", "0.0000001"],
        ["1차 추가 진입가", huge],
      ];

      for (const [field, value] of samples) {
        const { user } = renderTerminal();
        await setField(user, field, value);

        expect(textbox(field).value).toBe(value);
        expectCleanScreen();
        cleanup();
      }
    });

    /**
     * @spec EC-34 EC-10
     * @given 누적 진입 수수료가 증거금 이상이 되는 입력을 넣는다(예: 레버리지 150, 거래 수수료율 0.99, 추가 진입 단계 없음 — 진입 수수료 = 증거금 × 150 × 0.0099 ≥ 증거금)
     * @when 포지션 요약과 손절 영역을 읽는다
     * @then 포지션 요약의 추정 청산가는 `—`다
     * @then 포지션 요약에 `⚠ 진입 즉시 청산되는 포지션입니다.`가 표시된다
     * @then 손절 패널의 청산가까지 거리는 `—`다
     * @then `⚠ 손절 전에 청산될 수 있습니다. 손절가를 확인하세요.`가 표시되지 않는다
     * @then 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다
     */
    it("[EC-34] 누적 진입 수수료가 증거금 이상이면 청산가 `—`와 즉시 청산 경고가 표시된다", async () => {
      const { user } = renderTerminal();
      await setField(user, "레버리지", "150");
      await setFee(user, "0.99");
      await user.click(button("2차 추가 진입 삭제"));
      await user.click(button("1차 추가 진입 삭제"));

      expect(result("포지션 요약", "추정 청산가")).toBe(DASH);
      expect(within(region("포지션 요약")).getByText(INSTANT_WARNING)).toBeTruthy();
      expect(result("손절", "청산가까지 거리")).toBe(DASH);
      expect(screen.queryByText(STOP_BEFORE_LIQUIDATION_WARNING)).toBeNull();
      expectCleanScreen();
    });
  });
});
