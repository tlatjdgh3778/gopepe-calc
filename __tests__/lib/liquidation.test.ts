import { describe, expect, it } from "vitest";

import {
  distancePercent,
  exceedsFirstTier,
  formatDistance,
  isolatedCollateral,
  isStopBeforeLiquidation,
  liquidationPrice,
  roundLiquidation,
} from "@/lib/liquidation";

/** U+2014 EM DASH. 값이 없는 표시. */
const EM_DASH = "\u2014";

describe("청산가 계산 — 진입가·수량·담보·유지증거금률로 추정 청산가와 거리, 경고 조건을 구한다", () => {
  describe("롱 포지션의 청산가", () => {
    /**
     * @spec DoD-8
     * @given 롱 표본을 하나씩 넣는다(entryPrice, qty, collateral, mmr → 손계산 원값): (100000, 0.1, 1000, 0.0033) → 9000 ÷ 0.09967 = 90297.98334…, (100000, 0.1, 2000, 0.0033) 교차 잔고 → 8000 ÷ 0.09967 = 80264.87408…, (150, 10, 150, 0.005) SOLUSDT 격리 레버리지 10 → 1350 ÷ 9.95 = 135.67839…
     * @when 방향 "long"으로 청산가를 계산한다
     * @then 결과가 (entryPrice × qty − collateral) ÷ (qty × (1 − mmr))의 손계산 원값과 소수 5자리까지 같다
     * @then 결과는 반올림하지 않은 원값이다(90297.98334…이며 틱에 맞춘 90298이 아니다)
     */
    it("[DoD-8] 롱은 (진입가 × 수량 − 담보) ÷ (수량 × (1 − mmr))의 반올림하지 않은 값을 돌려준다", () => {
      // 손계산: (entryPrice × qty − collateral) ÷ (qty × (1 − mmr))
      const cases: [
        entryPrice: number,
        qty: number,
        collateral: number,
        mmr: number,
        expected: number,
      ][] = [
        [100000, 0.1, 1000, 0.0033, 90297.98334503864], // 9000 ÷ 0.09967
        [100000, 0.1, 2000, 0.0033, 80264.87408447878], // 8000 ÷ 0.09967 (교차 잔고)
        [150, 10, 150, 0.005, 135.678391959799], // 1350 ÷ 9.95 (SOLUSDT 격리 레버리지 10)
      ];
      for (const [entryPrice, qty, collateral, mmr, expected] of cases) {
        const result = liquidationPrice({ side: "long", entryPrice, qty, collateral, mmr });
        expect(result, `long (${entryPrice}, ${qty}, ${collateral}, ${mmr})`).not.toBeNull();
        expect(result, `long (${entryPrice}, ${qty}, ${collateral}, ${mmr})`).toBeCloseTo(
          expected,
          5,
        );
      }
      // 반올림하지 않은 원값: 틱(0.1)에 맞춘 90298이 아니다
      const raw = liquidationPrice({
        side: "long",
        entryPrice: 100000,
        qty: 0.1,
        collateral: 1000,
        mmr: 0.0033,
      });
      expect(raw).not.toBe(90298);
      expect(raw).toBeCloseTo(90297.98334503864, 5);
    });

    /**
     * @spec DoD-8
     * @given 롱 원값이 0 이하가 되는 표본을 하나씩 넣는다(entryPrice, qty, collateral, mmr → 손계산 원값): (100000, 0.1, 10000, 0.0033) 격리 레버리지 1 → 0, (100000, 0.1, 20000, 0.0033) 교차 잔고 ≥ 진입가 × 수량 → −10000 ÷ 0.09967 = −100331.09260…
     * @when 방향 "long"으로 청산가를 계산한다
     * @then 결과가 null이 아니고 0 이하인 원값 그대로다(0 → 0, −100331.09260…과 소수 5자리까지 같다)
     */
    it("[DoD-8] 롱의 원값이 0 이하이면 null이 아니라 그 값을 돌려준다", () => {
      const cases: [
        entryPrice: number,
        qty: number,
        collateral: number,
        mmr: number,
        expected: number,
      ][] = [
        [100000, 0.1, 10000, 0.0033, 0], // 격리 레버리지 1: (10000 − 10000) ÷ 0.09967
        [100000, 0.1, 20000, 0.0033, -100331.09260559847], // 교차 잔고 ≥ 진입가 × 수량: −10000 ÷ 0.09967
      ];
      for (const [entryPrice, qty, collateral, mmr, expected] of cases) {
        const result = liquidationPrice({ side: "long", entryPrice, qty, collateral, mmr });
        expect(result, `long (${entryPrice}, ${qty}, ${collateral}, ${mmr})`).not.toBeNull();
        expect(result, `long (${entryPrice}, ${qty}, ${collateral}, ${mmr})`).toBeCloseTo(
          expected,
          5,
        );
      }
    });
  });

  describe("숏 포지션의 청산가", () => {
    /**
     * @spec DoD-9
     * @given 숏 표본을 하나씩 넣는다(entryPrice, qty, collateral, mmr → 손계산 원값): (100000, 0.1, 1000, 0.0033) → 11000 ÷ 0.10033 = 109638.19395…, (150, 10, 150, 0.005) SOLUSDT 격리 레버리지 10 → 1650 ÷ 10.05 = 164.17910…
     * @when 방향 "short"로 청산가를 계산한다
     * @then 결과가 (entryPrice × qty + collateral) ÷ (qty × (1 + mmr))의 손계산 원값과 소수 5자리까지 같다
     * @then 결과는 반올림하지 않은 원값이다(109638.19395…이며 틱에 맞춘 109638.1이 아니다)
     */
    it("[DoD-9] 숏은 (진입가 × 수량 + 담보) ÷ (수량 × (1 + mmr))의 반올림하지 않은 값을 돌려준다", () => {
      // 손계산: (entryPrice × qty + collateral) ÷ (qty × (1 + mmr))
      const cases: [
        entryPrice: number,
        qty: number,
        collateral: number,
        mmr: number,
        expected: number,
      ][] = [
        [100000, 0.1, 1000, 0.0033, 109638.19395993222], // 11000 ÷ 0.10033
        [150, 10, 150, 0.005, 164.17910447761193], // 1650 ÷ 10.05 (SOLUSDT 격리 레버리지 10)
      ];
      for (const [entryPrice, qty, collateral, mmr, expected] of cases) {
        const result = liquidationPrice({ side: "short", entryPrice, qty, collateral, mmr });
        expect(result, `short (${entryPrice}, ${qty}, ${collateral}, ${mmr})`).not.toBeNull();
        expect(result, `short (${entryPrice}, ${qty}, ${collateral}, ${mmr})`).toBeCloseTo(
          expected,
          5,
        );
      }
      // 반올림하지 않은 원값: 틱(0.1)에 맞춘 109638.1이 아니다
      const raw = liquidationPrice({
        side: "short",
        entryPrice: 100000,
        qty: 0.1,
        collateral: 1000,
        mmr: 0.0033,
      });
      expect(raw).not.toBe(109638.1);
      expect(raw).toBeCloseTo(109638.19395993222, 5);
    });
  });

  describe("청산가를 계산할 수 없는 입력", () => {
    /**
     * @spec DoD-8 DoD-9
     * @given 기준 입력 (entryPrice 100000, qty 0.1, collateral 1000, mmr 0.0033)에서 한 값만 바꾼 표본을 "long"·"short" 각각으로 하나씩 넣는다: entryPrice null·0·−1, qty null·0·−1, collateral null·0·−1 / 결과가 유한하지 않은 entryPrice NaN·Infinity
     * @when 청산가를 계산한다
     * @then 모든 결과가 null이다(계약: 입력이 null이거나 0 이하이거나 결과가 유한하지 않으면 null)
     */
    it("[DoD-8][DoD-9] 진입가·수량·담보가 비었거나 0 이하이거나 결과가 유한하지 않으면 null을 돌려준다", () => {
      const base = { entryPrice: 100000, qty: 0.1, collateral: 1000, mmr: 0.0033 };
      const overrides: Partial<Record<"entryPrice" | "qty" | "collateral", number | null>>[] = [
        { entryPrice: null },
        { entryPrice: 0 },
        { entryPrice: -1 },
        { qty: null },
        { qty: 0 },
        { qty: -1 },
        { collateral: null },
        { collateral: 0 },
        { collateral: -1 },
        // 결과가 유한하지 않다
        { entryPrice: Number.NaN },
        { entryPrice: Number.POSITIVE_INFINITY },
      ];
      for (const side of ["long", "short"] as const) {
        for (const override of overrides) {
          const result = liquidationPrice({ side, ...base, ...override });
          expect(
            result,
            `${side} ${Object.keys(override)[0]}=${String(Object.values(override)[0])}`,
          ).toBeNull();
        }
      }
    });

    /**
     * @spec DoD-8 DoD-9
     * @given 기준 입력 (entryPrice 100000, qty 0.1, collateral 1000)에 범위 밖 mmr 표본을 "long"·"short" 각각으로 하나씩 넣는다: 0, −0.001, 1, 1.5
     * @when 청산가를 계산한다
     * @then 모든 결과가 null이다(계약: mmr이 0 이하이거나 1 이상이면 null)
     */
    it("[DoD-8][DoD-9] mmr이 0 이하이거나 1 이상이면 null을 돌려준다", () => {
      for (const side of ["long", "short"] as const) {
        for (const mmr of [0, -0.001, 1, 1.5]) {
          const result = liquidationPrice({
            side,
            entryPrice: 100000,
            qty: 0.1,
            collateral: 1000,
            mmr,
          });
          expect(result, `${side} mmr ${mmr}`).toBeNull();
        }
      }
    });
  });

  describe("격리 모드의 담보", () => {
    /**
     * @spec DoD-11
     * @given 표본을 하나씩 넣는다(entryPrice, qty, leverage → 손계산 값): (100000, 0.1, 10) → 1000, (40000, 1, 50) → 800, (65000, 0.12, 10) → 780, (150.12, 12.3, 15) → 1846.476 ÷ 15 = 123.0984
     * @when 격리 담보를 계산한다
     * @then 결과가 entryPrice × qty ÷ leverage의 손계산 값과 소수 8자리까지 같다
     */
    it("[DoD-11] 격리 담보는 진입가 × 수량 ÷ 레버리지다", () => {
      const cases: [entryPrice: number, qty: number, leverage: number, expected: number][] = [
        [100000, 0.1, 10, 1000],
        [40000, 1, 50, 800],
        [65000, 0.12, 10, 780],
        [150.12, 12.3, 15, 123.0984], // 1846.476 ÷ 15
      ];
      for (const [entryPrice, qty, leverage, expected] of cases) {
        const result = isolatedCollateral(entryPrice, qty, leverage);
        expect(result, `(${entryPrice}, ${qty}, ${leverage})`).not.toBeNull();
        expect(result, `(${entryPrice}, ${qty}, ${leverage})`).toBeCloseTo(expected, 8);
      }
    });

    /**
     * @spec DoD-11
     * @given 기준 입력 (entryPrice 100000, qty 0.1, leverage 10)에서 한 값만 바꾼 표본을 하나씩 넣는다: entryPrice null·0·−1, qty null·0·−1, leverage null·0·−1 / 결과가 유한하지 않은 entryPrice NaN·Infinity
     * @when 격리 담보를 계산한다
     * @then 모든 결과가 null이다(계약: 입력이 null이거나 0 이하이거나 결과가 유한하지 않으면 null)
     */
    it("[DoD-11] 진입가·수량·레버리지가 비었거나 0 이하이거나 결과가 유한하지 않으면 null을 돌려준다", () => {
      const cases: [entryPrice: number | null, qty: number | null, leverage: number | null][] = [
        [null, 0.1, 10],
        [0, 0.1, 10],
        [-1, 0.1, 10],
        [100000, null, 10],
        [100000, 0, 10],
        [100000, -1, 10],
        [100000, 0.1, null],
        [100000, 0.1, 0],
        [100000, 0.1, -1],
        // 결과가 유한하지 않다
        [Number.NaN, 0.1, 10],
        [Number.POSITIVE_INFINITY, 0.1, 10],
      ];
      for (const [entryPrice, qty, leverage] of cases) {
        expect(
          isolatedCollateral(entryPrice, qty, leverage),
          `(${entryPrice}, ${qty}, ${leverage})`,
        ).toBeNull();
      }
    });
  });

  describe("청산가를 가격 틱에 맞추기", () => {
    /**
     * @spec DoD-15
     * @given 롱 표본을 하나씩 넣는다(price, tickSize → 손계산 값): (90297.98334503864, 0.1) → 90298, (80264.87408447878, 0.1) → 80264.9, (135.678391959799, 0.01) → 135.68
     * @when 방향 "long"으로 청산가를 틱에 맞춘다
     * @then 결과가 price 이상인 tickSize의 배수 중 가장 작은 값(roundToStep(price, tickSize, "up")과 같은 값)이며 표본의 기대값과 정확히 같다
     */
    it("[DoD-15] 롱은 틱 배수로 올린 값을 돌려준다", () => {
      const cases: [price: number, tickSize: number, expected: number][] = [
        [90297.98334503864, 0.1, 90298],
        [80264.87408447878, 0.1, 80264.9],
        [135.678391959799, 0.01, 135.68],
      ];
      for (const [price, tickSize, expected] of cases) {
        expect(roundLiquidation(price, "long", tickSize), `(${price}, long, ${tickSize})`).toBe(
          expected,
        );
      }
    });

    /**
     * @spec DoD-15
     * @given 숏 표본을 하나씩 넣는다(price, tickSize → 손계산 값): (109638.19395993222, 0.1) → 109638.1, (164.17910447761193, 0.01) → 164.17
     * @when 방향 "short"로 청산가를 틱에 맞춘다
     * @then 결과가 price 이하인 tickSize의 배수 중 가장 큰 값(roundToStep(price, tickSize, "down")과 같은 값)이며 표본의 기대값과 정확히 같다
     */
    it("[DoD-15] 숏은 틱 배수로 내린 값을 돌려준다", () => {
      const cases: [price: number, tickSize: number, expected: number][] = [
        [109638.19395993222, 0.1, 109638.1],
        [164.17910447761193, 0.01, 164.17],
      ];
      for (const [price, tickSize, expected] of cases) {
        expect(roundLiquidation(price, "short", tickSize), `(${price}, short, ${tickSize})`).toBe(
          expected,
        );
      }
    });

    /**
     * @spec DoD-15
     * @given 이미 틱 배수인 표본을 "long"·"short" 각각으로 하나씩 넣는다(price, tickSize): (90298, 0.1), (60274.3, 0.1), (109638.1, 0.1), (150.12, 0.01) / 단위 수 price ÷ tickSize가 정수에서 살짝 벗어나는 오차 경계 표본 (80264.9, 0.1) → 80264.9(단위 수 802648.9999999999), (128.08, 0.01) → 128.08(단위 수 12808.000000000002), (109.32, 0.01) → 109.32(단위 수 10931.999999999998)
     * @when 청산가를 틱에 맞춘다
     * @then 두 방향 모두 결과가 입력 price와 정확히 같다(예: (80264.9, 0.1, "short") → 80264.9이며 80264.8이 아니다 / (128.08, 0.01, "long") → 128.08이며 128.09가 아니다)
     */
    it("[DoD-15] 이미 틱 배수인 청산가는 롱·숏 모두 그대로 돌려준다", () => {
      const cases: [price: number, tickSize: number][] = [
        [90298, 0.1],
        [60274.3, 0.1],
        [109638.1, 0.1],
        [150.12, 0.01],
        // 오차 경계: 단위 수 price ÷ tickSize가 정수에서 살짝 벗어난다
        [80264.9, 0.1], // 802648.9999999999
        [128.08, 0.01], // 12808.000000000002
        [109.32, 0.01], // 10931.999999999998
      ];
      for (const [price, tickSize] of cases) {
        for (const side of ["long", "short"] as const) {
          expect(roundLiquidation(price, side, tickSize), `(${price}, ${side}, ${tickSize})`).toBe(
            price,
          );
        }
      }
    });

    /**
     * @spec DoD-15
     * @given price 표본을 tickSize 0.1과 "long"·"short" 각각으로 하나씩 넣는다: null, NaN, Infinity, −Infinity, 0, −100331.09260559847 / 유한한 입력이지만 틱 단위 수가 유한하지 않은 값 9.029798334503863e+307(롱, tickSize 0.1) → null(계약: 결과가 유한하지 않으면 null)
     * @when 청산가를 틱에 맞춘다
     * @then 모든 결과가 null이다(계약: price가 null이거나 유한하지 않거나 0 이하이면 null)
     * @then 결과가 유한하지 않으면 null이다
     */
    it("[DoD-15] price가 비었거나 유한하지 않거나 0 이하이거나, 틱에 맞춘 결과가 유한하지 않으면 null을 돌려준다", () => {
      const prices = [
        null,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        0,
        -100331.09260559847,
      ];
      for (const price of prices) {
        for (const side of ["long", "short"] as const) {
          expect(roundLiquidation(price, side, 0.1), `(${price}, ${side}, 0.1)`).toBeNull();
        }
      }
      // 유한한 입력이지만 틱 단위 수(price ÷ 0.1)가 유한하지 않다(롱 표본만 둔다)
      expect(roundLiquidation(9.029798334503863e307, "long", 0.1)).toBeNull();
    });
  });

  describe("진입가 대비 청산가 거리", () => {
    /**
     * @spec DoD-17
     * @given 표본을 하나씩 넣는다(liq, entry → 손계산 값): (90298, 100000) → 9.702, (109638.1, 100000) → 9.6381, (80264.9, 100000) → 19.7351, (100000, 100000) → 0
     * @when 거리를 계산한다
     * @then 결과가 |liq − entry| ÷ entry × 100의 손계산 값과 소수 8자리까지 같다
     * @then 청산가가 진입가보다 큰 숏 표본도 결과가 양수다(9.6381이며 −9.6381이 아니다)
     */
    it("[DoD-17] 거리는 |청산가 − 진입가| ÷ 진입가 × 100이다", () => {
      const cases: [liq: number, entry: number, expected: number][] = [
        [90298, 100000, 9.702],
        [109638.1, 100000, 9.6381], // 청산가 > 진입가(숏)여도 양수
        [80264.9, 100000, 19.7351],
        [100000, 100000, 0],
      ];
      for (const [liq, entry, expected] of cases) {
        const result = distancePercent(liq, entry);
        expect(result, `(${liq}, ${entry})`).not.toBeNull();
        expect(result, `(${liq}, ${entry})`).toBeCloseTo(expected, 8);
      }
    });

    /**
     * @spec DoD-17
     * @given 기준 입력 (liq 90298, entry 100000)에서 한 값만 바꾼 표본을 하나씩 넣는다: liq null·0·−100331.09260559847, entry null·0·−1 / 결과가 유한하지 않은 liq NaN·Infinity
     * @when 거리를 계산한다
     * @then 모든 결과가 null이다(계약: 입력이 null이거나 0 이하이거나 결과가 유한하지 않으면 null)
     */
    it("[DoD-17] 청산가·진입가가 비었거나 0 이하이거나 결과가 유한하지 않으면 null을 돌려준다", () => {
      const cases: [liq: number | null, entry: number | null][] = [
        [null, 100000],
        [0, 100000],
        [-100331.09260559847, 100000],
        [90298, null],
        [90298, 0],
        [90298, -1],
        // 결과가 유한하지 않다
        [Number.NaN, 100000],
        [Number.POSITIVE_INFINITY, 100000],
      ];
      for (const [liq, entry] of cases) {
        expect(distancePercent(liq, entry), `(${liq}, ${entry})`).toBeNull();
      }
    });
  });

  describe("거리 표시", () => {
    /**
     * @spec DoD-18
     * @given 표본을 하나씩 넣는다(v → 기대 문자열): 9.702 → "9.70%", 버림이 드러나는 9.638100000000007 → "9.63%"(사사오입이면 9.64), 19.735100000000006 → "19.73%", 버림과 천 단위 구분 1993.456 → "1,993.45%", 천 단위 구분 1234567.891 → "1,234,567.89%", 오차 정리 0.3499999999999943 → "0.35%"(정리 없이 버리면 0.34), 0 → "0.00%", 음수 −9.702 → "9.70%"(부호 없음)
     * @when 거리를 표시한다
     * @then 결과 문자열이 표본의 기대 문자열과 정확히 같다(소수 10자리에서 오차를 정리한 뒤 소수 2자리로 0 방향 버림, 세 자리마다 쉼표, 끝에 "%")
     * @then 결과 앞에 "+" 등 부호가 붙지 않는다
     * @then 음수 입력이어도 "−"(U+2212)·"-" 등 부호가 붙지 않는다(−9.702 → "9.70%"이며 "−9.70%"가 아니다)
     */
    it("[DoD-18] 거리는 부호 없이 소수 2자리로 버리고 천 단위 구분과 %를 붙여 표시한다", () => {
      const cases: [v: number, expected: string][] = [
        [9.702, "9.70%"],
        [9.638100000000007, "9.63%"], // 버림(사사오입이면 9.64)
        [19.735100000000006, "19.73%"],
        [1993.456, "1,993.45%"], // 버림과 천 단위 구분
        [1234567.891, "1,234,567.89%"], // 천 단위 구분
        [0.3499999999999943, "0.35%"], // 오차 정리(정리 없이 버리면 0.34)
        [0, "0.00%"],
        [-9.702, "9.70%"], // 음수여도 부호 없음
      ];
      for (const [v, expected] of cases) {
        const result = formatDistance(v);
        expect(result, `${v}`).toBe(expected);
        // "+"·"−"(U+2212)·"-" 부호가 앞에 붙지 않는다
        expect(result, `${v}`).not.toMatch(/^[+\-−]/);
      }
    });

    /**
     * @spec DoD-18
     * @given 값이 없는 표본을 하나씩 넣는다: null, NaN, Infinity, −Infinity
     * @when 거리를 표시한다
     * @then 모든 결과가 "—"(U+2014 EM DASH) 한 글자와 정확히 같다
     */
    it("[DoD-18] 값이 없거나 유한하지 않으면 —를 돌려준다", () => {
      for (const v of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(formatDistance(v), `${v}`).toBe(EM_DASH);
      }
    });
  });

  describe("손절 전 청산 판정", () => {
    /**
     * @spec DoD-23
     * @given 조건을 만족하는 표본을 하나씩 넣는다(side, stop, liq): ("long", 90000, 90298), 경계 같음 ("long", 90298, 90298), ("short", 110000, 109638.1), 경계 같음 ("short", 109638.1, 109638.1)
     * @when 손절가가 청산가보다 불리한지 판정한다
     * @then 모든 결과가 true다(롱은 stop ≤ liq, 숏은 stop ≥ liq)
     */
    it("[DoD-23] 롱은 손절가 ≤ 청산가, 숏은 손절가 ≥ 청산가이면 true를 돌려준다", () => {
      const cases: [side: "long" | "short", stop: number, liq: number][] = [
        ["long", 90000, 90298],
        ["long", 90298, 90298], // 경계 같음
        ["short", 110000, 109638.1],
        ["short", 109638.1, 109638.1], // 경계 같음
      ];
      for (const [side, stop, liq] of cases) {
        expect(isStopBeforeLiquidation(side, stop, liq), `(${side}, ${stop}, ${liq})`).toBe(true);
      }
    });

    /**
     * @spec DoD-23
     * @given 조건을 만족하지 않는 표본을 하나씩 넣는다(side, stop, liq): ("long", 95000, 90298), ("long", 90298.1, 90298), ("short", 105000, 109638.1), ("short", 109638, 109638.1)
     * @when 손절가가 청산가보다 불리한지 판정한다
     * @then 모든 결과가 false다
     */
    it("[DoD-23] 롱은 손절가 > 청산가, 숏은 손절가 < 청산가이면 false를 돌려준다", () => {
      const cases: [side: "long" | "short", stop: number, liq: number][] = [
        ["long", 95000, 90298],
        ["long", 90298.1, 90298],
        ["short", 105000, 109638.1],
        ["short", 109638, 109638.1],
      ];
      for (const [side, stop, liq] of cases) {
        expect(isStopBeforeLiquidation(side, stop, liq), `(${side}, ${stop}, ${liq})`).toBe(false);
      }
    });

    /**
     * @spec DoD-23
     * @given 값이 비어 있는 표본을 "long"·"short" 각각으로 하나씩 넣는다(stop, liq): (null, 90298), (90000, null), (null, null)
     * @when 손절가가 청산가보다 불리한지 판정한다
     * @then 모든 결과가 false다
     */
    it("[DoD-23] 손절가나 청산가가 비어 있으면 false를 돌려준다", () => {
      const cases: [stop: number | null, liq: number | null][] = [
        [null, 90298],
        [90000, null],
        [null, null],
      ];
      for (const side of ["long", "short"] as const) {
        for (const [stop, liq] of cases) {
          expect(isStopBeforeLiquidation(side, stop, liq), `(${side}, ${stop}, ${liq})`).toBe(
            false,
          );
        }
      }
    });
  });

  describe("유지증거금률 첫 단계 한도 초과 판정", () => {
    /**
     * @spec DoD-25
     * @given 포지션 가치가 한도를 넘는 표본을 하나씩 넣는다(entryPrice, qty, riskLimitValue → 진입가 × 수량): (100000, 3.001, 300000) → 300100, (100000, 1, 50000) → 100000(SOLUSDT 한도), (100000, 0.1, 5000) → 10000
     * @when 첫 단계 한도를 넘는지 판정한다
     * @then 모든 결과가 true다
     */
    it("[DoD-25] 진입가 × 수량이 한도보다 크면 true를 돌려준다", () => {
      const cases: [entryPrice: number, qty: number, riskLimitValue: number][] = [
        [100000, 3.001, 300000], // 300100
        [100000, 1, 50000], // 100000 (SOLUSDT 한도)
        [100000, 0.1, 5000], // 10000
      ];
      for (const [entryPrice, qty, riskLimitValue] of cases) {
        expect(
          exceedsFirstTier(entryPrice, qty, riskLimitValue),
          `(${entryPrice}, ${qty}, ${riskLimitValue})`,
        ).toBe(true);
      }
    });

    /**
     * @spec DoD-25
     * @given 포지션 가치가 한도 이하인 표본을 하나씩 넣는다(entryPrice, qty, riskLimitValue → 진입가 × 수량): 경계 같음 (100000, 3, 300000) → 300000, 경계 같음 (150, 2000, 300000) → 300000, (100000, 0.1, 300000) → 10000
     * @when 첫 단계 한도를 넘는지 판정한다
     * @then 모든 결과가 false다
     */
    it("[DoD-25] 진입가 × 수량이 한도와 같거나 작으면 false를 돌려준다", () => {
      const cases: [entryPrice: number, qty: number, riskLimitValue: number][] = [
        [100000, 3, 300000], // 경계 같음 300000
        [150, 2000, 300000], // 경계 같음 300000
        [100000, 0.1, 300000], // 10000
      ];
      for (const [entryPrice, qty, riskLimitValue] of cases) {
        expect(
          exceedsFirstTier(entryPrice, qty, riskLimitValue),
          `(${entryPrice}, ${qty}, ${riskLimitValue})`,
        ).toBe(false);
      }
    });

    /**
     * @spec DoD-25
     * @given riskLimitValue 1에서 진입가·수량이 무효인 표본을 하나씩 넣는다(entryPrice, qty): (null, 3), (100000, null), (0, 3), (100000, 0), (−100000, 3), (100000, −3), 곱이 한도보다 큰 (−100000, −3)
     * @when 첫 단계 한도를 넘는지 판정한다
     * @then 모든 결과가 false다(계약: entryPrice 또는 qty가 null이거나 0 이하이면 false)
     */
    it("[DoD-25] 진입가나 수량이 비었거나 0 이하이면 false를 돌려준다", () => {
      const cases: [entryPrice: number | null, qty: number | null][] = [
        [null, 3],
        [100000, null],
        [0, 3],
        [100000, 0],
        [-100000, 3],
        [100000, -3],
        [-100000, -3], // 곱 300000이 한도 1보다 크다
      ];
      for (const [entryPrice, qty] of cases) {
        expect(exceedsFirstTier(entryPrice, qty, 1), `(${entryPrice}, ${qty}, 1)`).toBe(false);
      }
    });
  });
});

