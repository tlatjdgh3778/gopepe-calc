import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import Page from "@/app/page";

// 홈 페이지(`/`)를 렌더해 목표가 탭 등록을 본다.
// 결과 라벨 `목표가`가 탭·탭 패널 이름과 겹치므로 결과는 `목표가 결과` 영역 범위에서 찾는다.
// 탭 패널은 탭 id가 등록된 뒤 이름이 붙으므로 자동 재시도 조회로 찾는다.

describe("계산기 탭 화면 — 손익 다음 탭에서 목표가 계산기를 연다", () => {
  describe("목표가 탭은 손익 탭 바로 다음에 있다", () => {
    /**
     * @spec DoD-14
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더링한다
     * @when 아무 조작도 하지 않은 첫 화면의 탭 목록을 본다
     * @then 탭 목록에 이름이 `목표가`인 탭이 있다
     * @then 탭 목록의 순서에서 `목표가` 탭은 `손익` 탭 바로 다음이다
     */
    it("[DoD-14] 탭 목록에서 목표가 탭이 손익 탭 바로 다음에 온다", async () => {
      render(<Page />);

      expect(screen.getByRole("tab", { name: "목표가" })).toBeDefined();
      const names = within(screen.getByRole("tablist"))
        .getAllByRole("tab")
        .map((tab) => tab.textContent);
      const pnlIndex = names.indexOf("손익");
      expect(pnlIndex).toBeGreaterThanOrEqual(0);
      expect(names[pnlIndex + 1]).toBe("목표가");
    });
  });

  describe("목표가 탭을 고르면 목표가 탭 패널에 목표가 계산기가 보인다", () => {
    /**
     * @spec DoD-14
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더링한 첫 화면이다
     * @when `목표가` 탭을 누른다
     * @then `목표가` 탭이 선택돼 있다
     * @then 이름이 `목표가`인 탭 패널이 보인다
     * @then 그 탭 패널 안에 이름이 `목표가 입력`·`목표가 결과`인 영역이 있다
     */
    it("[DoD-14] 목표가 탭을 고르면 이름이 목표가인 탭 패널에 목표가 입력·목표가 결과 카드가 보인다", async () => {
      const user = userEvent.setup();
      render(<Page />);

      await user.click(screen.getByRole("tab", { name: "목표가" }));

      expect(screen.getByRole("tab", { name: "목표가" }).getAttribute("aria-selected")).toBe(
        "true",
      );
      const panel = await screen.findByRole("tabpanel", { name: "목표가" });
      expect(panel.hidden).toBe(false);
      expect(within(panel).getByRole("region", { name: "목표가 입력" })).toBeDefined();
      expect(within(panel).getByRole("region", { name: "목표가 결과" })).toBeDefined();
    });
  });
});
