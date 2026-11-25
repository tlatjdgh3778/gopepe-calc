import { describe, expect, it } from "vitest";

import { maxQuantity } from "@/lib/max-quantity";

// 기준 사례 (스펙 docs/specs/max-quantity.md §3 "DoD-3·DoD-4·DoD-7~DoD-9 기준 사례" 표). 값은 바꾸지 않고 옮긴다.
//
// | ID | 심볼    | 레버리지 | 진입가  | 잔고 | 원값 수량  | 최대 수량 | 포지션 가치 |
// | M1 | BTCUSDT | 10       | 65000   | 1000 | 0.153846…  | 0.153     | 9945        |
// | M2 | BTCUSDT | 100      | 98765.4 | 5000 | 5.0625016… | 5.062     | 499950.4548 |
// | M3 | ETHUSDT | 25       | 3456.78 | 800  | 5.785731…  | 5.78      | 19980.1884  |
// | M4 | SOLUSDT | 5        | 142.5   | 100  | 3.508771…  | 3.5       | 498.75      |
// | M5 | BTCUSDT | 10       | 50000   | 500  | 0.1        | 0.1       | 5000        |
//
// 심볼 qtyStep·minOrderQty: BTCUSDT 0.001·0.001, ETHUSDT 0.01·0.01, SOLUSDT 0.1·0.1.

/** positionValue 비교 정밀도: toBeCloseTo(…, 6) → |차| < 5e-7 (테스트 설계 증거 "본문 단계 주의") */
const VALUE_DIGITS = 6;

type Step = { qtyStep: number; minOrderQty: number };

const BTC: Step = { qtyStep: 0.001, minOrderQty: 0.001 };
const ETH: Step = { qtyStep: 0.01, minOrderQty: 0.01 };
const SOL: Step = { qtyStep: 0.1, minOrderQty: 0.1 };

type QtySample = {
  id: string;
  step: Step;
  leverage: number;
  entryPrice: number;
  balance: number;
  /** 손계산 최대 수량 */
  qty: number;
  /** 손계산 포지션 가치(qty × 진입가, 반올림하지 않음) */
  positionValue: number;
  /** 부동소수점 하락 시 나오는 틀린 수량(S1만) */
  floorQty?: number;
};

// 기준 사례 M1~M5(스펙 표) + 표 밖 손계산 표본 S1·E1. 골격 @given 순서.
const QTY_SAMPLES: readonly QtySample[] = [
  {
    id: "M1",
    step: BTC,
    leverage: 10,
    entryPrice: 65000,
    balance: 1000,
    qty: 0.153,
    positionValue: 9945,
  },
  {
    id: "M2",
    step: BTC,
    leverage: 100,
    entryPrice: 98765.4,
    balance: 5000,
    qty: 5.062,
    positionValue: 499950.4548,
  },
  {
    id: "M3",
    step: ETH,
    leverage: 25,
    entryPrice: 3456.78,
    balance: 800,
    qty: 5.78,
    positionValue: 19980.1884,
  },
  {
    id: "M4",
    step: SOL,
    leverage: 5,
    entryPrice: 142.5,
    balance: 100,
    qty: 3.5,
    positionValue: 498.75,
  },
  {
    id: "M5",
    step: BTC,
    leverage: 10,
    entryPrice: 50000,
    balance: 500,
    qty: 0.1,
    positionValue: 5000,
  },
  // 원값 0.3, 0.3 ÷ 0.1 = 2.9999999999999996 → Math.floor 구현이면 0.2
  {
    id: "S1",
    step: SOL,
    leverage: 3,
    entryPrice: 100,
    balance: 10,
    qty: 0.3,
    positionValue: 30,
    floorQty: 0.2,
  },
  // 원값 20000 ÷ 3456.789 = 5.7857161660…, 5.78 × 3456.789 = 19980.24042
  {
    id: "E1",
    step: ETH,
    leverage: 25,
    entryPrice: 3456.789,
    balance: 800,
    qty: 5.78,
    positionValue: 19980.24042,
  },
];

