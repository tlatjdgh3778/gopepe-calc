import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { PyramidTerminal } from "@/components/pyramid/pyramid-terminal";

// T-10 컴포넌트 테스트(익절·손절). 스펙 docs/specs/pyramid-terminal.md, 계획 T-10.
// 기준 사례 P1·P2는 스펙 §3 표 리터럴이다(수수료율 0.055%).
// P1 처음 연 화면·P2 입력 상태의 표시값 리터럴은 T-8 파일의 DoD-9·DoD-10 case에 모으고, 이 파일은 패널 고유 내용만 둔다.
// P1: ETHUSDT, 롱, 1900, 증거금 1000, 5×, 단계 (2100, 100)·(2300, 100), 익절가 2500, 손절가 2000.
// P2: SOLUSDT, 숏, 150, 증거금 500, 10×, 단계 (140, 50)·(130, 100), 익절가 120, 손절가 140.
// 표에 없는 표본 값은 DoD-5·DoD-7·DoD-25 규칙으로 손계산한 값이다.
// 경고의 `⚠`(U+26A0), 부호 `−`(U+2212), 빈 결과 `—`(U+2014)는 정확히 비교한다.
// 모든 case에서 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않는다(계획 T-10 완료 조건 3).
// mock 경계: console.error의 vi.spyOn(관찰만). 차트는 실제로 렌더하고 판정하지 않는다.
// 데이터 격리: 표본마다 새로 렌더하고 끝나면 unmount한다(case 끝의 DOM은 vitest.setup.ts의 cleanup이 비운다).

const WARN = "⚠"; // ⚠
const DASH = "—"; // —

const ZERO_WARNING = `${WARN} 0보다 커야 합니다.`;
const NO_ROE_PRICE_WARNING = `${WARN} 이 수익률에 해당하는 가격이 없습니다.`;
const TP_BEHIND_WARNING = `${WARN} 익절가가 마지막 추가 진입가보다 앞에 있습니다. 경로를 확인해 주세요.`;
const STOP_PROFIT_SIDE_WARNING = `${WARN} 손절가가 최종 진입가의 수익 방향에 있습니다.`;
const STOP_BEFORE_LIQ_WARNING = `${WARN} 손절 전에 청산될 수 있습니다. 손절가를 확인하세요.`;
const RISK_NOTICE_PATTERN =
  /^마지막 진입가에서 \d[\d,]*\.\d{2}% 역행하면 수수료 포함 전체 수익이 사라집니다\.$/;
const RISK_NOTICE_FRAGMENT = "역행하면 수수료 포함 전체 수익이 사라집니다.";

type User = ReturnType<typeof userEvent.setup>;
type Case = "P1" | "P2";

let consoleErrorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  // 관찰만 한다. 원래 console.error 동작은 대체하지 않는다.
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

