import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

// 골격: 스펙 docs/specs/average-entry.md (F-5 평균 진입가)의 DoD-20.
// 홈 페이지(`/`)를 렌더해 평균 진입가 탭 등록을 본다(테스트마다 새로 렌더, cleanup으로 DOM을 비운다).
// 최대 수량 탭(F-4)의 병합 여부·순서와 무관하게 판정한다.
// 탭 패널은 탭 id가 등록된 뒤 이름이 붙으므로 자동 재시도 조회로 찾는다.

/** 탭 목록의 탭 이름(화면 순서). */
function tabNames(): (string | null)[] {
  return within(screen.getByRole("tablist"))
    .getAllByRole("tab")
    .map((tab) => tab.textContent);
}

describe("계산기 탭 화면 — 마지막 탭에서 평균 진입가 계산기를 연다", () => {
  describe("평균 진입가 탭은 탭 목록의 마지막에 있다", () => {
    /**
     * @spec DoD-20
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더한다
     * @when 아무 조작도 하지 않은 첫 화면의 탭 목록을 본다
     * @then 탭 목록에 이름이 `평균 진입가`인 탭이 있고 탭 목록의 마지막 탭이다
     * @then `평균 진입가` 탭은 `청산가` 탭보다 뒤에 온다(최대 수량 탭의 유무·위치와 무관하게 판정한다)
     */
    it("[DoD-20] 평균 진입가 탭은 마지막 탭이고 청산가 탭보다 뒤에 온다", async () => {
      render(<Home />);

      expect(screen.getByRole("tab", { name: "평균 진입가" })).toBeDefined();
      const names = tabNames();
      const averageIndex = names.indexOf("평균 진입가");
      expect(averageIndex).toBe(names.length - 1);
      const liquidationIndex = names.indexOf("청산가");
      expect(liquidationIndex).toBeGreaterThanOrEqual(0);
      expect(averageIndex).toBeGreaterThan(liquidationIndex);
    });
  });

  describe("평균 진입가 탭을 고르면 평균 진입가 탭 패널에 평균 진입가 계산기가 보인다", () => {
    /**
     * @spec DoD-20
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더한 첫 화면이다
     * @when `평균 진입가` 탭을 누른다
     * @then `평균 진입가` 탭이 선택돼 있다
     * @then 이름이 `평균 진입가`인 탭 패널이 보인다
     * @then 그 탭 패널 안에 이름이 `평균 진입가 입력`·`평균 진입가 결과`인 영역이 있다
     */
    it("[DoD-20] 평균 진입가 탭을 고르면 이름이 평균 진입가인 탭 패널에 평균 진입가 입력·결과 카드가 보인다", async () => {
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("tab", { name: "평균 진입가" }));

      expect(screen.getByRole("tab", { name: "평균 진입가" }).getAttribute("aria-selected")).toBe(
        "true",
      );
      const panel = await screen.findByRole("tabpanel", { name: "평균 진입가" });
      expect(panel.hidden).toBe(false);
      expect(within(panel).getByRole("region", { name: "평균 진입가 입력" })).toBeDefined();
      expect(within(panel).getByRole("region", { name: "평균 진입가 결과" })).toBeDefined();
    });
  });
});