describe("청산가 계산 — Bybit 도움말 예시와 같은 청산가를 낸다", () => {
  describe("UTA 격리 모드 청산가 예시", () => {
    /**
     * @spec DoD-10
     * @given 출처 Bybit 도움말(UTA 격리 모드 청산가) 예시: 롱, 진입가 40000, 수량 1, mmr 0.005, 담보 3801.65(= 개시증거금 800 + 추가 증거금 3000 × (1 + 테이커 수수료 0.00055)), 예시 청산가 36,380.25
     * @when liquidationPrice({ side: "long", entryPrice: 40000, qty: 1, collateral: 3801.65, mmr: 0.005 })로 청산가를 계산한다
     * @then 결과가 36380.25와 소수 2자리까지 같다(손계산 36198.35 ÷ 0.995 = 36380.25125…)
     */
    it("[DoD-10] Bybit 도움말 예시 입력의 청산가가 36,380.25와 소수 2자리까지 같다", () => {
      // 담보 3801.65 = 개시증거금 800 + 추가 증거금 3000 × (1 + 0.00055)
      // 손계산: (40000 × 1 − 3801.65) ÷ (1 × (1 − 0.005)) = 36198.35 ÷ 0.995 = 36380.25125…
      const result = liquidationPrice({
        side: "long",
        entryPrice: 40000,
        qty: 1,
        collateral: 3801.65,
        mmr: 0.005,
      });
      expect(result).not.toBeNull();
      expect(result).toBeCloseTo(36380.25, 2);
    });
  });
});
