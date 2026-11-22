import { describe, expect, it } from "vitest";

import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";
import { checkLeverage, checkQty } from "@/lib/validation";

/** 심볼 목록에서 실제 심볼 정보를 찾는다. */
function symbolInfo(symbol: SymbolInfo["symbol"]): SymbolInfo {
  const info = SYMBOLS.find((s) => s.symbol === symbol);
  if (!info) throw new Error(`SYMBOLS에 ${symbol}이 없다`);
  return info;
}

const SYMBOL_NAMES: SymbolInfo["symbol"][] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

describe("입력 경고 판정 — 레버리지와 수량이 심볼 규칙을 어기면 어떤 경고인지 안다", () => {
  describe("레버리지 최대치", () => {
    /**
     * @spec DoD-7
     * @given 심볼 목록의 실제 심볼 정보와 maxLeverage를 넘는 레버리지 표본을 하나씩 짝지어 넣는다: BTCUSDT(maxLeverage 150) 151, 1000 / ETHUSDT(maxLeverage 150) 151 / SOLUSDT(maxLeverage 100) 101, 120, 150
     * @when 레버리지를 판정한다
     * @then 모든 결과가 "exceedsMax"다
     */
    it("[DoD-7] 레버리지가 심볼의 maxLeverage보다 크면 'exceedsMax'다", () => {
      const cases: [symbol: SymbolInfo["symbol"], value: number][] = [
        ["BTCUSDT", 151],
        ["BTCUSDT", 1000],
        ["ETHUSDT", 151],
        ["SOLUSDT", 101],
        ["SOLUSDT", 120],
        ["SOLUSDT", 150],
      ];
      for (const [symbol, value] of cases) {
        expect(checkLeverage(value, symbolInfo(symbol)), `${symbol} ${value}`).toBe("exceedsMax");
      }
    });

    /**
     * @spec DoD-7
     * @given 심볼 목록의 실제 심볼 정보와 maxLeverage 이하인 레버리지 표본을 하나씩 짝지어 넣는다: BTCUSDT(maxLeverage 150) 1, 120, 150(최대치와 같음) / ETHUSDT(maxLeverage 150) 150 / SOLUSDT(maxLeverage 100) 1, 100(최대치와 같음)
     * @when 레버리지를 판정한다
     * @then 모든 결과가 null이다
     */
    it("[DoD-7] 레버리지가 심볼의 maxLeverage 이하이면 null이다", () => {
      const cases: [symbol: SymbolInfo["symbol"], value: number][] = [
        ["BTCUSDT", 1],
        ["BTCUSDT", 120],
        ["BTCUSDT", 150],
        ["ETHUSDT", 150],
        ["SOLUSDT", 1],
        ["SOLUSDT", 100],
      ];
      for (const [symbol, value] of cases) {
        expect(checkLeverage(value, symbolInfo(symbol)), `${symbol} ${value}`).toBeNull();
      }
    });
  });

  describe("최소 주문 수량", () => {
    /**
     * @spec DoD-8
     * @given 심볼 목록의 실제 심볼 정보와 minOrderQty보다 작은 수량 표본을 하나씩 짝지어 넣는다: BTCUSDT(minOrderQty 0.001) 0, 0.0005(qtyStep의 배수도 아님), 0.0009 / ETHUSDT(minOrderQty 0.01) 0, 0.005 / SOLUSDT(minOrderQty 0.1) 0, 0.05, 0.09
     * @when 수량을 판정한다
     * @then 모든 결과가 "belowMin"이다(qtyStep의 배수가 아닌 표본도 "notStepMultiple"이 아니다)
     */
    it("[DoD-8] 수량이 minOrderQty보다 작으면 'belowMin'이다", () => {
      const cases: [symbol: SymbolInfo["symbol"], value: number][] = [
        ["BTCUSDT", 0],
        ["BTCUSDT", 0.0005],
        ["BTCUSDT", 0.0009],
        ["ETHUSDT", 0],
        ["ETHUSDT", 0.005],
        ["SOLUSDT", 0],
        ["SOLUSDT", 0.05],
        ["SOLUSDT", 0.09],
      ];
      for (const [symbol, value] of cases) {
        expect(checkQty(value, symbolInfo(symbol)), `${symbol} ${value}`).toBe("belowMin");
      }
    });
  });

  describe("수량 단위", () => {
    /**
     * @spec DoD-8
     * @given 심볼 목록의 실제 심볼 정보와 minOrderQty 이상이지만 qtyStep의 배수가 아닌 수량 표본을 하나씩 짝지어 넣는다: BTCUSDT(qtyStep 0.001) 0.0015, 0.2005, 0.00100000000001(단위 수 1.00000000001, 허용치 밖의 작은 차이) / ETHUSDT(qtyStep 0.01) 0.015, 0.075 / SOLUSDT(qtyStep 0.1) 0.15, 1.05
     * @when 수량을 판정한다
     * @then 모든 결과가 "notStepMultiple"이다
     */
    it("[DoD-8] minOrderQty 이상이지만 qtyStep의 배수가 아닌 수량은 'notStepMultiple'이다", () => {
      const cases: [symbol: SymbolInfo["symbol"], value: number][] = [
        ["BTCUSDT", 0.0015],
        ["BTCUSDT", 0.2005],
        // 허용치 밖의 작은 차이: 단위 수 1.00000000001
        ["BTCUSDT", 0.00100000000001],
        ["ETHUSDT", 0.015],
        ["ETHUSDT", 0.075],
        ["SOLUSDT", 0.15],
        ["SOLUSDT", 1.05],
      ];
      for (const [symbol, value] of cases) {
        expect(checkQty(value, symbolInfo(symbol)), `${symbol} ${value}`).toBe("notStepMultiple");
      }
    });

    /**
     * @spec DoD-8
     * @given 심볼 목록의 실제 심볼 정보와 minOrderQty 이상이고 qtyStep의 배수인 오차 경계 수량 표본을 하나씩 짝지어 넣는다: minOrderQty와 같은 값 BTCUSDT 0.001, ETHUSDT 0.01, SOLUSDT 0.1 / 나눗셈 오차가 나는 배수 SOLUSDT 0.3(0.3 ÷ 0.1 = 2.9999999999999996), ETHUSDT 0.07(0.07 ÷ 0.01 = 7.000000000000001), ETHUSDT 0.29(0.29 ÷ 0.01 = 28.999999999999996) / 큰 배수 BTCUSDT 262.441(262.441 ÷ 0.001 = 262440.99999999994, 허용치 안의 차이), BTCUSDT 512.003(512.003 ÷ 0.001 = 512003.00000000006, 허용치 안의 차이), SOLUSDT 30000.3, SOLUSDT 26214.6(26214.6 ÷ 0.1 = 262145.99999999994, 허용치 안의 차이) / 그 밖의 배수 BTCUSDT 0.003, 0.2, SOLUSDT 1.1
     * @when 수량을 판정한다
     * @then 모든 결과가 null이다(부동소수점 오차로 "notStepMultiple"이 나오지 않는다)
     */
    it("[DoD-8] minOrderQty 이상이고 qtyStep의 배수인 수량은 null이다", () => {
      const cases: [symbol: SymbolInfo["symbol"], value: number][] = [
        ["BTCUSDT", 0.001],
        ["ETHUSDT", 0.01],
        ["SOLUSDT", 0.1],
        ["SOLUSDT", 0.3],
        ["ETHUSDT", 0.07],
        ["ETHUSDT", 0.29],
        ["BTCUSDT", 0.003],
        ["BTCUSDT", 0.2],
        ["SOLUSDT", 1.1],
        // 큰 배수: 단위 수가 정수와 허용치 안에서 다르다
        ["BTCUSDT", 262.441],
        ["BTCUSDT", 512.003],
        ["SOLUSDT", 30000.3],
        ["SOLUSDT", 26214.6],
      ];
      for (const [symbol, value] of cases) {
        expect(checkQty(value, symbolInfo(symbol)), `${symbol} ${value}`).toBeNull();
      }
    });
  });

  describe("값이 없는 입력", () => {
    /**
     * @spec DoD-7
     * @given 값이 없는(null) 레버리지를 심볼 목록의 실제 심볼 정보 BTCUSDT·ETHUSDT·SOLUSDT와 하나씩 짝지어 넣는다
     * @when 레버리지를 판정한다
     * @then 모든 결과가 null이다("exceedsMax"가 아니다)
     */
    it("[DoD-7] 레버리지가 null이면 null이다", () => {
      for (const symbol of SYMBOL_NAMES) {
        expect(checkLeverage(null, symbolInfo(symbol)), `${symbol}`).toBeNull();
      }
    });

    /**
     * @spec DoD-8
     * @given 값이 없는(null) 수량을 심볼 목록의 실제 심볼 정보 BTCUSDT·ETHUSDT·SOLUSDT와 하나씩 짝지어 넣는다
     * @when 수량을 판정한다
     * @then 모든 결과가 null이다("belowMin"·"notStepMultiple"이 아니다)
     */
    it("[DoD-8] 수량이 null이면 null이다", () => {
      for (const symbol of SYMBOL_NAMES) {
        expect(checkQty(null, symbolInfo(symbol)), `${symbol}`).toBeNull();
      }
    });
  });
});
