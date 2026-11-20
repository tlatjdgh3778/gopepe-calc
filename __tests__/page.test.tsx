import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Page from "@/app/page";

/**
 * @spec DoD-2
 * @given jsdom 환경에서 홈 페이지 컴포넌트를 경로 별칭(`@/app/page`)으로 import한다
 * @when 홈 페이지를 렌더링한다
 * @then level 1 heading role을 가진 요소가 존재한다
 */
test("홈 페이지를 렌더링하면 level 1 heading이 있다", () => {
  render(<Page />);

  expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
});
