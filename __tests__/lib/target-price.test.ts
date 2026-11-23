import { describe, expect, it } from "vitest";

import { calculatePnl } from "@/lib/pnl";
import { calculateTargetPrice } from "@/lib/target-price";

// 기준 사례 (스펙 docs/specs/target-price.md §3 "DoD-6·DoD-7 기준 사례" 표). 값은 바꾸지 않고 옮긴다.
//
// | ID | 심볼    | 방향 | 레버리지 | 진입가  | 목표 ROE | 원값 목표가    | 목표가   |
// | T1 | BTCUSDT | 롱   | 10       | 65000   | 34.62    | 67250.3        | 67250.3  |
// | T2 | BTCUSDT | 숏   | 20       | 98765.4 | -24.99   | 99999.473673   | 99999.4  |
// | T3 | ETHUSDT | 롱   | 25       | 3456.78 | -178.07  | 3210.56047416  | 3210.57  |
// | T4 | ETHUSDT | 숏   | 5        | 2500    | 30.86    | 2345.7         | 2345.7   |
// | T5 | SOLUSDT | 롱   | 15       | 150.12  | 0        | 150.12         | 150.12   |
// | T6 | SOLUSDT | 숏   | 3        | 142.5   | 22.35    | 131.88375      | 131.88   |
//
// 심볼 tickSize: BTCUSDT 0.1, ETHUSDT 0.01, SOLUSDT 0.01.

type Side = "long" | "short";

/** DoD-1·DoD-2에서 원값을 그대로 관찰하기 위한 충분히 작은 틱 */
const RAW_TICK = 1e-8;

type RawSample = {
  id: string;
  entryPrice: number;
  leverage: number;
  targetRoe: number;
  /** 손계산 원값 목표가 */
  expected: number;
};

// DoD-1 롱 원값 표본: ROE 양수 T1, 음수 T3, 0 T5
const RAW_LONG: readonly RawSample[] = [
  { id: "T1", entryPrice: 65000, leverage: 10, targetRoe: 34.62, expected: 67250.3 },
  { id: "T3", entryPrice: 3456.78, leverage: 25, targetRoe: -178.07, expected: 3210.56047416 },
  { id: "T5", entryPrice: 150.12, leverage: 15, targetRoe: 0, expected: 150.12 },
];

// DoD-2 숏 원값 표본: ROE 음수 T2, 양수 T4, 양수 T6
const RAW_SHORT: readonly RawSample[] = [
  { id: "T2", entryPrice: 98765.4, leverage: 20, targetRoe: -24.99, expected: 99999.473673 },
  { id: "T4", entryPrice: 2500, leverage: 5, targetRoe: 30.86, expected: 2345.7 },
  { id: "T6", entryPrice: 142.5, leverage: 3, targetRoe: 22.35, expected: 131.88375 },
];

type TickSample = {
  label: string;
  tickSize: number;
  entryPrice: number;
  leverage: number;
  targetRoe: number;
  /** 손계산 틱 맞춤 목표가 */
  expected: number;
  /** 반대 방향·가장 가까운 틱으로 맞췄을 때의 틀린 값 */
  wrong: number;
};

// DoD-3·EC-4 롱 올림 표본(골격 given 순서)
const LONG_UP: readonly TickSample[] = [
  {
    label: "ROE 양수 22.35 (원값 153.11625)",
    tickSize: 0.01,
    entryPrice: 142.5,
    leverage: 3,
    targetRoe: 22.35,
    expected: 153.12,
    wrong: 153.11,
  },
  {
    label: "ROE 양수 22.36 (원값 153.121)",
    tickSize: 0.01,
    entryPrice: 142.5,
    leverage: 3,
    targetRoe: 22.36,
    expected: 153.13,
    wrong: 153.12,
  },
  {
    label: "ROE 음수 T3 (원값 3210.56047416)",
    tickSize: 0.01,
    entryPrice: 3456.78,
    leverage: 25,
    targetRoe: -178.07,
    expected: 3210.57,
    wrong: 3210.56,
  },
  {
    label: "ROE 0 EC-4 (원값 150.125)",
    tickSize: 0.01,
    entryPrice: 150.125,
    leverage: 15,
    targetRoe: 0,
    expected: 150.13,
    wrong: 150.12,
  },
];

