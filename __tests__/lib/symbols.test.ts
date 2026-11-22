import { describe, expect, it } from "vitest";

import { SYMBOLS, SYMBOLS_AS_OF } from "@/lib/symbols";

describe("심볼 정보 — 계산기가 쓰는 심볼 값이 기준일의 Bybit 조회값과 같다", () => {
  describe("기록된 심볼 값", () => {
    /**
     * @spec DoD-1
     * @given 스펙 심볼 정보 표의 세 행을 기대값으로 둔다: BTCUSDT maxLeverage 150, tickSize 0.1, priceScale 2, qtyStep 0.001, minOrderQty 0.001, maintenanceTier.mmr 0.0033, maintenanceTier.riskLimitValue 300000, marginDecimals 2 / ETHUSDT maxLeverage 150, tickSize 0.01, priceScale 2, qtyStep 0.01, minOrderQty 0.01, maintenanceTier.mmr 0.0033, maintenanceTier.riskLimitValue 300000, marginDecimals 2 / SOLUSDT maxLeverage 100, tickSize 0.01, priceScale 3, qtyStep 0.1, minOrderQty 0.1, maintenanceTier.mmr 0.005, maintenanceTier.riskLimitValue 50000, marginDecimals 3
     * @when 심볼 목록 SYMBOLS를 읽는다
     * @then 목록의 심볼은 BTCUSDT·ETHUSDT·SOLUSDT 세 개뿐이다
     * @then 각 심볼의 maxLeverage·tickSize·priceScale·qtyStep·minOrderQty·maintenanceTier.mmr·maintenanceTier.riskLimitValue·marginDecimals가 같은 심볼 행의 기대값과 정확히 같다
     */
    it("[DoD-1] 세 심볼의 값이 심볼 정보 표와 같다", () => {
      // 스펙 3장 심볼 정보 표(2026-11-22 Bybit 조회값)를 그대로 옮긴 기대값
      const expected = [
        {
          symbol: "BTCUSDT",
          maxLeverage: 150,
          tickSize: 0.1,
          priceScale: 2,
          qtyStep: 0.001,
          minOrderQty: 0.001,
          maintenanceTier: { mmr: 0.0033, riskLimitValue: 300000 },
          marginDecimals: 2,
        },
        {
          symbol: "ETHUSDT",
          maxLeverage: 150,
          tickSize: 0.01,
          priceScale: 2,
          qtyStep: 0.01,
          minOrderQty: 0.01,
          maintenanceTier: { mmr: 0.0033, riskLimitValue: 300000 },
          marginDecimals: 2,
        },
        {
          symbol: "SOLUSDT",
          maxLeverage: 100,
          tickSize: 0.01,
          priceScale: 3,
          qtyStep: 0.1,
          minOrderQty: 0.1,
          maintenanceTier: { mmr: 0.005, riskLimitValue: 50000 },
          marginDecimals: 3,
        },
      ];

      // 심볼은 세 개뿐이다(순서는 F-1 소관이라 보지 않는다)
      expect(SYMBOLS.map((s) => s.symbol).sort()).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);

      for (const row of expected) {
        const info = SYMBOLS.find((s) => s.symbol === row.symbol);
        expect(info, `${row.symbol}`).toBeDefined();
        if (!info) continue;
        expect(
          {
            symbol: info.symbol,
            maxLeverage: info.maxLeverage,
            tickSize: info.tickSize,
            priceScale: info.priceScale,
            qtyStep: info.qtyStep,
            minOrderQty: info.minOrderQty,
            maintenanceTier: {
              mmr: info.maintenanceTier.mmr,
              riskLimitValue: info.maintenanceTier.riskLimitValue,
            },
            marginDecimals: info.marginDecimals,
          },
          `${row.symbol}`,
        ).toEqual(row);
      }
    });

    /**
     * @spec DoD-1
     * @given 스펙의 심볼 정보 기준일은 2026-11-22다
     * @when 심볼 정보 기준일 SYMBOLS_AS_OF를 읽는다
     * @then 값이 정확히 문자열 "2026-11-22"(YYYY-MM-DD)다
     */
    it("[DoD-1] 심볼 정보 기준일은 '2026-11-22'다", () => {
      expect(SYMBOLS_AS_OF).toBe("2026-11-22");
    });
  });

  describe("심볼 값의 일관성", () => {
    /**
     * @spec DoD-2
     * @given SYMBOLS의 모든 심볼을 순회한다(참고: 현재 데이터는 BTCUSDT·ETHUSDT·SOLUSDT이며, 값 리터럴은 판정 근거가 아니다)
     * @when maxLeverage·tickSize·qtyStep·minOrderQty·maintenanceTier.mmr·maintenanceTier.riskLimitValue를 읽는다
     * @then 여섯 값이 모두 0보다 크다
     * @then minOrderQty ÷ qtyStep이 정수다(부동소수점 오차로 배수가 아니라고 판정하지 않는다)
     */
    it("[DoD-2] 모든 심볼의 주요 값은 0보다 크고 최소 주문 수량은 수량 단위의 배수다", () => {
      for (const info of SYMBOLS) {
        const positives = {
          maxLeverage: info.maxLeverage,
          tickSize: info.tickSize,
          qtyStep: info.qtyStep,
          minOrderQty: info.minOrderQty,
          "maintenanceTier.mmr": info.maintenanceTier.mmr,
          "maintenanceTier.riskLimitValue": info.maintenanceTier.riskLimitValue,
        };
        for (const [name, value] of Object.entries(positives)) {
          expect(value, `${info.symbol} ${name}`).toBeGreaterThan(0);
        }

        // 배수 판정: 스펙 DoD-3의 부동소수점 오차 정의를 그대로 쓴다.
        // 단위 수 q와 가장 가까운 정수의 차가 1e-12 × max(1, |q|) 이하이면 정수(배수)로 본다.
        const q = info.minOrderQty / info.qtyStep;
        const tolerance = 1e-12 * Math.max(1, Math.abs(q));
        expect(
          Math.abs(q - Math.round(q)),
          `${info.symbol} minOrderQty ÷ qtyStep = ${q}`,
        ).toBeLessThanOrEqual(tolerance);
      }
    });
  });
});
