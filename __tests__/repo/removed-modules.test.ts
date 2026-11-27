// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** 저장소 루트. 이 파일은 `__tests__/repo/` 아래에 있다. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 스펙 DoD-42의 삭제 대상(계획 T-4 수정 대상의 삭제 목록과 같다). */
const REMOVED_PATHS = [
  "components/pnl-calculator.tsx",
  "components/target-price-calculator.tsx",
  "components/liquidation-calculator.tsx",
  "components/max-quantity-calculator.tsx",
  "components/average-entry-calculator.tsx",
  "components/calculator-tabs.tsx",
  "components/calculator-layout.tsx",
  "components/fields/leverage-field.tsx",
  "__tests__/components/average-entry-calculator.test.tsx",
  "__tests__/components/average-entry-tabs.test.tsx",
  "__tests__/components/calculator-tabs.test.tsx",
  "__tests__/components/liquidation-calculator.test.tsx",
  "__tests__/components/liquidation-warnings.test.tsx",
  "__tests__/components/max-quantity-calculator.test.tsx",
  "__tests__/components/max-quantity-tabs.test.tsx",
  "__tests__/components/pnl-calculator.test.tsx",
  "__tests__/components/pnl-validation.test.tsx",
  "__tests__/components/target-price-calculator.test.tsx",
  "__tests__/components/target-price-tabs.test.tsx",
  "e2e/average-entry-calculator.spec.ts",
  "e2e/calculator-tabs.spec.ts",
  "e2e/liquidation-calculator.spec.ts",
  "e2e/max-quantity-calculator.spec.ts",
  "e2e/pnl-calculator.spec.ts",
  "e2e/target-price-calculator.spec.ts",
  "__tests__/repo/page-slots.test.ts",
] as const;

describe("정리 — 탭형 계산기 화면 자산이 저장소에서 사라진다", () => {
  describe("삭제 대상 파일이 없다", () => {
    /**
     * @spec DoD-42
     * @given 저장소 루트 기준 경로 목록을 하나씩 확인한다(파일을 만들거나 고치지 않는다). 표본은 기존 계산기 컴포넌트 5개(components/pnl-calculator.tsx, components/target-price-calculator.tsx, components/liquidation-calculator.tsx, components/max-quantity-calculator.tsx, components/average-entry-calculator.tsx), components/calculator-tabs.tsx, components/calculator-layout.tsx, components/fields/leverage-field.tsx, 그 컴포넌트 테스트(__tests__/components/의 average-entry-calculator.test.tsx, average-entry-tabs.test.tsx, calculator-tabs.test.tsx, liquidation-calculator.test.tsx, liquidation-warnings.test.tsx, max-quantity-calculator.test.tsx, max-quantity-tabs.test.tsx, pnl-calculator.test.tsx, pnl-validation.test.tsx, target-price-calculator.test.tsx, target-price-tabs.test.tsx), 탭 의존 E2E 6개(e2e/의 average-entry-calculator.spec.ts, calculator-tabs.spec.ts, liquidation-calculator.spec.ts, max-quantity-calculator.spec.ts, pnl-calculator.spec.ts, target-price-calculator.spec.ts), __tests__/repo/page-slots.test.ts다
     * @when 각 경로가 저장소에 있는지 확인한다
     * @then 표본의 어느 경로도 저장소에 없다
     */
    it("[DoD-42] 기존 계산기 컴포넌트 5개, 탭·레이아웃·레버리지 필드, 그 컴포넌트 테스트, 탭 의존 E2E 6개, page-slots 원문 검사가 저장소에 없다", () => {
      expect(REMOVED_PATHS).toHaveLength(26);

      const present = REMOVED_PATHS.filter((relative) => existsSync(join(ROOT, relative)));
      expect(present, "저장소에 남아 있는 삭제 대상 경로").toEqual([]);
    });
  });
});
