import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import Page from "@/app/page";

// 홈 페이지(`/`)를 렌더해 최대 수량 탭 등록을 본다.
// 탭 순서는 "청산가 바로 다음"만 판정하고 탭 개수·마지막 위치는 판정하지 않는다(병렬 F-5 병합 대비).
// 결과 라벨 `최대 수량`이 탭·탭 패널 이름과 겹치므로 카드는 이름 있는 영역으로 찾는다.
// 탭 패널은 탭 id가 등록된 뒤 이름이 붙으므로 자동 재시도 조회로 찾는다.
// 스펙 5장 불변식과 계획 T-5 완료 조건 (7): 모든 case에서 화면(텍스트·입력값)에 `NaN`·`Infinity`가 없고
// `console.error`가 호출되지 않는다(`vi.spyOn` 관찰만 허용).

let consoleErrorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  // 관찰만 한다. 원래 console.error 동작은 그대로 둔다(대체하지 않는다).
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

/** 화면 텍스트·입력값에 NaN·Infinity가 없고 콘솔 오류가 없다. */
function expectNoBrokenScreen() {
  expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  for (const input of screen.queryAllByRole("textbox") as HTMLInputElement[]) {
    expect(input.value).not.toMatch(/NaN|Infinity/);
  }
  expect(consoleErrorSpy).not.toHaveBeenCalled();
}

describe("계산기 탭 화면 — 청산가 다음 탭에서 최대 수량 계산기를 연다", () => {
  describe("최대 수량 탭은 청산가 탭 바로 다음에 있다", () => {
    /**
     * @spec DoD-12
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더링한다
     * @when 아무 조작도 하지 않은 첫 화면의 탭 목록을 본다
     * @then 탭 목록에 이름이 `최대 수량`인 탭이 있다
     * @then 탭 목록의 순서에서 `최대 수량` 탭은 `청산가` 탭 바로 다음이다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-12] 탭 목록에서 최대 수량 탭이 청산가 탭 바로 다음에 온다", async () => {
      render(<Page />);

      expect(screen.getByRole("tab", { name: "최대 수량" })).toBeDefined();
      const names = within(screen.getByRole("tablist"))
        .getAllByRole("tab")
        .map((tab) => tab.textContent);
      const liquidationIndex = names.indexOf("청산가");
      expect(liquidationIndex).toBeGreaterThanOrEqual(0);
      expect(names[liquidationIndex + 1]).toBe("최대 수량");
      expectNoBrokenScreen();
    });
  });

  describe("최대 수량 탭을 고르면 최대 수량 탭 패널에 최대 수량 계산기가 보인다", () => {
    /**
     * @spec DoD-12
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더링한 첫 화면이다
     * @when `최대 수량` 탭을 누른다
     * @then `최대 수량` 탭이 선택돼 있다
     * @then 이름이 `최대 수량`인 탭 패널이 보인다
     * @then 그 탭 패널 안에 이름이 `최대 수량 입력`·`최대 수량 결과`인 영역이 있다
     * @then 화면 텍스트와 입력값에 `NaN`·`Infinity`가 없다
     * @then `console.error`가 호출되지 않는다
     */
    it("[DoD-12] 최대 수량 탭을 고르면 이름이 최대 수량인 탭 패널에 최대 수량 입력·최대 수량 결과 카드가 보인다", async () => {
      const user = userEvent.setup();
      render(<Page />);

      await user.click(screen.getByRole("tab", { name: "최대 수량" }));

      expect(screen.getByRole("tab", { name: "최대 수량" }).getAttribute("aria-selected")).toBe(
        "true",
      );
      const panel = await screen.findByRole("tabpanel", { name: "최대 수량" });
      expect(panel.hidden).toBe(false);
      expect(within(panel).getByRole("region", { name: "최대 수량 입력" })).toBeDefined();
      expect(within(panel).getByRole("region", { name: "최대 수량 결과" })).toBeDefined();
      expectNoBrokenScreen();
    });
  });
});
