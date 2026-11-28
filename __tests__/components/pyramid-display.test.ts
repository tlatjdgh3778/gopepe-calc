import { describe, expect, it } from "vitest";

import {
  formatFillPrice,
  formatLeverage,
  formatMultiple,
  formatRiskReward,
  formatRoeFill,
  pathChartPoints,
} from "@/components/pyramid/display";
import type { PyramidRow } from "@/lib/pyramid";

// display.ts 고유 표시 규칙만 다룬다. 기준 사례 P1·P2의 요약·익절·손절 표시값은 컴포넌트 테스트(T-8·T-10)가 맡는다.
// 실효 레버리지·손익비·배수는 천 단위 구분과 소수 2자리 버림(반올림 아님) 경계 표본을 쓴다(스펙 DoD-18).
//
// P1 경로(스펙 §3 "기준 사례"): 최초 진입(진입가 1900, 평단 1900, 청산가 1526.9236… → 1,526.93), 1차(2100, 평단 1964.5161…, 청산가 1714.7791… → 1,714.78),
// 2차(2300, 평단 2066.1779…, 청산가 1895.1973… → 1,895.20).
// 배율 기호는 U+00D7(×)로 정확히 비교한다(계획 T-7 완료 조건 1).

type Excluded = PyramidRow["excluded"];

/** 경로 행 리터럴(테스트마다 새 객체). 차트 점 변환에 쓰지 않는 칸은 제외 행 규칙(0·null)으로 채운다 */
function row(
  price: number | null,
  avgPrice: number,
  liquidationPrice: number | null,
  excluded: Excluded = null,
): PyramidRow {
  return {
    price,
    reinvestPercent: null,
    pnlAtStep: null,
    marginUsed: 0,
    addedQty: 0,
    avgPrice,
    liquidationPrice,
    excluded,
  };
}