function textbox(name: string): HTMLInputElement {
  return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function region(name: "포지션 요약" | "추가 진입" | "익절" | "손절"): HTMLElement {
  return screen.getByRole("region", { name });
}

/** region 안 결과 값(`dd`, 이름은 `dt` 라벨)의 표시 문자열. */
function resultText(regionName: "포지션 요약" | "익절" | "손절", label: string): string {
  return within(region(regionName)).getByRole("definition", { name: label }).textContent ?? "";
}

/** 입력란의 `aria-describedby`가 가리키는 `⚠` 경고 문구들. */
function linkedWarnings(input: HTMLElement): string[] {
  const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .filter((text) => text.startsWith(WARN));
}

/** 기존 값을 지우고 실제 키 입력으로 새 값을 넣는다. 빈 문자열이면 지우기만 한다. */
async function typeInto(user: User, name: string, value: string) {
  const input = textbox(name);
  await user.clear(input);
  if (value !== "") await user.type(input, value);
}

/** 입력란 값 전체를 선택한 뒤 붙여넣기 한 번으로 바꾼다(키 입력 중간값이 반영되지 않게). */
async function pasteReplacing(user: User, name: string, value: string) {
  const input = textbox(name);
  await user.click(input);
  input.select();
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  await user.paste(value);
}

async function chooseSymbol(user: User, symbol: "ETHUSDT" | "SOLUSDT" | "BTCUSDT") {
  await user.click(screen.getByRole("combobox", { name: "심볼" }));
  await user.click(await screen.findByRole("option", { name: symbol }));
}

async function chooseSide(user: User, side: "롱" | "숏") {
  const button = within(screen.getByRole("group", { name: "방향" })).getByRole("button", {
    name: side,
  });
  if (button.getAttribute("aria-pressed") !== "true") await user.click(button);
}

/** 기준 사례 P2를 입력한다(수수료율 0.055 그대로). */
async function enterP2(user: User) {
  await chooseSymbol(user, "SOLUSDT");
  await chooseSide(user, "숏");
  await typeInto(user, "최초 진입가", "150");
  await typeInto(user, "초기 증거금", "500");
  await typeInto(user, "레버리지", "10");
  await typeInto(user, "1차 추가 진입가", "140");
  await typeInto(user, "1차 재투입 비율", "50");
  await typeInto(user, "2차 추가 진입가", "130");
  await typeInto(user, "2차 재투입 비율", "100");
  await typeInto(user, "익절가", "120");
  await typeInto(user, "손절가", "140");
}

/** 기준 사례로 화면을 연다. P1은 처음 연 화면이다. */
async function openCase(which: Case) {
  const rendered = renderTerminal();
  if (which === "P2") await enterP2(rendered.user);
  return rendered;
}

async function removeStep(user: User, n: number) {
  await user.click(screen.getByRole("button", { name: `${n}차 추가 진입 삭제` }));
}

/** 공통 불변식: 화면에 `NaN`·`Infinity`가 없고 console.error가 호출되지 않았다. */
function expectClean() {
  expect(document.body.textContent ?? "").not.toMatch(/NaN|Infinity/);
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

/** 손절 region 안 손절가 위치 마커. */
function stopMarker(): HTMLElement {
  const marker = region("손절").querySelector<HTMLElement>('[data-slot="stop-marker"]');
  expect(marker).not.toBeNull();
  return marker as HTMLElement;
}

describe("익절·손절 — 사용자가 익절가·손절가를 정하면 예상 손익과 위험을 바로 본다", () => {
  describe("목표 수익률로 익절가를 정한다", () => {
    /**
     * @spec DoD-22
     * @given 표본을 하나씩 입력한다: P1에서 목표 수익률 50, P2에서 목표 수익률 50, P2에서 목표 수익률 -50
     * @when 목표 수익률 입력란에 값을 입력한다
     * @then 익절가 입력란 값이 priceForRoe를 틱에 맞춘 값(롱 올림, 숏 내림)의 문자열로 바뀐다: P1·50 → "2158.21", P2·50 → "135.61", P2·-50 → "141"
     * @then 익절가 문자열에 천 단위 구분·지수 표기·끝자리 0이 없다
     * @then 목표 수익률 입력란 값은 입력한 그대로("50", "-50")다
     */
    it("[DoD-22] 목표 수익률을 입력하면 익절가가 틱에 맞춘 역산 가격으로 바뀐다", async () => {
      const samples: { which: Case; roe: string; price: string }[] = [
        { which: "P1", roe: "50", price: "2158.21" },
        { which: "P2", roe: "50", price: "135.61" },
        { which: "P2", roe: "-50", price: "141" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        await typeInto(user, "목표 수익률", sample.roe);

        const takeProfit = textbox("익절가").value;
        expect(takeProfit).toBe(sample.price);
        expect(takeProfit).not.toMatch(/[,eE]/);
        expect(takeProfit).not.toMatch(/\.\d*0$/);
        expect(textbox("목표 수익률").value).toBe(sample.roe);
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec DoD-23
     * @given 처음 연 화면(P1)이다
     * @when 아무 입력도 바꾸지 않는다
     * @then 목표 수익률 입력란 값이 "240.40"이다
     * @then 익절가 입력란 값이 "2500"이다
     */
    it("[DoD-23] 처음 연 화면의 목표 수익률은 240.40이다", async () => {
      renderTerminal();
      expect(textbox("목표 수익률").value).toBe("240.40");
      expect(textbox("익절가").value).toBe("2500");
      expectClean();
    });

    /**
     * @spec DoD-23
     * @given 표본을 하나씩 입력한다: P1에서 익절가 2600(→ "296.10"), 기준 사례 P2 전체 입력(→ "340.21"), P2에서 익절가 50(→ "1640.93")
     * @when 목표 수익률 외의 입력(익절가 포함)을 바꾼다
     * @then 목표 수익률 입력란이 netPnl(익절가) ÷ margin × 100의 소수 2자리 버림 값(천 단위 구분 없음)으로 다시 채워진다
     * @then 익절가 입력란 값은 입력한 그대로다
     */
    it("[DoD-23] 목표 수익률 외의 입력이 바뀌면 목표 수익률이 다시 채워지고 익절가는 그대로다", async () => {
      const samples: { which: Case; takeProfit: string | null; roe: string }[] = [
        { which: "P1", takeProfit: "2600", roe: "296.10" },
        { which: "P2", takeProfit: null, roe: "340.21" },
        { which: "P2", takeProfit: "50", roe: "1640.93" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        if (sample.takeProfit !== null) await typeInto(user, "익절가", sample.takeProfit);

        expect(textbox("목표 수익률").value).toBe(sample.roe);
        expect(textbox("익절가").value).toBe(sample.takeProfit ?? "120");
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec DoD-23
     * @given P1에서 목표 수익률 50을 입력해 익절가가 "2158.21"이 되었다
     * @when 레버리지를 10으로 바꾼다
     * @then 목표 수익률 입력란이 "33.84"로 다시 채워진다
     * @then 익절가 입력란 값은 "2158.21" 그대로다
     */
    it("[DoD-23] 목표 수익률을 입력한 뒤 다른 입력이 바뀌면 목표 수익률이 다시 계산된다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, "목표 수익률", "50");
      expect(textbox("익절가").value).toBe("2158.21");

      await typeInto(user, "레버리지", "10");

      expect(textbox("목표 수익률").value).toBe("33.84");
      expect(textbox("익절가").value).toBe("2158.21");
      expectClean();
    });

    /**
     * @spec EC-20
     * @given 역산 가격이 0 이하인 표본을 하나씩 입력한다: P1에서 목표 수익률 -2000, P2에서 목표 수익률 3000
     * @when 목표 수익률 입력란에 값을 입력한다
     * @then 익절가 입력란 값이 바뀌지 않는다(P1 "2500", P2 "120")
     * @then "⚠ 이 수익률에 해당하는 가격이 없습니다."가 표시된다
     */
    it("[EC-20] 역산 가격이 없으면 익절가가 그대로이고 경고가 표시된다", async () => {
      const samples: { which: Case; roe: string; price: string }[] = [
        { which: "P1", roe: "-2000", price: "2500" },
        { which: "P2", roe: "3000", price: "120" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        // 키 입력 중간값(예: `3`, `-2`)이 유효한 목표가 되지 않도록 한 번에 넣는다.
        await pasteReplacing(user, "목표 수익률", sample.roe);

        expect(textbox("목표 수익률").value).toBe(sample.roe);
        expect(textbox("익절가").value).toBe(sample.price);
        expect(linkedWarnings(textbox("목표 수익률"))).toEqual([NO_ROE_PRICE_WARNING]);
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec EC-32
     * @given 처음 연 화면(P1)에서 표본을 하나씩 만든다: 목표 수익률 빈칸, 목표 수익률 "-"만 입력
     * @when 목표 수익률 입력란을 그 상태로 둔다
     * @then 익절가 입력란 값이 "2500" 그대로다
     * @then 목표 수익률 관련 경고가 표시되지 않는다
     * @then 목표 수익률 입력란은 빈칸/"-" 그대로다
     */
    it("[EC-32] 목표 수익률이 빈칸이거나 '-'만 있으면 경고 없이 익절가가 그대로다", async () => {
      for (const roe of ["", "-"]) {
        const { user, unmount } = renderTerminal();
        await typeInto(user, "목표 수익률", roe);

        expect(textbox("익절가").value).toBe("2500");
        expect(linkedWarnings(textbox("목표 수익률"))).toEqual([]);
        expect(screen.queryByText(NO_ROE_PRICE_WARNING)).toBeNull();
        expect(textbox("목표 수익률").value).toBe(roe);
        expectClean();
        unmount();
      }
    });
  });

  describe("익절 패널", () => {
    /**
     * @spec DoD-24
     * @given 처음 연 화면(P1)이다(P1·P2 표시값 리터럴은 DoD-9·DoD-10 case가 판정한다)
     * @when 익절 패널 region을 본다
     * @then `예상 순수익` 항목과 그 ROE가 익절 패널 안에 있다
     * @then 비교 막대 2줄 `추가 진입 없이`·`피라미딩 적용`이 있다
     * @then `추가 진입 효과 {차이}` 문구가 있고, 순수익과 추가 진입 없이 값이 모두 양수이면 차이 뒤에 ` · {x.xx}배`가 붙는 형식이다
     */
    it("[DoD-24] 익절 패널에 순수익·ROE·비교 막대·추가 진입 효과 항목이 있다", async () => {
      renderTerminal();
      const panel = within(region("익절"));

      const net = panel.getByRole("definition", { name: "예상 순수익" }).textContent ?? "";
      const roe = panel.getByRole("definition", { name: "ROE" }).textContent ?? "";
      expect(net).toMatch(/^[+−][\d,]+\.\d{2} USDT$/);
      expect(roe).toMatch(/^[+−][\d,]+\.\d{2}%$/);

      const baseline = panel.getByRole("definition", { name: "추가 진입 없이" }).textContent ?? "";
      const pyramid = panel.getByRole("definition", { name: "피라미딩 적용" }).textContent ?? "";
      expect(baseline).toMatch(/^[+−][\d,]+\.\d{2} USDT$/);
      expect(pyramid).toBe(net);

      // 처음 연 화면은 순수익·추가 진입 없이 값이 모두 양수라 배수가 붙는다.
      const effect = panel.getByRole("definition", { name: "추가 진입 효과" }).textContent ?? "";
      expect(effect).toMatch(/^[+−][\d,]+\.\d{2} USDT · [\d,]+\.\d{2}배$/);
      expectClean();
    });

    /**
     * @spec EC-21
     * @given 처음 연 화면(P1)이다
     * @when 익절가를 빈칸으로 만든다
     * @then 익절 패널의 예상 순수익·ROE·추가 진입 없이·피라미딩 적용·추가 진입 효과가 "—"다
     * @then 손절 패널의 손익비가 "—"다
     * @then "⚠ 0보다 커야 합니다." 경고가 표시되지 않는다
     */
    it("[EC-21] 익절가가 빈칸이면 익절 결과와 손익비가 '—'다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, "익절가", "");

      for (const label of [
        "예상 순수익",
        "ROE",
        "추가 진입 없이",
        "피라미딩 적용",
        "추가 진입 효과",
      ]) {
        expect(resultText("익절", label)).toBe(DASH);
      }
      expect(resultText("손절", "손익비")).toBe(DASH);
      expect(linkedWarnings(textbox("익절가"))).toEqual([]);
      expect(within(region("익절")).queryByText(ZERO_WARNING)).toBeNull();
      expectClean();
    });

    /**
     * @spec EC-21
     * @given 처음 연 화면(P1)이다
     * @when 익절가에 0을 입력한다
     * @then 익절 패널의 예상 순수익·ROE·추가 진입 없이·피라미딩 적용·추가 진입 효과가 "—"다
     * @then 손절 패널의 손익비가 "—"다
     * @then 익절가 입력란 아래 "⚠ 0보다 커야 합니다."가 표시된다
     */
    it("[EC-21] 익절가가 0이면 익절 결과와 손익비가 '—'이고 0 경고가 표시된다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, "익절가", "0");

      for (const label of [
        "예상 순수익",
        "ROE",
        "추가 진입 없이",
        "피라미딩 적용",
        "추가 진입 효과",
      ]) {
        expect(resultText("익절", label)).toBe(DASH);
      }
      expect(resultText("손절", "손익비")).toBe(DASH);
      expect(linkedWarnings(textbox("익절가"))).toEqual([ZERO_WARNING]);
      expectClean();
    });

    /**
     * @spec EC-23
     * @given 마지막 포함 진입가보다 수익 방향의 반대쪽 익절가 표본을 하나씩 입력한다: P1(롱, 마지막 2300)에서 익절가 2200, P2(숏, 마지막 130)에서 익절가 135
     * @when 익절가를 입력한다
     * @then "⚠ 익절가가 마지막 추가 진입가보다 앞에 있습니다. 경로를 확인해 주세요."가 표시된다
     */
    it("[EC-23] 익절가가 마지막 진입가보다 수익 방향 반대쪽이면 경고가 표시된다", async () => {
      const samples: { which: Case; takeProfit: string }[] = [
        { which: "P1", takeProfit: "2200" },
        { which: "P2", takeProfit: "135" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        await typeInto(user, "익절가", sample.takeProfit);

        expect(within(region("익절")).getByText(TP_BEHIND_WARNING)).toBeTruthy();
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec EC-28
     * @given 순수익과 추가 진입 없이 값이 모두 양수가 아닌 표본을 하나씩 입력한다: P1에서 익절가 2000(순수익 음수, 추가 진입 없이 양수), P1에서 익절가 1850(둘 다 음수), P2에서 익절가 150(둘 다 음수)
     * @when 익절 패널의 추가 진입 효과를 본다
     * @then 추가 진입 효과에 배수("· x.xx배")가 붙지 않는다
     */
    it("[EC-28] 순수익이나 추가 진입 없이 값이 양수가 아니면 배수가 붙지 않는다", async () => {
      const samples: { which: Case; takeProfit: string }[] = [
        { which: "P1", takeProfit: "2000" },
        { which: "P1", takeProfit: "1850" },
        { which: "P2", takeProfit: "150" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        await typeInto(user, "익절가", sample.takeProfit);

        const effect = resultText("익절", "추가 진입 효과");
        expect(effect).not.toMatch(/·/);
        expect(effect).not.toMatch(/배/);
        expectClean();
        unmount();
      }
    }, 60_000);
  });

  describe("손절 패널", () => {
    /**
     * @spec DoD-25
     * @given 표본을 하나씩 입력한다: P1(300 ÷ 404.8 × 100 → 74.11%), P2(10 ÷ 12.97 × 100 → 77.10%), P1에서 손절가 2400(음수 → 0%), P1에서 손절가 1800(123.52% → 100%)
     * @when 손절 패널의 손절가 위치 마커를 본다
     * @then 마커는 aria-hidden이다
     * @then 마커 위치는 방향 × (마지막 진입가 − 손절가) ÷ |마지막 진입가 − 틱 청산가| × 100을 0~100으로 자른 %다
     * @then 손절 region 안 data-slot="stop-marker" 요소의 inline style.left가 기대 %와 ±0.01%p 이내다
     */
    it("[DoD-25] 손절가 위치 마커가 aria-hidden이고 0~100으로 자른 위치에 있다", async () => {
      const samples: { which: Case; stopLoss: string | null; percent: number }[] = [
        { which: "P1", stopLoss: null, percent: 74.11 },
        { which: "P2", stopLoss: null, percent: 77.1 },
        { which: "P1", stopLoss: "2400", percent: 0 },
        { which: "P1", stopLoss: "1800", percent: 100 },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        if (sample.stopLoss !== null) await typeInto(user, "손절가", sample.stopLoss);

        const marker = stopMarker();
        expect(marker.getAttribute("aria-hidden")).toBe("true");
        expect(marker.style.left).toMatch(/^-?[\d.]+%$/);
        const left = Number.parseFloat(marker.style.left);
        expect(Math.abs(left - sample.percent)).toBeLessThanOrEqual(0.01);
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec EC-22
     * @given 처음 연 화면(P1)이다
     * @when 손절가를 빈칸으로 만든다
     * @then 손절 시 예상 손익·원금 대비·손익비가 "—"다
     * @then "⚠ 0보다 커야 합니다." 경고가 표시되지 않는다
     */
    it("[EC-22] 손절가가 빈칸이면 손절 손익·원금 대비·손익비가 '—'다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, "손절가", "");

      for (const label of ["손절 시 예상 손익", "원금 대비", "손익비"]) {
        expect(resultText("손절", label)).toBe(DASH);
      }
      expect(linkedWarnings(textbox("손절가"))).toEqual([]);
      expect(within(region("손절")).queryByText(ZERO_WARNING)).toBeNull();
      expectClean();
    });

    /**
     * @spec EC-22
     * @given 처음 연 화면(P1)이다
     * @when 손절가에 0을 입력한다
     * @then 손절 시 예상 손익·원금 대비·손익비가 "—"다
     * @then 손절가 입력란 아래 "⚠ 0보다 커야 합니다."가 표시된다
     */
    it("[EC-22] 손절가가 0이면 손절 결과가 '—'이고 0 경고가 표시된다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, "손절가", "0");

      for (const label of ["손절 시 예상 손익", "원금 대비", "손익비"]) {
        expect(resultText("손절", label)).toBe(DASH);
      }
      expect(linkedWarnings(textbox("손절가"))).toEqual([ZERO_WARNING]);
      expectClean();
    });

    /**
     * @spec EC-24
     * @given 마지막 포함 진입가의 수익 방향 손절가 표본을 하나씩 입력한다: P1(롱, 마지막 2300)에서 손절가 2400, P2(숏, 마지막 130)에서 손절가 125
     * @when 손절가를 입력한다
     * @then "⚠ 손절가가 최종 진입가의 수익 방향에 있습니다."가 표시된다
     */
    it("[EC-24] 손절가가 최종 진입가의 수익 방향이면 경고가 표시된다", async () => {
      const samples: { which: Case; stopLoss: string }[] = [
        { which: "P1", stopLoss: "2400" },
        { which: "P2", stopLoss: "125" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        await typeInto(user, "손절가", sample.stopLoss);

        expect(within(region("손절")).getByText(STOP_PROFIT_SIDE_WARNING)).toBeTruthy();
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec DoD-19 EC-25
     * @given 틱 청산가 너머이거나 같은 손절가 표본을 하나씩 입력한다: P1에서 1895.20(= 틱 청산가, 원값 1895.1973…보다 위), P1에서 1800, P2에서 142.97(= 틱 청산가, 원값 142.9764…보다 아래), P2에서 150
     * @when 손절가를 입력한다
     * @then "⚠ 손절 전에 청산될 수 있습니다. 손절가를 확인하세요."가 표시된다
     */
    it("[DoD-19][EC-25] 손절가가 틱 청산가 너머이거나 같으면 손절 전 청산 경고가 표시된다", async () => {
      const samples: { which: Case; stopLoss: string }[] = [
        { which: "P1", stopLoss: "1895.20" },
        { which: "P1", stopLoss: "1800" },
        { which: "P2", stopLoss: "142.97" },
        { which: "P2", stopLoss: "150" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        await typeInto(user, "손절가", sample.stopLoss);

        expect(within(region("손절")).getByText(STOP_BEFORE_LIQ_WARNING)).toBeTruthy();
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec DoD-19 EC-25
     * @given 틱 청산가 바로 안쪽 손절가 표본을 하나씩 입력한다: P1에서 1895.21, P2에서 142.96
     * @when 손절가를 입력한다
     * @then "⚠ 손절 전에 청산될 수 있습니다. 손절가를 확인하세요."가 표시되지 않는다
     */
    it("[DoD-19][EC-25] 손절가가 틱 청산가 안쪽이면 손절 전 청산 경고가 없다", async () => {
      const samples: { which: Case; stopLoss: string }[] = [
        { which: "P1", stopLoss: "1895.21" },
        { which: "P2", stopLoss: "142.96" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        await typeInto(user, "손절가", sample.stopLoss);

        expect(screen.queryByText(STOP_BEFORE_LIQ_WARNING)).toBeNull();
        expectClean();
        unmount();
      }
    }, 60_000);

    /**
     * @spec EC-26
     * @given 표본을 하나씩 입력한다: P1에서 손절가 2100(손절 손익 0 이상), P1에서 익절가 2000(익절 순수익 0 이하)
     * @when 손절 패널의 손익비를 본다
     * @then 손익비가 "—"다
     */
    it("[EC-26] 손절 손익이 0 이상이거나 익절 순수익이 0 이하이면 손익비가 '—'다", async () => {
      const samples: { field: "손절가" | "익절가"; value: string }[] = [
        { field: "손절가", value: "2100" },
        { field: "익절가", value: "2000" },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderTerminal();
        await typeInto(user, sample.field, sample.value);

        expect(resultText("손절", "손익비")).toBe(DASH);
        expectClean();
        unmount();
      }
    });

    /**
     * @spec EC-27
     * @given P1에서 레버리지 1, 거래 수수료율 0, 1차·2차 추가 진입을 삭제해 추정 청산가 원값이 0 이하(청산 없음)다
     * @when 손절가에 1을 입력한다
     * @then 포지션 요약의 추정 청산가가 "청산 없음"이다
     * @then 청산가까지 거리가 "—"다
     * @then "⚠ 손절 전에 청산될 수 있습니다. 손절가를 확인하세요."가 표시되지 않는다
     */
    it("[EC-27] 청산 없음이면 청산가까지 거리가 '—'이고 손절 전 청산 경고가 없다", async () => {
      const { user } = renderTerminal();
      await typeInto(user, "레버리지", "1");
      await user.click(screen.getByRole("button", { name: "수수료 설정" }));
      await typeInto(user, "거래 수수료율", "0");
      await removeStep(user, 2);
      await removeStep(user, 1);

      await typeInto(user, "손절가", "1");

      expect(resultText("포지션 요약", "추정 청산가")).toBe("청산 없음");
      expect(resultText("손절", "청산가까지 거리")).toBe(DASH);
      expect(screen.queryByText(STOP_BEFORE_LIQ_WARNING)).toBeNull();
      expectClean();
    });
  });

  describe("리스크 문구", () => {
    /**
     * @spec DoD-26
     * @given 처음 연 화면(P1)이다(역행 % 리터럴은 DoD-9·DoD-10 case가 판정한다)
     * @when 포지션 요약 region을 본다
     * @then 포지션 요약 아래에 `마지막 진입가에서 {x.xx%} 역행하면 수수료 포함 전체 수익이 사라집니다.` 형식의 문구가 하나 있다
     */
    it("[DoD-26] 포지션 요약 아래에 역행 % 리스크 문구 형식이 표시된다", async () => {
      renderTerminal();
      const summary = region("포지션 요약");

      const notices = within(summary).getAllByText(RISK_NOTICE_PATTERN);
      expect(notices).toHaveLength(1);
      // 요약 지표 목록(마지막 항목 `누적 진입 수수료`)보다 아래에 있다.
      const lastMetric = within(summary).getByRole("definition", { name: "누적 진입 수수료" });
      expect(
        lastMetric.compareDocumentPosition(notices[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expectClean();
    });

    /**
     * @spec EC-29
     * @given 포함된 추가 진입이 없는 표본을 하나씩 만든다: P1에서 1차·2차 추가 진입 삭제, P1에서 1차 1800·2차 1700(둘 다 수익 방향 아님으로 제외)
     * @when 포지션 요약 아래를 본다
     * @then 리스크 문구가 표시되지 않는다
     */
    it("[EC-29] 포함된 추가 진입이 없으면 리스크 문구가 표시되지 않는다", async () => {
      const samples: { name: string; prepare: (user: User) => Promise<void> }[] = [
        {
          name: "1차·2차 삭제",
          prepare: async (user) => {
            await removeStep(user, 2);
            await removeStep(user, 1);
          },
        },
        {
          name: "1차 1800·2차 1700",
          prepare: async (user) => {
            await typeInto(user, "1차 추가 진입가", "1800");
            await typeInto(user, "2차 추가 진입가", "1700");
          },
        },
      ];
      for (const sample of samples) {
        const { user, unmount } = renderTerminal();
        await sample.prepare(user);

        expect(screen.queryByText(RISK_NOTICE_FRAGMENT, { exact: false })).toBeNull();
        expectClean();
        unmount();
      }
    });

    /**
     * @spec EC-29
     * @given 포함된 추가 진입이 있지만 마지막 포함 진입가가 본전가보다 수익 쪽이 아닌 표본을 하나씩 만든다: P1에서 단계를 (1901, 100) 하나로(본전가 1902.09…), P2에서 단계를 (149.99, 100) 하나로(본전가 149.83…)
     * @when 포지션 요약 아래를 본다
     * @then 리스크 문구가 표시되지 않는다
     */
    it("[EC-29] 마지막 진입가가 본전가보다 수익 쪽이 아니면 리스크 문구가 표시되지 않는다", async () => {
      const samples: { which: Case; price: string }[] = [
        { which: "P1", price: "1901" },
        { which: "P2", price: "149.99" },
      ];
      for (const sample of samples) {
        const { user, unmount } = await openCase(sample.which);
        await removeStep(user, 2);
        await typeInto(user, "1차 추가 진입가", sample.price);
        await typeInto(user, "1차 재투입 비율", "100");
        // 전제: 남은 1차 단계는 제외되지 않았다(추가 진입 region에 제외 경고가 없다).
        expect(within(region("추가 진입")).queryByText(/제외/)).toBeNull();

        expect(screen.queryByText(RISK_NOTICE_FRAGMENT, { exact: false })).toBeNull();
        expectClean();
        unmount();
      }
    }, 60_000);
  });
});