// DoD-4·EC-4 숏 내림 표본(골격 given 순서, 마지막이 허용치 경계 T4)
const SHORT_DOWN: readonly TickSample[] = [
  {
    label: "ROE 양수 T6 (원값 131.88375)",
    tickSize: 0.01,
    entryPrice: 142.5,
    leverage: 3,
    targetRoe: 22.35,
    expected: 131.88,
    wrong: 131.89,
  },
  {
    label: "ROE 양수 22.36 (원값 131.879)",
    tickSize: 0.01,
    entryPrice: 142.5,
    leverage: 3,
    targetRoe: 22.36,
    expected: 131.87,
    wrong: 131.88,
  },
  {
    label: "ROE 음수 T2 (원값 99999.473673)",
    tickSize: 0.1,
    entryPrice: 98765.4,
    leverage: 20,
    targetRoe: -24.99,
    expected: 99999.4,
    wrong: 99999.5,
  },
  {
    label: "ROE 0 EC-4 (원값 150.125)",
    tickSize: 0.01,
    entryPrice: 150.125,
    leverage: 15,
    targetRoe: 0,
    expected: 150.12,
    wrong: 150.13,
  },
  {
    // 허용치 경계: JS에서 2345.7 ÷ 0.01 = 234569.99999999997
    label: "허용치 경계 T4 (원값 2345.7)",
    tickSize: 0.01,
    entryPrice: 2500,
    leverage: 5,
    targetRoe: 30.86,
    expected: 2345.7,
    wrong: 2345.69,
  },
];

type ReferenceCase = {
  id: string;
  side: Side;
  tickSize: number;
  leverage: number;
  entryPrice: number;
  targetRoe: number;
  /** 표의 목표가(손계산 리터럴) */
  targetPrice: number;
  /** F-1 C1~C6의 수량 */
  qty: number;
};

// 스펙 §3 DoD-6·DoD-7 기준 사례 표(롱 = long, 숏 = short)
const REFERENCE_CASES: readonly ReferenceCase[] = [
  {
    id: "T1",
    side: "long",
    tickSize: 0.1,
    leverage: 10,
    entryPrice: 65000,
    targetRoe: 34.62,
    targetPrice: 67250.3,
    qty: 0.12,
  },
  {
    id: "T2",
    side: "short",
    tickSize: 0.1,
    leverage: 20,
    entryPrice: 98765.4,
    targetRoe: -24.99,
    targetPrice: 99999.4,
    qty: 0.042,
  },
  {
    id: "T3",
    side: "long",
    tickSize: 0.01,
    leverage: 25,
    entryPrice: 3456.78,
    targetRoe: -178.07,
    targetPrice: 3210.57,
    qty: 1.37,
  },
  {
    id: "T4",
    side: "short",
    tickSize: 0.01,
    leverage: 5,
    entryPrice: 2500,
    targetRoe: 30.86,
    targetPrice: 2345.7,
    qty: 2.5,
  },
  {
    id: "T5",
    side: "long",
    tickSize: 0.01,
    leverage: 15,
    entryPrice: 150.12,
    targetRoe: 0,
    targetPrice: 150.12,
    qty: 12.3,
  },
  {
    id: "T6",
    side: "short",
    tickSize: 0.01,
    leverage: 3,
    entryPrice: 142.5,
    targetRoe: 22.35,
    targetPrice: 131.88,
    qty: 40,
  },
];

