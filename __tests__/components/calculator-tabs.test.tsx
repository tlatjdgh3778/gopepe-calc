import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import Page from "@/app/page";
import { CalculatorTabs } from "@/components/calculator-tabs";

// 탭 패널은 탭 id가 등록된 뒤 이름이 붙으므로 자동 재시도 조회(findByRole)로 찾는다.

/**
 * 테스트 픽스처(mock 아님): 입력란 하나와 그 입력값에서 나온 결과 표시 하나를 가진 더미 계산기.
 * 입력값은 자기 내부 상태로만 갖는다. unmount되면 상태가 사라져 결과가 `—`로 돌아간다.
 */
function DummyCalculator({ name }: { name: string }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <label>
        {`${name} 값`}
        <input type="text" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <output aria-label={`${name} 결과`}>
        {value === "" ? "—" : `${value.length}자: ${value}`}
      </output>
    </div>
  );
}

describe("계산기 탭 화면 — 한 화면에서 탭으로 계산기를 고르고, 탭을 오가도 입력과 결과가 남는다", () => {
  describe("처음 열면 손익 탭이 선택돼 손익 계산기가 보인다", () => {
    /**
     * @spec DoD-18
     * @given jsdom 환경에서 홈 페이지(`/`)를 렌더링한다
     * @when 아무 조작도 하지 않은 첫 화면을 본다
     * @then 탭 목록이 있다
     * @then 이름이 `손익`인 탭이 선택돼 있다
     * @then 이름이 `손익`인 탭 패널이 보인다
     * @then 그 탭 패널 안에 손익 계산기(`손익 입력`·`손익 결과` 영역)가 보인다
     */
    it("[DoD-18] 첫 화면에서 손익 탭이 선택돼 손익 탭 패널에 손익 계산기가 보인다", async () => {
      render(<Page />);

      expect(screen.getByRole("tablist")).toBeDefined();
      const tab = screen.getByRole("tab", { name: "손익" });
      expect(tab.getAttribute("aria-selected")).toBe("true");
      const panel = await screen.findByRole("tabpanel", { name: "손익" });
      expect(panel.hidden).toBe(false);
      expect(within(panel).getByRole("region", { name: "손익 입력" })).toBeDefined();
      expect(within(panel).getByRole("region", { name: "손익 결과" })).toBeDefined();
      expect(within(panel).getByRole("combobox", { name: "심볼" })).toBeDefined();
    });
  });

  describe("다른 탭으로 갔다가 돌아와도 이전 탭의 입력값과 결과가 그대로 남는다", () => {
    /**
     * @spec DoD-20
     * @given 테스트 픽스처인 더미 계산기 2개(각각 입력란 하나와 그 입력값에서 나온 결과 표시 하나)를 탭 이름 `더미 1`·`더미 2`로 탭 화면에 넣고 `더미 1`을 기본 탭으로 렌더링한다. 각 더미 계산기는 입력값을 자기 내부 상태로만 갖는다(탭 화면 밖이나 테스트 하니스에 상태를 두지 않는다)
     * @when `더미 1`에 값을 입력하고, `더미 2` 탭으로 가서 값을 입력한 뒤, `더미 1` 탭으로 돌아오고, 다시 `더미 2` 탭으로 간다
     * @then `더미 1`로 돌아왔을 때 `더미 1`의 입력란 값과 결과가 떠나기 전과 같다
     * @then `더미 2`로 다시 갔을 때 `더미 2`의 입력란 값과 결과가 떠나기 전과 같다
     */
    it("[DoD-20] 탭을 오가도 각 탭의 입력값과 결과가 그대로 남는다", async () => {
      const user = userEvent.setup();
      render(
        <CalculatorTabs
          defaultValue="dummy-1"
          items={[
            { value: "dummy-1", label: "더미 1", content: <DummyCalculator name="더미 1" /> },
            { value: "dummy-2", label: "더미 2", content: <DummyCalculator name="더미 2" /> },
          ]}
        />,
      );

      const panel1 = await screen.findByRole("tabpanel", { name: "더미 1" });
      await user.type(within(panel1).getByRole("textbox", { name: "더미 1 값" }), "abc");
      expect(within(panel1).getByRole("status", { name: "더미 1 결과" }).textContent).toBe(
        "3자: abc",
      );

      await user.click(screen.getByRole("tab", { name: "더미 2" }));
      const panel2 = await screen.findByRole("tabpanel", { name: "더미 2" });
      await user.type(within(panel2).getByRole("textbox", { name: "더미 2 값" }), "hello");
      expect(within(panel2).getByRole("status", { name: "더미 2 결과" }).textContent).toBe(
        "5자: hello",
      );

      await user.click(screen.getByRole("tab", { name: "더미 1" }));
      const backTo1 = await screen.findByRole("tabpanel", { name: "더미 1" });
      expect(
        (within(backTo1).getByRole("textbox", { name: "더미 1 값" }) as HTMLInputElement).value,
      ).toBe("abc");
      expect(within(backTo1).getByRole("status", { name: "더미 1 결과" }).textContent).toBe(
        "3자: abc",
      );

      await user.click(screen.getByRole("tab", { name: "더미 2" }));
      const backTo2 = await screen.findByRole("tabpanel", { name: "더미 2" });
      expect(
        (within(backTo2).getByRole("textbox", { name: "더미 2 값" }) as HTMLInputElement).value,
      ).toBe("hello");
      expect(within(backTo2).getByRole("status", { name: "더미 2 결과" }).textContent).toBe(
        "5자: hello",
      );
    });
  });
});
