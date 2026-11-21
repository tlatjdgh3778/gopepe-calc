import { describe, expect, it } from "vitest";

import { calculatePnl, qtyFromValue } from "@/lib/pnl";

describe("손익 계산 — 입력한 포지션의 필요 증거금·손익·ROE 원값을 얻는다", () => {
  describe("필요 증거금", () => {
    /**
     * @spec DoD-1
     * @given 진입가·수량·레버리지 표본을 하나씩 넣는다: (65000, 0.12, 10) → 780, (98765.4, 0.042, 20) → 207.40734 (손계산 리터럴), 종료가는 유효한 값이다
     * @when 포지션 손익을 계산한다
     * @then initialMargin이 진입가 × 수량 ÷ 레버리지의 반올림하지 않은 손계산 리터럴(780, 207.40734)과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     */
    it("[DoD-1] 필요 증거금은 진입가 × 수량 ÷ 레버리지의 반올림하지 않은 값이다", () => {
      const cases = [
        { entryPrice: 65000, qty: 0.12, leverage: 10, expected: 780 },
        { entryPrice: 98765.4, qty: 0.042, leverage: 20, expected: 207.40734 },
      ];
      for (const { entryPrice, qty, leverage, expected } of cases) {
        const result = calculatePnl({
          side: "long",
          leverage,
          entryPrice,
          exitPrice: entryPrice * 1.01,
          qty,
        });
        expect(result.initialMargin).toBeCloseTo(expected, 10);
      }
    });
  });

  describe("롱 포지션의 손익", () => {
    /**
     * @spec DoD-2
     * @given 롱 포지션 표본을 하나씩 넣는다: 이익 (진입 65000, 종료 67250.5, 수량 0.12, 레버리지 10) → 270.06, 손실 (진입 3456.78, 종료 3210.55, 수량 1.37, 레버리지 25) → −337.3351 (손계산 리터럴)
     * @when 포지션 손익을 계산한다
     * @then pnl이 (종료가 − 진입가) × 수량의 손계산 리터럴(270.06, −337.3351)과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     */
    it("[DoD-2] 롱의 손익은 (종료가 − 진입가) × 수량이다", () => {
      const cases = [
        { entryPrice: 65000, exitPrice: 67250.5, qty: 0.12, leverage: 10, expected: 270.06 },
        { entryPrice: 3456.78, exitPrice: 3210.55, qty: 1.37, leverage: 25, expected: -337.3351 },
      ];
      for (const { entryPrice, exitPrice, qty, leverage, expected } of cases) {
        const result = calculatePnl({ side: "long", leverage, entryPrice, exitPrice, qty });
        expect(result.pnl).toBeCloseTo(expected, 10);
      }
    });
  });

  describe("숏 포지션의 손익", () => {
    /**
     * @spec DoD-3
     * @given 숏 포지션 표본을 하나씩 넣는다: 이익 (진입 2500, 종료 2345.68, 수량 2.5, 레버리지 5) → 385.8, 손실 (진입 98765.4, 종료 99999.9, 수량 0.042, 레버리지 20) → −51.849 (손계산 리터럴)
     * @when 포지션 손익을 계산한다
     * @then pnl이 (진입가 − 종료가) × 수량의 손계산 리터럴(385.8, −51.849)과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     */
    it("[DoD-3] 숏의 손익은 (진입가 − 종료가) × 수량이다", () => {
      const cases = [
        { entryPrice: 2500, exitPrice: 2345.68, qty: 2.5, leverage: 5, expected: 385.8 },
        { entryPrice: 98765.4, exitPrice: 99999.9, qty: 0.042, leverage: 20, expected: -51.849 },
      ];
      for (const { entryPrice, exitPrice, qty, leverage, expected } of cases) {
        const result = calculatePnl({ side: "short", leverage, entryPrice, exitPrice, qty });
        expect(result.pnl).toBeCloseTo(expected, 10);
      }
    });
  });

  describe("ROE", () => {
    /**
     * @spec DoD-4
     * @given 포지션 표본을 하나씩 넣는다: 롱 (65000 → 67250.5, 0.12, 10) → 34.6230769…, 숏 (98765.4 → 99999.9, 0.042, 20) → −24.9986331…, 롱 (3456.78 → 3210.55, 1.37, 25) → −178.0775750… (pnl ÷ initialMargin × 100의 손계산 리터럴)
     * @when 포지션 손익을 계산한다
     * @then roe가 pnl ÷ initialMargin × 100의 반올림하지 않은 손계산 리터럴과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     */
    it("[DoD-4] ROE는 손익 ÷ 필요 증거금 × 100(%)이다", () => {
      const cases = [
        {
          side: "long" as const,
          entryPrice: 65000,
          exitPrice: 67250.5,
          qty: 0.12,
          leverage: 10,
          expected: 34.62307692307692,
        },
        {
          side: "short" as const,
          entryPrice: 98765.4,
          exitPrice: 99999.9,
          qty: 0.042,
          leverage: 20,
          expected: -24.9986331245558,
        },
        {
          side: "long" as const,
          entryPrice: 3456.78,
          exitPrice: 3210.55,
          qty: 1.37,
          leverage: 25,
          expected: -178.077575084327,
        },
      ];
      for (const { side, entryPrice, exitPrice, qty, leverage, expected } of cases) {
        const result = calculatePnl({ side, leverage, entryPrice, exitPrice, qty });
        expect(result.roe).toBeCloseTo(expected, 10);
      }
    });
  });

  describe("진입가와 종료가가 같은 경우", () => {
    /**
     * @spec EC-5
     * @given 진입가와 종료가가 모두 150.12, 수량 12.3, 레버리지 15인 포지션을 롱과 숏으로 하나씩 넣는다
     * @when 포지션 손익을 계산한다
     * @then pnl이 null이 아닌 0이다
     * @then roe가 null이 아닌 0이다
     * @then initialMargin이 150.12 × 12.3 ÷ 15의 손계산 리터럴 123.0984와 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     */
    it("[EC-5] 진입가와 종료가가 같으면 손익과 ROE가 0이다", () => {
      for (const side of ["long", "short"] as const) {
        const result = calculatePnl({
          side,
          leverage: 15,
          entryPrice: 150.12,
          exitPrice: 150.12,
          qty: 12.3,
        });
        // −0도 0으로 본다(Object.is 비교를 쓰지 않는다)
        expect(result.pnl).not.toBeNull();
        expect(result.pnl === 0, `${side} pnl ${result.pnl}`).toBe(true);
        expect(result.roe).not.toBeNull();
        expect(result.roe === 0, `${side} roe ${result.roe}`).toBe(true);
        expect(result.initialMargin).toBeCloseTo(123.0984, 10);
      }
    });
  });

  describe("큰 값의 포지션", () => {
    /**
     * @spec EC-7
     * @given 롱, 진입가 65000, 종료가 67250.5, 수량 1e9, 레버리지 10인 포지션이다
     * @when 포지션 손익을 계산한다
     * @then initialMargin이 손계산 리터럴 6500000000000과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     * @then pnl이 손계산 리터럴 2250500000000과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     * @then roe가 손계산 리터럴 34.6230769…와 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     */
    it("[EC-7] 수량 1e9의 큰 포지션도 null 없이 원값을 계산한다", () => {
      const result = calculatePnl({
        side: "long",
        leverage: 10,
        entryPrice: 65000,
        exitPrice: 67250.5,
        qty: 1e9,
      });
      expect(result.initialMargin).not.toBeNull();
      expect(result.pnl).not.toBeNull();
      // 큰 값은 상대 오차로 비교한다(1e-14 이내, 표시 자릿수 수준의 느슨한 비교가 아니다)
      expect((result.initialMargin as number) / 6500000000000).toBeCloseTo(1, 14);
      expect((result.pnl as number) / 2250500000000).toBeCloseTo(1, 14);
      expect(result.roe).toBeCloseTo(34.62307692307692, 10);
    });
  });

  describe("계산에 필요한 값이 비어 있거나 0 이하인 경우", () => {
    /**
     * @spec EC-3
     * @given 롱 (진입 65000, 종료 67250.5, 수량 0.12, 레버리지 10)에서 진입가 또는 수량 하나만 표본 값으로 바꿔 하나씩 넣는다: null, 0, −1
     * @when 포지션 손익을 계산한다
     * @then initialMargin이 null이다
     * @then pnl이 null이다
     * @then roe가 null이다(0으로 나누지 않는다)
     */
    it("[EC-3] 진입가나 수량이 없거나 0 이하이면 세 결과가 모두 null이다", () => {
      const base = {
        side: "long" as const,
        leverage: 10,
        entryPrice: 65000,
        exitPrice: 67250.5,
        qty: 0.12,
      };
      for (const value of [null, 0, -1]) {
        for (const input of [
          { ...base, entryPrice: value },
          { ...base, qty: value },
        ]) {
          expect(calculatePnl(input), `${JSON.stringify(input)}`).toEqual({
            initialMargin: null,
            pnl: null,
            roe: null,
          });
        }
      }
    });

    /**
     * @spec EC-3
     * @given 롱 (진입 65000, 수량 0.12, 레버리지 10)에서 종료가를 표본 값으로 하나씩 넣는다: null, 0, −1
     * @when 포지션 손익을 계산한다
     * @then initialMargin이 손계산 리터럴 780과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     * @then pnl이 null이다
     * @then roe가 null이다
     */
    it("[EC-3] 종료가가 없거나 0 이하이면 필요 증거금만 계산되고 손익·ROE는 null이다", () => {
      for (const exitPrice of [null, 0, -1]) {
        const result = calculatePnl({
          side: "long",
          leverage: 10,
          entryPrice: 65000,
          exitPrice,
          qty: 0.12,
        });
        expect(result.initialMargin).toBeCloseTo(780, 10);
        expect(result.pnl, `exitPrice ${exitPrice}`).toBeNull();
        expect(result.roe, `exitPrice ${exitPrice}`).toBeNull();
      }
    });

    /**
     * @spec EC-3 DoD-2
     * @given 롱 (진입 65000, 종료 67250.5, 수량 0.12)에서 레버리지를 표본 값으로 하나씩 넣는다: 0, −1
     * @when 포지션 손익을 계산한다
     * @then pnl이 레버리지 없이 계산된 손계산 리터럴 270.06과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     * @then initialMargin이 null이다(0으로 나누지 않는다)
     * @then roe가 null이다
     */
    it("[EC-3][DoD-2] 레버리지가 0 이하이면 손익은 레버리지 없이 계산되고 필요 증거금·ROE는 null이다", () => {
      for (const leverage of [0, -1]) {
        const result = calculatePnl({
          side: "long",
          leverage,
          entryPrice: 65000,
          exitPrice: 67250.5,
          qty: 0.12,
        });
        expect(result.pnl).toBeCloseTo(270.06, 10);
        expect(result.initialMargin, `leverage ${leverage}`).toBeNull();
        expect(result.roe, `leverage ${leverage}`).toBeNull();
      }
    });
  });

  describe("계산 결과가 유한한 수가 아닌 경우", () => {
    /**
     * @spec EC-8
     * @given 롱 포지션 표본을 하나씩 넣는다: 표본 A는 기본 포지션(진입 65000, 종료 67250.5, 수량 0.12, 레버리지 10)에서 진입가만 NaN, 진입가만 Infinity, 수량만 Infinity로 바꾼 것, 표본 B는 진입 1e200·종료 2e200·수량 1e200·레버리지 10(곱이 Number.MAX_VALUE를 넘는다), 표본 C는 진입 1·종료 1e306·수량 100·레버리지 1000(roe만 비유한), 표본 D는 진입 1e300·종료 1e300·수량 1e10·레버리지 1(initialMargin만 비유한)
     * @when 포지션 손익을 계산한다
     * @then 표본 A·B는 initialMargin·pnl·roe가 모두 null이다
     * @then 표본 C는 initialMargin이 손계산 리터럴 0.1, pnl이 손계산 리터럴 1e308과 부동소수 표현 오차 이내로 같고(소수 둘째 자리 수준의 느슨한 비교 금지) roe만 null이다
     * @then 표본 D는 initialMargin이 null이고, roe는 initialMargin이 null이므로 null이며(원값 margin으로 나눈 0이 아니다), pnl은 null이 아닌 0이다
     */
    it("[EC-8] 결과가 유한한 수가 아니면 해당 결과는 null이다", () => {
      const base = {
        side: "long" as const,
        leverage: 10,
        entryPrice: 65000,
        exitPrice: 67250.5,
        qty: 0.12,
      };
      const allNull = [
        { ...base, entryPrice: Number.NaN },
        { ...base, entryPrice: Number.POSITIVE_INFINITY },
        { ...base, qty: Number.POSITIVE_INFINITY },
        { side: "long" as const, leverage: 10, entryPrice: 1e200, exitPrice: 2e200, qty: 1e200 },
      ];
      for (const input of allNull) {
        expect(calculatePnl(input), `${JSON.stringify(input)}`).toEqual({
          initialMargin: null,
          pnl: null,
          roe: null,
        });
      }

      const roeOnly = calculatePnl({
        side: "long",
        leverage: 1000,
        entryPrice: 1,
        exitPrice: 1e306,
        qty: 100,
      });
      expect(roeOnly.initialMargin).toBeCloseTo(0.1, 10);
      expect(roeOnly.pnl).not.toBeNull();
      expect((roeOnly.pnl as number) / 1e308).toBeCloseTo(1, 14);
      expect(roeOnly.roe).toBeNull();

      const marginOnly = calculatePnl({
        side: "long",
        leverage: 1,
        entryPrice: 1e300,
        exitPrice: 1e300,
        qty: 1e10,
      });
      expect(marginOnly.initialMargin).toBeNull();
      expect(marginOnly.roe).toBeNull();
      expect(marginOnly.pnl).not.toBeNull();
      expect(marginOnly.pnl === 0, `pnl ${marginOnly.pnl}`).toBe(true);
    });
  });
});