type Inputs = { balance: number | null; leverage: number | null; entryPrice: number | null };

/** EC-2 기준 입력(M1) */
const M1_INPUTS = { balance: 1000, leverage: 10, entryPrice: 65000 } as const;

describe("최대 진입 수량 — 잔고로 열 수 있는 최대 수량(수량 단위로 내림)과 그 포지션 가치를 얻는다", () => {
  describe("최대 수량은 잔고 × 레버리지 ÷ 진입가를 수량 단위로 내린 값이고, 포지션 가치는 그 수량 × 진입가의 반올림하지 않은 값이다", () => {
    /**
     * @spec DoD-1 DoD-2 DoD-3 DoD-4
     * @given 기준 사례 M1~M5를 각 심볼의 qtyStep·minOrderQty로 하나씩 넣는다: M1 (BTCUSDT 0.001, 10x, 진입 65000, 잔고 1000) 원값 0.153846…, M2 (BTCUSDT 0.001, 100x, 진입 98765.4, 잔고 5000) 원값 5.0625016… — 소수 2자리로 자르지 않은 가치 표본, M3 (ETHUSDT 0.01, 25x, 진입 3456.78, 잔고 800) 원값 5.785731… — 부동소수점 오차가 생기는 가치 표본, M4 (SOLUSDT 0.1, 5x, 진입 142.5, 잔고 100) 원값 3.508771…, M5 (BTCUSDT 0.001, 10x, 진입 50000, 잔고 500) 원값 0.1 — 이미 qtyStep의 배수인 표본, 그리고 표 밖 손계산 표본 S1 (SOLUSDT 0.1, 3x, 진입 100, 잔고 10) 원값 0.3 — 배수인 원값의 단위 수가 부동소수점 오차로 정수 아래가 되는 표본(0.3 ÷ 0.1 = 2.9999999999999996), E1 (ETHUSDT 0.01, 25x, 진입 3456.789, 잔고 800) 원값 5.785716… — 소수 4자리를 넘는 가치 표본. 기대값은 손계산 리터럴이며 구현 함수로 만들지 않는다
     * @when 최대 수량을 계산한다
     * @then qty가 원값 이하인 qtyStep의 배수 중 가장 큰 값(내림)인 표의 최대 수량과 손계산 수량(표본 순서대로 0.153, 5.062, 5.78, 3.5, 0.1, 0.3, 5.78)과 같다
     * @then 배수인 원값의 단위 수가 부동소수점 오차로 정수 아래가 되는 표본(0.3/0.1)에서 qty가 0.2로 떨어지지 않고 0.3이다
     * @then positionValue가 qty × 진입가인 표의 포지션 가치와 손계산 가치(표본 순서대로 9945, 499950.4548, 19980.1884, 498.75, 5000, 30, 19980.24042)와 toBeCloseTo(…, 6) 이상의 정밀도(|차| < 5e-7)로 같다 — 오차가 생기는 M3도 이 비교로 통과해야 한다
     */
    it.each(QTY_SAMPLES)(
      "[DoD-1][DoD-2][DoD-3][DoD-4] 기준 사례 M1~M5와 추가 표본 S1·E1의 qty는 수량 단위로 내린 값이고 positionValue는 반올림하지 않은 qty × 진입가다",
      ({ id, step, leverage, entryPrice, balance, qty, positionValue, floorQty }) => {
        const result = maxQuantity({ balance, leverage, entryPrice, ...step });
        expect(result.qty, `${id} qty`).toBe(qty);
        // S1: Math.floor(원값 ÷ qtyStep) 구현이 내는 0.2가 아니다. 다른 표본은 floorQty가 없어 비교값이 null이다(qty가 null이 아님도 함께 본다).
        expect(result.qty, `${id} qty 하락 없음`).not.toBe(floorQty ?? null);
        expect(result.positionValue, `${id} positionValue`).not.toBeNull();
        expect(result.positionValue as number, `${id} positionValue`).toBeCloseTo(
          positionValue,
          VALUE_DIGITS,
        );
      },
    );
  });

  describe("계산할 수 없는 입력", () => {
    /**
     * @spec EC-2
     * @given 나머지 입력은 M1 (잔고 1000, 레버리지 10, 진입 65000, BTCUSDT qtyStep 0.001·minOrderQty 0.001)로 두고, 잔고·레버리지·진입가 각각을 하나씩 null(빈 입력·`.`), 0, 음수(-1)로 바꾼 표본 9개와, 잔고 -1000·레버리지 -10을 동시에 음수로 둔 표본(곱은 양수) 1개, 모두 10개를 넣는다
     * @when 최대 수량을 계산한다
     * @then qty가 null이다
     * @then positionValue가 null이다
     * @then belowMin이 false다(최소 수량 미달로 판정하지 않는다)
     */
    it.each<{ label: string; inputs: Inputs }>([
      // 빈 입력·`.`은 null로 넘어온다
      { label: "잔고 null", inputs: { ...M1_INPUTS, balance: null } },
      { label: "잔고 0", inputs: { ...M1_INPUTS, balance: 0 } },
      { label: "잔고 -1", inputs: { ...M1_INPUTS, balance: -1 } },
      { label: "레버리지 null", inputs: { ...M1_INPUTS, leverage: null } },
      { label: "레버리지 0", inputs: { ...M1_INPUTS, leverage: 0 } },
      { label: "레버리지 -1", inputs: { ...M1_INPUTS, leverage: -1 } },
      { label: "진입가 null", inputs: { ...M1_INPUTS, entryPrice: null } },
      { label: "진입가 0", inputs: { ...M1_INPUTS, entryPrice: 0 } },
      { label: "진입가 -1", inputs: { ...M1_INPUTS, entryPrice: -1 } },
      // 곱은 양수지만 입력별 양수 검사로 거른다
      { label: "잔고 -1000·레버리지 -10", inputs: { ...M1_INPUTS, balance: -1000, leverage: -10 } },
    ])(
      "[EC-2] 잔고·레버리지·진입가 중 하나라도 없거나 0 이하이면 qty·positionValue는 null이고 belowMin은 false다",
      ({ label, inputs }) => {
        const result = maxQuantity({ ...inputs, ...BTC });
        expect(result.qty, `${label}`).toBeNull();
        expect(result.positionValue, `${label}`).toBeNull();
        expect(result.belowMin, `${label}`).toBe(false);
      },
    );

    /**
     * @spec EC-3
     * @given 입력은 유한하지만 계산 결과가 유한하지 않은 표본을 BTCUSDT qtyStep 0.001·minOrderQty 0.001로 하나씩 넣는다: 곱 넘침 (잔고 1e308, 레버리지 10, 진입가 1) → 잔고 × 레버리지가 부동소수점 범위를 넘는다, roundToStep 넘침 (잔고 1e306, 레버리지 10, 진입가 1) → 원값 수량 1e307은 유한하지만 수량을 내린 값이 넘친다
     * @when 최대 수량을 계산한다
     * @then qty가 null이다
     * @then positionValue가 null이다
     * @then belowMin이 false다
     */
    it.each<{ label: string; inputs: Inputs }>([
      // 309자리 잔고 × 10 → 곱이 Infinity
      { label: "곱 넘침", inputs: { balance: 1e308, leverage: 10, entryPrice: 1 } },
      // 307자리 잔고 · 10 · 1 → 원값 1e307은 유한, 수량 단위로 내린 값이 넘친다
      { label: "roundToStep 넘침", inputs: { balance: 1e306, leverage: 10, entryPrice: 1 } },
    ])(
      "[EC-3] 입력은 유한하지만 결과가 유한하지 않으면 qty·positionValue는 null이다",
      ({ label, inputs }) => {
        const result = maxQuantity({ ...inputs, ...BTC });
        expect(result.qty, `${label}`).toBeNull();
        expect(result.positionValue, `${label}`).toBeNull();
        expect(result.belowMin, `${label}`).toBe(false);
      },
    );
  });

  describe("최소 주문 수량", () => {
    /**
     * @spec EC-5
     * @given 내린 수량이 0이거나 minOrderQty보다 작은 표본을 하나씩 넣는다: SOL 표본 (SOLUSDT qtyStep 0.1·minOrderQty 0.1, 레버리지 1, 진입 150, 잔고 10) 원값 0.0666… → 내린 수량 0, 합성 qtyStep ≠ minOrderQty 표본 (qtyStep 0.001·minOrderQty 0.01, 레버리지 1, 진입 150, 잔고 1) 원값 0.006666… → 내린 수량 0.006(0보다 크지만 minOrderQty 미만)
     * @when 최대 수량을 계산한다
     * @then qty가 null이다
     * @then positionValue가 null이다
     * @then belowMin이 true다
     */
    it.each<{ label: string; step: Step; inputs: Inputs }>([
      // 원값 0.0666… → 내린 수량 0
      { label: "SOL 표본", step: SOL, inputs: { balance: 10, leverage: 1, entryPrice: 150 } },
      // 합성: 원값 0.006666… → 내린 수량 0.006 (0 < 0.006 < 0.01)
      {
        label: "합성 qtyStep ≠ minOrderQty",
        step: { qtyStep: 0.001, minOrderQty: 0.01 },
        inputs: { balance: 1, leverage: 1, entryPrice: 150 },
      },
    ])(
      "[EC-5] 내린 수량이 0이거나 minOrderQty보다 작으면 qty·positionValue는 null이고 belowMin은 true다",
      ({ label, step, inputs }) => {
        const result = maxQuantity({ ...inputs, ...step });
        expect(result.qty, `${label}`).toBeNull();
        expect(result.positionValue, `${label}`).toBeNull();
        expect(result.belowMin, `${label}`).toBe(true);
      },
    );

    /**
     * @spec EC-5
     * @given 내린 수량이 정확히 minOrderQty인 경계 표본을 하나씩 넣는다: SOLUSDT (qtyStep 0.1·minOrderQty 0.1, 레버리지 1, 진입 150, 잔고 15) 원값 0.1 → 0.1, BTCUSDT (qtyStep 0.001·minOrderQty 0.001, 레버리지 1, 진입 65000, 잔고 65) 원값 0.001 → 0.001
     * @when 최대 수량을 계산한다
     * @then qty가 손계산 리터럴(표본 순서대로 0.1, 0.001)과 같다
     * @then positionValue가 손계산 리터럴(표본 순서대로 15, 65)과 toBeCloseTo(…, 6) 이상의 정밀도(|차| < 5e-7)로 같다
     * @then belowMin이 false다(정확히 minOrderQty는 미달이 아니다)
     */
    it.each<{ label: string; step: Step; inputs: Inputs; qty: number; positionValue: number }>([
      {
        label: "SOLUSDT 0.1",
        step: SOL,
        inputs: { balance: 15, leverage: 1, entryPrice: 150 },
        qty: 0.1,
        positionValue: 15,
      },
      {
        label: "BTCUSDT 0.001",
        step: BTC,
        inputs: { balance: 65, leverage: 1, entryPrice: 65000 },
        qty: 0.001,
        positionValue: 65,
      },
    ])(
      "[EC-5] 내린 수량이 정확히 minOrderQty이면 미달이 아니고 qty·positionValue를 돌려준다",
      ({ label, step, inputs, qty, positionValue }) => {
        const result = maxQuantity({ ...inputs, ...step });
        expect(result.qty, `${label}`).toBe(qty);
        expect(result.positionValue, `${label}`).not.toBeNull();
        expect(result.positionValue as number, `${label}`).toBeCloseTo(positionValue, VALUE_DIGITS);
        expect(result.belowMin, `${label}`).toBe(false);
      },
    );
  });
});