describe("피라미딩 결과 표시 — 계산 원값을 화면 표시 형식으로 바꾼다", () => {
  describe("실효 레버리지·손익비·배수 표시 형식", () => {
    /**
     * @spec DoD-18
     * @given 실효 레버리지 원값 표본을 하나씩 넣는다: 천 단위 표본 2534.2105263157896, 버림 경계 표본 3.999
     * @when 실효 레버리지 표시 문자열을 만든다
     * @then 소수 2자리 버림(천 단위 구분) + `×`(U+00D7)로 천 단위 표본 `2,534.21×`, 버림 경계 표본 `3.99×`(반올림한 `4.00×`가 아니다)다
     */
    it("[DoD-18] 실효 레버리지는 소수 2자리 버림·천 단위 구분 + ×로 표시된다", () => {
      const cases: [v: number, expected: string][] = [
        [2534.2105263157896, "2,534.21×"],
        [3.999, "3.99×"],
      ];
      for (const [v, expected] of cases) {
        expect(formatLeverage(v), `실효 레버리지 ${v}`).toBe(expected);
      }
    });

    /**
     * @spec DoD-18
     * @given 손익비 원값 표본을 하나씩 넣는다: 버림 경계 표본 2.999, 정수 표본 3
     * @when 손익비 표시 문자열을 만든다
     * @then `1 : {소수 2자리 버림}` 형식으로 `1 : 2.99`(반올림한 `1 : 3.00`이 아니다), `1 : 3.00`이다
     */
    it("[DoD-18] 손익비는 1 : {소수 2자리 버림}으로 표시된다", () => {
      const cases: [v: number, expected: string][] = [
        [2.999, "1 : 2.99"],
        [3, "1 : 3.00"],
      ];
      for (const [v, expected] of cases) {
        expect(formatRiskReward(v), `손익비 ${v}`).toBe(expected);
      }
    });

    /**
     * @spec DoD-18
     * @given 추가 진입 효과 배수 원값 표본을 하나씩 넣는다: 천 단위 표본 1234.5678, 버림 경계 표본 1.999
     * @when 배수 표시 문자열을 만든다
     * @then `{소수 2자리 버림(천 단위 구분)}배` 형식으로 천 단위 표본 `1,234.56배`, 버림 경계 표본 `1.99배`(반올림한 `2.00배`가 아니다)다
     */
    it("[DoD-18] 추가 진입 효과 배수는 소수 2자리 버림·천 단위 구분 + 배로 표시된다", () => {
      const cases: [v: number, expected: string][] = [
        [1234.5678, "1,234.56배"],
        [1.999, "1.99배"],
      ];
      for (const [v, expected] of cases) {
        expect(formatMultiple(v), `배수 ${v}`).toBe(expected);
      }
    });
  });

  describe("목표 수익률로 익절가 자동 채움", () => {
    /**
     * @spec DoD-22
     * @given 틱에 맞춘 가격 표본을 하나씩 넣는다: 12345.67(천 단위 자리), 2100.1(끝자리 0이 생길 수 있는 값), 2500(정수), 1e21(지수 표기가 생기는 크기)
     * @when 익절가 입력란에 자동으로 채울 가격 문자열을 만든다
     * @then 천 단위 구분·지수 표기·끝자리 0 없이 `12345.67`, `2100.1`, `2500`, `1000000000000000000000`이다
     * @then 결과 문자열에 `,`·`e`·`E`가 없고 소수점이 있으면 마지막 글자가 `0`이 아니다
     */
    it("[DoD-22] 자동 채움 가격 문자열은 천 단위 구분·지수 표기·끝자리 0 없이 쓴다", () => {
      const cases: [v: number, expected: string][] = [
        [12345.67, "12345.67"],
        [2100.1, "2100.1"],
        [2500, "2500"],
        [1e21, "1000000000000000000000"],
      ];
      for (const [v, expected] of cases) {
        const text = formatFillPrice(v);
        expect(text, `가격 ${v}`).toBe(expected);
        expect(
          /[,eE]/.test(text),
          `가격 ${v}: \`,\`·\`e\`·\`E\`가 없어야 한다 (실제 ${text})`,
        ).toBe(false);
        expect(
          text.includes(".") && text.endsWith("0"),
          `가격 ${v}: 소수점이 있으면 끝자리가 0이 아니어야 한다 (실제 ${text})`,
        ).toBe(false);
      }
    });
  });

  describe("익절가로 목표 수익률 다시 채움", () => {
    /**
     * @spec DoD-23
     * @given netPnl(익절가) ÷ margin × 100 원값 표본을 하나씩 넣는다: 천 단위 표본 46528.42105263158, 음수 표본 −38.132197341179034
     * @when 목표 수익률 입력란에 다시 채울 문자열을 만든다
     * @then 소수 2자리 버림 값으로 천 단위 구분 없이 `46528.42`, `-38.13`(목표 수익률 입력란이 받는 맨 앞 `-` U+002D)이다
     */
    it("[DoD-23] 다시 채우는 목표 수익률은 소수 2자리 버림·천 단위 구분 없는 문자열이다", () => {
      const cases: [v: number, expected: string][] = [
        [46528.42105263158, "46528.42"],
        // −38.132197341179034(@given 리터럴)은 같은 double −38.13219734117904로 읽힌다
        [-38.13219734117904, "-38.13"],
      ];
      for (const [v, expected] of cases) {
        expect(formatRoeFill(v), `목표 수익률 ${v}`).toBe(expected);
      }
    });
  });

  describe("경로 차트 점", () => {
    /**
     * @spec DoD-21 DoD-19
     * @given 기준 사례 P1(롱, tickSize 0.01)의 경로 행 3개(최초 1900·평단 1900·청산가 1526.9236560758923, 1차 2100·평단 1964.516129032258·청산가 1714.7791578221313, 2차 2300·평단 2066.177908113392·청산가 1895.1973259316208)와 기준 사례 P2(숏, tickSize 0.01)의 경로 행 3개(최초 150·평단 150·청산가 164.00725970861717, 1차 140·평단 147.3684210526316·청산가 157.4660633484163, 2차 130·평단 138.46153846153845·청산가 142.9764805330416)를 하나씩 넣고, 각 경로의 1차와 2차 사이에 excluded가 null이 아닌 행(invalidInput·notProfitDirection·empty 중 하나씩)을 끼운 표본을 넣는다
     * @when 경로 차트 점 목록을 만든다
     * @then 각 경로의 점은 최초 진입과 포함된 단계 순서대로 3개이고 제외된 행의 점은 없다
     * @then 각 점의 진입가·누적 평단은 원값(P1 1900·1900, 2100·1964.516129032258, 2300·2066.177908113392 / P2 150·150, 140·147.3684210526316, 130·138.46153846153845)이다
     * @then P1(롱) 점의 청산가는 틱 올림 값 1526.93, 1714.78, 1895.2다
     * @then P2(숏) 점의 청산가는 틱 내림 값 164, 157.46, 142.97이다(올림이면 164.01, 157.47, 142.98이 된다)
     */
    it("[DoD-21][DoD-19] 차트 점은 최초 진입과 포함된 단계 순서이고 제외 단계는 점이 없으며 청산가는 틱 값이다", () => {
      type Path = {
        id: string;
        side: "long" | "short";
        rows: [price: number, avgPrice: number, liquidationPrice: number][];
        liquidation: [number, number, number];
      };
      const paths: Path[] = [
        {
          id: "P1",
          side: "long",
          rows: [
            [1900, 1900, 1526.9236560758923],
            [2100, 1964.516129032258, 1714.7791578221313],
            [2300, 2066.177908113392, 1895.1973259316208],
          ],
          liquidation: [1526.93, 1714.78, 1895.2],
        },
        {
          id: "P2",
          side: "short",
          rows: [
            [150, 150, 164.00725970861717],
            [140, 147.3684210526316, 157.4660633484163],
            [130, 138.46153846153845, 142.9764805330416],
          ],
          liquidation: [164, 157.46, 142.97],
        },
      ];
      const exclusions: Excluded[] = ["invalidInput", "notProfitDirection", "empty"];
      for (const path of paths) {
        for (const excluded of exclusions) {
          const label = `${path.id} + ${excluded} 행`;
          const [first, second, third] = path.rows.map(([p, a, l]) => row(p, a, l));
          // 제외 행은 직전 값(1차의 평단·청산가)을 가진다
          const inserted = row(
            path.id === "P1" ? 2200 : 135,
            second.avgPrice,
            second.liquidationPrice,
            excluded,
          );
          const points = pathChartPoints([first, second, inserted, third], path.side, 0.01);
          expect(points.length, `${label}: 점 수`).toBe(3);
          expect(
            points.map((pt) => [pt.price, pt.avgPrice]),
            `${label}: 진입가·누적 평단`,
          ).toEqual(path.rows.map(([p, a]) => [p, a]));
          expect(
            points.map((pt) => pt.liquidation),
            `${label}: 틱 청산가`,
          ).toEqual(path.liquidation);
        }
      }
    });

    /**
     * @spec EC-8
     * @given 청산가 원값이 0 이하인 경로 행 표본을 하나씩 넣는다: 롱, 최초 진입가 1000, 평단 1000, 청산가 원값 0, 롱, 최초 진입가 1000, 평단 1000, 청산가 원값 −12.5
     * @when 경로 차트 점 목록을 만든다
     * @then 그 점의 청산가 값이 비어 있다(숫자가 아니다)
     * @then 그 점의 진입가·누적 평단은 1000·1000으로 남는다
     * @then 점 목록 어디에도 NaN·Infinity가 없다
     */
    it("[EC-8] 청산가 원값이 0 이하인 단계는 차트의 청산가 점을 비운다", () => {
      for (const liquidationPrice of [0, -12.5]) {
        const label = `청산가 원값 ${liquidationPrice}`;
        const points = pathChartPoints([row(1000, 1000, liquidationPrice)], "long", 0.01);
        expect(points.length, `${label}: 점 수`).toBe(1);
        const [point] = points;
        expect(typeof point.liquidation, `${label}: 청산가 값이 비어 있어야 한다`).not.toBe(
          "number",
        );
        expect(point.price, `${label}: 진입가`).toBe(1000);
        expect(point.avgPrice, `${label}: 누적 평단`).toBe(1000);
        const numbers = Object.values(point).filter((v): v is number => typeof v === "number");
        expect(
          numbers.every((v) => Number.isFinite(v)),
          `${label}: NaN·Infinity가 없어야 한다 (${JSON.stringify(numbers)})`,
        ).toBe(true);
      }
    });
  });
});