describe("목표가 계산 — 목표 ROE 이상이 되는 틱 단위 목표가와 진입가 대비 가격 변동률을 얻는다", () => {
  describe("틱에 맞추기 전 원값 목표가", () => {
    /**
     * @spec DoD-1
     * @given 롱 표본을 tickSize 1e-8로 하나씩 넣는다: 목표 ROE 양수 T1 (진입 65000, 10x, 34.62) → 67250.3, 음수 T3 (진입 3456.78, 25x, −178.07) → 3210.56047416, 0 T5 (진입 150.12, 15x, 0) → 150.12 (손계산 리터럴)
     * @when 목표가를 계산한다
     * @then targetPrice가 진입가 × (1 + 목표 ROE ÷ (100 × 레버리지))의 손계산 리터럴(67250.3, 3210.56047416, 150.12)과 === 비교로 정확히 같다
     */
    it.each(RAW_LONG)(
      "[DoD-1] 롱 원값 목표가는 진입가 × (1 + 목표 ROE ÷ (100 × 레버리지))다",
      ({ id, entryPrice, leverage, targetRoe, expected }) => {
        const result = calculateTargetPrice({
          side: "long",
          leverage,
          entryPrice,
          targetRoe,
          tickSize: RAW_TICK,
        });
        expect(result.targetPrice, `${id}`).toBe(expected);
      },
    );

    /**
     * @spec DoD-2
     * @given 숏 표본을 tickSize 1e-8로 하나씩 넣는다: 목표 ROE 음수 T2 (진입 98765.4, 20x, −24.99) → 99999.473673, 양수 T4 (진입 2500, 5x, 30.86) → 2345.7, 양수 T6 (진입 142.5, 3x, 22.35) → 131.88375 (손계산 리터럴)
     * @when 목표가를 계산한다
     * @then targetPrice가 진입가 × (1 − 목표 ROE ÷ (100 × 레버리지))의 손계산 리터럴(99999.473673, 2345.7, 131.88375)과 === 비교로 정확히 같다
     */
    it.each(RAW_SHORT)(
      "[DoD-2] 숏 원값 목표가는 진입가 × (1 − 목표 ROE ÷ (100 × 레버리지))다",
      ({ id, entryPrice, leverage, targetRoe, expected }) => {
        const result = calculateTargetPrice({
          side: "short",
          leverage,
          entryPrice,
          targetRoe,
          tickSize: RAW_TICK,
        });
        expect(result.targetPrice, `${id}`).toBe(expected);
      },
    );
  });

  describe("틱에 맞춘 목표가", () => {
    /**
     * @spec DoD-3 EC-4
     * @given 원값이 틱의 배수가 아닌 롱 표본을 하나씩 넣는다: 목표 ROE 양수 (SOLUSDT 틱 0.01, 진입 142.5, 3x, 22.35) 원값 153.11625 → 153.12, 양수 (SOLUSDT 틱 0.01, 진입 142.5, 3x, 22.36) 원값 153.121 → 153.13(가장 가까운 틱이면 153.12), 음수 T3 (ETHUSDT 틱 0.01, 진입 3456.78, 25x, −178.07) 원값 3210.56047416 → 3210.57, 0이고 진입가가 틱의 배수가 아닌 EC-4 표본 (SOLUSDT 틱 0.01, 진입 150.125, 15x, 0) 원값 150.125 → 150.13 (T3는 DoD-6 기준 사례 표의 행을 같은 tickSize·기대값으로 공유하며, 이 case는 목표 ROE 부호별 올림 방향을 보는 목적이다)
     * @when 목표가를 계산한다
     * @then targetPrice가 원값 이상인 틱의 배수 중 가장 작은 값(올림)인 손계산 리터럴(표본 순서대로 153.12, 153.13, 3210.57, 150.13)과 === 비교로 같다
     * @then 목표 ROE의 부호(양수·음수·0)와 무관하게 올림이며 내림·가장 가까운 틱이 아니다(표본 순서대로 153.11, 153.12, 3210.56, 150.12가 아니다)
     */
    it.each(LONG_UP)(
      "[DoD-3][EC-4] 롱 targetPrice는 목표 ROE의 부호와 무관하게 원값을 틱 단위로 올린 값이다",
      ({ label, tickSize, entryPrice, leverage, targetRoe, expected, wrong }) => {
        const result = calculateTargetPrice({
          side: "long",
          leverage,
          entryPrice,
          targetRoe,
          tickSize,
        });
        expect(result.targetPrice, `${label}`).toBe(expected);
        expect(result.targetPrice, `${label}`).not.toBe(wrong);
      },
    );

    /**
     * @spec DoD-4 EC-4
     * @given 숏 표본을 하나씩 넣는다: 원값이 틱의 배수가 아닌 목표 ROE 양수 T6 (SOLUSDT 틱 0.01, 진입 142.5, 3x, 22.35) 원값 131.88375 → 131.88, 양수 (SOLUSDT 틱 0.01, 진입 142.5, 3x, 22.36) 원값 131.879 → 131.87(가장 가까운 틱이면 131.88), 음수 T2 (BTCUSDT 틱 0.1, 진입 98765.4, 20x, −24.99) 원값 99999.473673 → 99999.4, 0이고 진입가가 틱의 배수가 아닌 EC-4 표본 (SOLUSDT 틱 0.01, 진입 150.125, 15x, 0) 원값 150.125 → 150.12 / 허용치 경계 T4 (ETHUSDT 틱 0.01, 진입 2500, 5x, 30.86) 원값 2345.7(JS에서 2345.7 ÷ 0.01 = 234569.99999999997) → 2345.7 (T2·T4·T6은 DoD-6 기준 사례 표의 행을 같은 tickSize·기대값으로 공유하며, 이 case는 목표 ROE 부호별 내림 방향과 T4 허용치 경계를 보는 목적이다)
     * @when 목표가를 계산한다
     * @then targetPrice가 원값 이하인 틱의 배수 중 가장 큰 값(내림)인 손계산 리터럴(표본 순서대로 131.88, 131.87, 99999.4, 150.12, 2345.7)과 === 비교로 같다
     * @then 목표 ROE의 부호(양수·음수·0)와 무관하게 내림이며 올림·가장 가까운 틱이 아니다(표본 순서대로 131.89, 131.88, 99999.5, 150.13이 아니다)
     * @then 허용치 경계 T4는 부동소수점 오차로 한 틱 아래로 떨어지지 않는다(2345.69가 아니다)
     */
    it.each(SHORT_DOWN)(
      "[DoD-4][EC-4] 숏 targetPrice는 목표 ROE의 부호와 무관하게 원값을 틱 단위로 내린 값이다",
      ({ label, tickSize, entryPrice, leverage, targetRoe, expected, wrong }) => {
        const result = calculateTargetPrice({
          side: "short",
          leverage,
          entryPrice,
          targetRoe,
          tickSize,
        });
        expect(result.targetPrice, `${label}`).toBe(expected);
        expect(result.targetPrice, `${label}`).not.toBe(wrong);
      },
    );
  });

  describe("가격 변동률", () => {
    /**
     * @spec DoD-5
     * @given 원값과 틱에 맞춘 목표가가 다른 표본을 하나씩 넣는다: T2 (BTCUSDT 틱 0.1, 숏 20x, 진입 98765.4, −24.99, targetPrice 99999.4) → 1234 ÷ 98765.4 × 100 = 1.249425406063257, T3 (ETHUSDT 틱 0.01, 롱 25x, 진입 3456.78, −178.07, targetPrice 3210.57) → −246.21 ÷ 3456.78 × 100 = −7.122524430250117
     * @when 목표가를 계산한다
     * @then priceChangePercent가 (targetPrice − 진입가) ÷ 진입가 × 100의 손계산 리터럴(1.249425406063257, −7.122524430250117)과 상대 오차 1e-12 이내로 같다(|실제 − 기대| ≤ 1e-12 × |기대|)
     * @then T2 값은 소수 둘째 자리로 반올림한 1.25가 아니다(반올림하지 않은 값)
     * @then T3 값은 원값 목표가 기준의 −7.1228이 아니다(targetPrice 기준)
     * @then 가격이 오르는 T2는 양수, 내리는 T3는 음수다
     */
    it("[DoD-5] 가격 변동률은 틱에 맞춘 targetPrice 기준의 반올림하지 않은 값이다", () => {
      // T2: 숏, 가격이 오른다. 1234 ÷ 98765.4 × 100
      const t2 = calculateTargetPrice({
        side: "short",
        leverage: 20,
        entryPrice: 98765.4,
        targetRoe: -24.99,
        tickSize: 0.1,
      });
      // T3: 롱, 가격이 내린다. −246.21 ÷ 3456.78 × 100
      const t3 = calculateTargetPrice({
        side: "long",
        leverage: 25,
        entryPrice: 3456.78,
        targetRoe: -178.07,
        tickSize: 0.01,
      });

      const t2Expected = 1.249425406063257;
      const t3Expected = -7.122524430250117;
      expect(t2.priceChangePercent, "T2").not.toBeNull();
      expect(t3.priceChangePercent, "T3").not.toBeNull();
      const t2Actual = t2.priceChangePercent as number;
      const t3Actual = t3.priceChangePercent as number;

      // 상대 오차 1e-12 이내
      expect(Math.abs(t2Actual - t2Expected), "T2").toBeLessThanOrEqual(
        1e-12 * Math.abs(t2Expected),
      );
      expect(Math.abs(t3Actual - t3Expected), "T3").toBeLessThanOrEqual(
        1e-12 * Math.abs(t3Expected),
      );

      // 반올림하지 않은 값(T2), targetPrice 기준(T3)
      expect(t2Actual, "T2").not.toBe(1.25);
      expect(t3Actual, "T3").not.toBe(-7.1228);

      // 오르면 양수, 내리면 음수
      expect(t2Actual, "T2").toBeGreaterThan(0);
      expect(t3Actual, "T3").toBeLessThan(0);
    });
  });

  describe("기준 사례", () => {
    /**
     * @spec DoD-6
     * @given 기준 사례 T1~T6을 각 심볼의 tickSize(BTCUSDT 0.1, ETHUSDT·SOLUSDT 0.01)로 하나씩 넣는다: T1 → 67250.3, T2 → 99999.4, T3 → 3210.57, T4 → 2345.7, T5 → 150.12, T6 → 131.88
     * @when 목표가를 계산한다
     * @then targetPrice가 표의 목표가 손계산 리터럴과 === 비교로 같다
     */
    it.each(REFERENCE_CASES)(
      "[DoD-6] 기준 사례 T1~T6의 targetPrice는 표의 목표가와 같다",
      ({ id, side, tickSize, leverage, entryPrice, targetRoe, targetPrice }) => {
        const result = calculateTargetPrice({ side, leverage, entryPrice, targetRoe, tickSize });
        expect(result.targetPrice, `${id}`).toBe(targetPrice);
      },
    );

    /**
     * @spec DoD-7
     * @given 기준 사례 T1~T6 각 사례 입력(심볼 tickSize 포함)으로 목표가 계산을 실제로 호출해 얻은 targetPrice(기대 리터럴 67250.3, 99999.4, 3210.57, 2345.7, 150.12, 131.88)를 종료가로, 같은 방향·레버리지·진입가와 두 수량(F-1 C1~C6의 수량 0.12·0.042·1.37·2.5·12.3·40 각각, 그리고 1)을 F-1 손익 계산에 mock 없이 넣는다
     * @when 손익 계산의 ROE를 구한다
     * @then 모든 사례·수량에서 roe가 그 사례의 목표 ROE(34.62, −24.99, −178.07, 30.86, 0, 22.35) 이상이다
     */
    it.each(REFERENCE_CASES)(
      "[DoD-7] 기준 사례의 targetPrice에서 종료하면 ROE가 목표 ROE 이상이다",
      ({ id, side, tickSize, leverage, entryPrice, targetRoe, targetPrice, qty }) => {
        const { targetPrice: exitPrice } = calculateTargetPrice({
          side,
          leverage,
          entryPrice,
          targetRoe,
          tickSize,
        });
        expect(exitPrice, `${id}`).toBe(targetPrice);

        for (const q of [qty, 1]) {
          const { roe } = calculatePnl({ side, leverage, entryPrice, exitPrice, qty: q });
          expect(roe, `${id} 수량 ${q}`).not.toBeNull();
          // 허용 오차 없는 >=
          expect(roe as number, `${id} 수량 ${q}`).toBeGreaterThanOrEqual(targetRoe);
        }
      },
    );
  });

  describe("계산할 수 없는 입력", () => {
    /**
     * @spec EC-2
     * @given 목표 ROE가 없는(null — 입력란의 빈 값·`-`·`.`·`-.`) 상태로 롱·숏 각각 나머지는 유효한 T1 입력(BTCUSDT 틱 0.1, 10x, 진입 65000)을 넣는다
     * @when 목표가를 계산한다
     * @then targetPrice가 null이다
     * @then priceChangePercent가 null이다
     */
    it.each<Side>(["long", "short"])(
      "[EC-2] 목표 ROE가 없으면 목표가와 가격 변동률이 모두 null이다",
      (side) => {
        const result = calculateTargetPrice({
          side,
          leverage: 10,
          entryPrice: 65000,
          targetRoe: null,
          tickSize: 0.1,
        });
        expect(result.targetPrice, `${side}`).toBeNull();
        expect(result.priceChangePercent, `${side}`).toBeNull();
      },
    );

    /**
     * @spec EC-3
     * @given 나머지는 유효한 T1 입력(BTCUSDT 틱 0.1, 롱, 10x, 진입 65000, 목표 ROE 34.62)에서 한 값만 바꾼 표본을 하나씩 넣는다: 진입가 null(빈 값·`.`), 진입가 0, 레버리지 0(빈 값·0)
     * @when 목표가를 계산한다
     * @then targetPrice가 null이다
     * @then priceChangePercent가 null이다
     */
    it.each<{ label: string; entryPrice: number | null; leverage: number }>([
      // 진입가 빈 값·`.`은 null로 넘어온다
      { label: "진입가 null", entryPrice: null, leverage: 10 },
      { label: "진입가 0", entryPrice: 0, leverage: 10 },
      // 레버리지 빈 값은 컴포넌트가 0으로 넘긴다(계획 1장)
      { label: "레버리지 0", entryPrice: 65000, leverage: 0 },
    ])(
      "[EC-3] 진입가가 없거나 0이거나 레버리지가 0이면 목표가와 가격 변동률이 모두 null이다",
      ({ label, entryPrice, leverage }) => {
        const result = calculateTargetPrice({
          side: "long",
          leverage,
          entryPrice,
          targetRoe: 34.62,
          tickSize: 0.1,
        });
        expect(result.targetPrice, `${label}`).toBeNull();
        expect(result.priceChangePercent, `${label}`).toBeNull();
      },
    );
  });

  describe("목표 ROE가 0인 경우", () => {
    /**
     * @spec EC-4
     * @given 진입가가 틱의 배수인 T5 입력(SOLUSDT 틱 0.01, 15x, 진입 150.12, 목표 ROE 0)을 롱·숏 각각 넣는다 (롱은 DoD-6 기준 사례 표의 T5 행을 같은 tickSize·기대값으로 공유하며, 이 case는 EC-4 규칙(틱 배수 진입가 + 목표 ROE 0 → 진입가 그대로, 변동률 0)을 보는 목적이다)
     * @when 목표가를 계산한다
     * @then targetPrice가 진입가 150.12와 === 비교로 같다
     * @then priceChangePercent가 0이다
     */
    it.each<Side>(["long", "short"])(
      "[EC-4] 진입가가 틱의 배수이고 목표 ROE가 0이면 목표가는 진입가와 같고 가격 변동률은 0이다",
      (side) => {
        const result = calculateTargetPrice({
          side,
          leverage: 15,
          entryPrice: 150.12,
          targetRoe: 0,
          tickSize: 0.01,
        });
        expect(result.targetPrice, `${side}`).toBe(150.12);
        expect(result.priceChangePercent, `${side}`).toBe(0);
      },
    );
  });

  describe("가격이 없는 목표 ROE", () => {
    /**
     * @spec EC-6
     * @given 틱에 맞춘 목표가가 0 이하가 되는 표본을 하나씩 넣는다: 원값 정확히 0 — 숏 (BTCUSDT 틱 0.1, 10x, 진입 65000, 1000), 롱 (BTCUSDT 틱 0.1, 10x, 진입 65000, −1000) / 원값 음수 −65000 — 숏 (BTCUSDT 틱 0.1, 10x, 진입 65000, 2000), 롱 (BTCUSDT 틱 0.1, 10x, 진입 65000, −2000) / 원값이 틱 미만 양수 0.001 — 숏 (SOLUSDT 틱 0.01, 10x, 진입 100, 999.99)이 내림으로 0
     * @when 목표가를 계산한다
     * @then targetPrice가 null이다
     * @then priceChangePercent가 null이다
     */
    it.each<{
      label: string;
      side: Side;
      tickSize: number;
      leverage: number;
      entryPrice: number;
      targetRoe: number;
    }>([
      // 원값 정확히 0
      {
        label: "원값 0 숏",
        side: "short",
        tickSize: 0.1,
        leverage: 10,
        entryPrice: 65000,
        targetRoe: 1000,
      },
      {
        label: "원값 0 롱",
        side: "long",
        tickSize: 0.1,
        leverage: 10,
        entryPrice: 65000,
        targetRoe: -1000,
      },
      // 원값 음수 −65000
      {
        label: "원값 음수 숏",
        side: "short",
        tickSize: 0.1,
        leverage: 10,
        entryPrice: 65000,
        targetRoe: 2000,
      },
      {
        label: "원값 음수 롱",
        side: "long",
        tickSize: 0.1,
        leverage: 10,
        entryPrice: 65000,
        targetRoe: -2000,
      },
      // 원값 0.001(틱 미만 양수)이 숏 내림으로 0
      {
        label: "원값 틱 미만 양수 숏",
        side: "short",
        tickSize: 0.01,
        leverage: 10,
        entryPrice: 100,
        targetRoe: 999.99,
      },
    ])(
      "[EC-6] 틱에 맞춘 목표가가 0 이하이면 목표가와 가격 변동률이 모두 null이다",
      ({ label, side, tickSize, leverage, entryPrice, targetRoe }) => {
        const result = calculateTargetPrice({ side, leverage, entryPrice, targetRoe, tickSize });
        expect(result.targetPrice, `${label}`).toBeNull();
        expect(result.priceChangePercent, `${label}`).toBeNull();
      },
    );
  });
});