describe("USDT 금액 → 코인 수량 환산 — 포지션 가치로 넣은 금액을 코인 수량으로 얻는다", () => {
  describe("금액과 진입가가 있는 경우", () => {
    /**
     * @spec DoD-6
     * @given USDT 금액(포지션 가치)·진입가 표본을 하나씩 넣는다: (7800, 65000) → 0.12, (4148.1468, 98765.4) → 0.042, (1, 3) → 0.3333333333333333 (무한소수, 손계산 리터럴)
     * @when USDT 금액을 코인 수량으로 환산한다
     * @then 결과가 금액 ÷ 진입가의 손계산 리터럴(0.12, 0.042, 0.3333333333333333)과 부동소수 표현 오차 이내로 같다(소수 둘째 자리 수준의 느슨한 비교 금지)
     */
    it("[DoD-6] 코인 수량은 USDT 금액 ÷ 진입가다", () => {
      const cases = [
        { valueUsdt: 7800, entryPrice: 65000, expected: 0.12 },
        { valueUsdt: 4148.1468, entryPrice: 98765.4, expected: 0.042 },
        { valueUsdt: 1, entryPrice: 3, expected: 0.3333333333333333 },
      ];
      for (const { valueUsdt, entryPrice, expected } of cases) {
        expect(qtyFromValue(valueUsdt, entryPrice)).toBeCloseTo(expected, 10);
      }
    });
  });

  describe("금액이나 진입가가 비어 있거나 0 이하인 경우", () => {
    /**
     * @spec EC-3
     * @given (금액 7800, 진입가 65000)에서 금액 또는 진입가 하나만 표본 값으로 바꿔 하나씩 넣는다: null, 0, −1
     * @when USDT 금액을 코인 수량으로 환산한다
     * @then 결과가 null이다(0으로 나누지 않는다)
     */
    it("[EC-3] 금액이나 진입가가 없거나 0 이하이면 null이다", () => {
      for (const value of [null, 0, -1]) {
        expect(qtyFromValue(value, 65000), `valueUsdt ${value}`).toBeNull();
        expect(qtyFromValue(7800, value), `entryPrice ${value}`).toBeNull();
      }
    });
  });

  describe("환산 결과가 유한한 수가 아닌 경우", () => {
    /**
     * @spec EC-8
     * @given 표본을 하나씩 넣는다: 금액 NaN, 진입가 NaN, 금액 Infinity, 금액 1e308·진입가 1e-308(몫이 Number.MAX_VALUE를 넘는다)
     * @when USDT 금액을 코인 수량으로 환산한다
     * @then 결과가 null이다
     */
    it("[EC-8] 환산 결과가 유한한 수가 아니면 null이다", () => {
      const cases: [number, number][] = [
        [Number.NaN, 65000],
        [7800, Number.NaN],
        [Number.POSITIVE_INFINITY, 65000],
        [1e308, 1e-308],
      ];
      for (const [valueUsdt, entryPrice] of cases) {
        expect(qtyFromValue(valueUsdt, entryPrice), `${valueUsdt} / ${entryPrice}`).toBeNull();
      }
    });
  });
});
