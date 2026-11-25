import { describe, expect, it } from "vitest";

import { averageEntry } from "@/lib/average-entry";

// 기준 사례 (스펙 docs/specs/average-entry.md §3 "DoD-3·DoD-4 기준 사례" 표). 값은 바꾸지 않고 옮긴다.
//
// | ID | 심볼    | 진입 행 (진입가, 수량)                       | 평균 진입가 원값 | 평균 진입가 표시 | 총 수량 표시 |
// | A1 | BTCUSDT | (100000, 0.001), (100000.1, 0.002)           | 100000.0666…     | 100,000.06       | 0.003 BTC    |
// | A2 | ETHUSDT | (3000, 0.5), (2800, 1.5)                     | 2850             | 2,850.00         | 2.00 ETH     |
// | A3 | ETHUSDT | (2500.55, 0.33), (2400.01, 0.67)             | 2433.1882        | 2,433.18         | 1.00 ETH     |
// | A4 | SOLUSDT | (150, 10), (140, 5), (120, 5)                | 140              | 140.000          | 20.0 SOL     |
// | A5 | SOLUSDT | (150.123, 1), (150.124, 2)                   | 150.123666…      | 150.123          | 3.0 SOL      |
//
// 단위 테스트는 표의 진입 행과 원값(avgPrice·totalQty)만 쓴다. 표시 형식은 컴포넌트 테스트 몫이다.
// 손계산: A1 Σ(p×q) = 100 + 200.0002 = 300.0002, Σq = 0.003 → 100000.0666…
//         A2 Σ(p×q) = 1500 + 4200 = 5700, Σq = 2 → 2850
//         A3 Σ(p×q) = 825.1815 + 1608.0067 = 2433.1882, Σq = 1 → 2433.1882
//         A4 Σ(p×q) = 1500 + 700 + 600 = 2800, Σq = 20 → 140
//         A5 Σ(p×q) = 150.123 + 300.248 = 450.371, Σq = 3 → 150.123666…
//         작은 가격 표본(기준 사례 외, 소수 10자리 반올림 구현 배제용) Σ(p×q) = 0.0001234 + 0.000247 = 0.0003704, Σq = 3 → 0.000123466666…

type Entry = { price: number; qty: number };

/** 상대 오차 허용치(DoD-1·DoD-2 검증 방법) */
const REL_TOL = 1e-12;

/** |실제 − 기대| ≤ 1e-12 × |기대|인지 확인한다 */
function expectRelClose(actual: number, expected: number, label: string): void {
  expect(Number.isFinite(actual), `${label}: 유한한 값이어야 한다 (실제 ${actual})`).toBe(true);
  expect(
    Math.abs(actual - expected),
    `${label}: 실제 ${actual}, 기대 ${expected}`,
  ).toBeLessThanOrEqual(REL_TOL * Math.abs(expected));
}

// 기준 사례 A1~A5 진입 행 (스펙 §3 표)
const A1: readonly Entry[] = [
  { price: 100000, qty: 0.001 },
  { price: 100000.1, qty: 0.002 },
];
const A2: readonly Entry[] = [
  { price: 3000, qty: 0.5 },
  { price: 2800, qty: 1.5 },
];
const A3: readonly Entry[] = [
  { price: 2500.55, qty: 0.33 },
  { price: 2400.01, qty: 0.67 },
];
const A4: readonly Entry[] = [
  { price: 150, qty: 10 },
  { price: 140, qty: 5 },
  { price: 120, qty: 5 },
];
const A5: readonly Entry[] = [
  { price: 150.123, qty: 1 },
  { price: 150.124, qty: 2 },
];
/** 작은 가격 표본(기준 사례 외) */
const SMALL: readonly Entry[] = [
  { price: 0.0001234, qty: 1 },
  { price: 0.0001235, qty: 2 },
];

/** 상수 표본을 테스트마다 새 배열·새 객체로 복사한다 */
function fresh(entries: readonly Entry[]): Entry[] {
  return entries.map((e) => ({ ...e }));
}

describe("평균 진입가 — 진입 행들의 평균 진입가와 총 수량을 계산한다", () => {
  describe("반올림하지 않은 평균 진입가와 총 수량", () => {
    /**
     * @spec DoD-1 DoD-2
     * @given 이진수로 정확히 표현되는 결과의 기준 사례를 하나씩 넣는다: A2 [(3000, 0.5), (2800, 1.5)], A4 [(150, 10), (140, 5), (120, 5)]
     * @when 평균 진입가를 계산한다
     * @then avgPrice가 Σ(진입가 × 수량) ÷ Σ수량의 손계산 리터럴(A2 2850, A4 140)과 === 비교로 정확히 같다
     * @then totalQty가 Σ수량의 손계산 리터럴(A2 2, A4 20)과 === 비교로 정확히 같다
     */
    it("[DoD-1][DoD-2] 정확 표본에서 avgPrice는 Σ(진입가×수량)÷Σ수량, totalQty는 Σ수량과 일치한다", () => {
      const cases: [id: string, entries: readonly Entry[], avgPrice: number, totalQty: number][] = [
        ["A2", A2, 2850, 2],
        ["A4", A4, 140, 20],
      ];
      for (const [id, entries, avgPrice, totalQty] of cases) {
        const result = averageEntry(fresh(entries));
        expect(result?.avgPrice, `${id} avgPrice`).toBe(avgPrice);
        expect(result?.totalQty, `${id} totalQty`).toBe(totalQty);
      }
    });

    /**
     * @spec DoD-1 DoD-2
     * @given 이진수로 정확히 표현되지 않는 결과의 표본을 하나씩 넣는다: A1 [(100000, 0.001), (100000.1, 0.002)], A3 [(2500.55, 0.33), (2400.01, 0.67)], A5 [(150.123, 1), (150.124, 2)], 작은 가격 표본 [(0.0001234, 1), (0.0001235, 2)]
     * @when 평균 진입가를 계산한다
     * @then avgPrice가 Σ(진입가 × 수량) ÷ Σ수량의 손계산 리터럴(A1 100000.06666666667, A3 2433.1882, A5 150.12366666666667, 작은 가격 표본 0.00012346666666666667)과 상대 오차 1e-12 이내로 같다(|실제 − 기대| ≤ 1e-12 × |기대|)
     * @then totalQty가 Σ수량의 손계산 리터럴(A1 0.003, A3 1, A5 3, 작은 가격 표본 3)과 상대 오차 1e-12 이내로 같다
     */
    it("[DoD-1][DoD-2] 오차 표본에서 avgPrice와 totalQty는 반올림하지 않은 원값과 상대 오차 1e-12 이내로 같다", () => {
      const cases: [id: string, entries: readonly Entry[], avgPrice: number, totalQty: number][] = [
        ["A1", A1, 100000.06666666667, 0.003],
        ["A3", A3, 2433.1882, 1],
        // 150.12366666666667(@then 리터럴)은 같은 double 150.12366666666668로 읽힌다
        ["A5", A5, 150.12366666666668, 3],
        ["작은 가격 표본", SMALL, 0.00012346666666666667, 3],
      ];
      for (const [id, entries, avgPrice, totalQty] of cases) {
        const result = averageEntry(fresh(entries));
        expect(result, `${id} 결과`).not.toBe(null);
        expectRelClose(result?.avgPrice ?? Number.NaN, avgPrice, `${id} avgPrice`);
        expectRelClose(result?.totalQty ?? Number.NaN, totalQty, `${id} totalQty`);
      }
    });

    /**
     * @spec DoD-1 DoD-2
     * @given 기준 사례 A1~A5의 진입 행 배열을 하나씩 넣고, 호출 전 배열과 각 행의 price·qty 값을 기록해 둔다
     * @when 평균 진입가를 계산한다
     * @then 호출 뒤 입력 배열의 길이·순서와 각 행의 price·qty가 호출 전과 같다(입력을 바꾸지 않는다)
     */
    it("[DoD-1][DoD-2] 계산은 입력 배열을 바꾸지 않는다", () => {
      const cases: [id: string, entries: readonly Entry[]][] = [
        ["A1", A1],
        ["A2", A2],
        ["A3", A3],
        ["A4", A4],
        ["A5", A5],
      ];
      for (const [id, entries] of cases) {
        const input = fresh(entries);
        const rows = [...input];
        const before = fresh(input);
        averageEntry(input);
        expect(input.length, `${id} 길이`).toBe(before.length);
        input.forEach((row, i) => {
          expect(row, `${id} ${i + 1}행 순서`).toBe(rows[i]);
        });
        expect(input, `${id} price·qty`).toEqual(before);
      }
    });
  });

  describe("계산할 수 없는 입력", () => {
    /**
     * @spec EC-6
     * @given 빈 배열 []을 넣는다
     * @when 평균 진입가를 계산한다
     * @then 결과가 null이다
     */
    it("[EC-6] 진입 행이 하나도 없으면 null을 반환한다", () => {
      expect(averageEntry([])).toBeNull();
    });

    /**
     * @spec EC-5
     * @given 나머지 행은 정상인 배열에 0인 행을 하나 섞은 표본을 하나씩 넣는다: price 0 [(0, 1), (3000, 0.5)], qty 0 [(3000, 0), (2800, 1.5)]
     * @when 평균 진입가를 계산한다
     * @then 결과가 null이다
     */
    it("[EC-5] 진입가나 수량이 0인 행이 하나라도 있으면 null을 반환한다", () => {
      const cases: [label: string, entries: Entry[]][] = [
        [
          "price 0",
          [
            { price: 0, qty: 1 },
            { price: 3000, qty: 0.5 },
          ],
        ],
        [
          "qty 0",
          [
            { price: 3000, qty: 0 },
            { price: 2800, qty: 1.5 },
          ],
        ],
      ];
      for (const [label, entries] of cases) {
        const result = averageEntry(entries);
        expect(result, `${label}`).toBe(null);
      }
    });

    /**
     * @spec DoD-1 DoD-2
     * @given 나머지 행은 정상인 배열에 0 이하이거나 유한하지 않은 값을 가진 행을 하나 섞은 표본을 하나씩 넣는다(스펙 §4 null 규칙): price 음수 [(-100, 1), (3000, 0.5)], qty 음수 [(3000, -1), (2800, 1.5)], price NaN [(NaN, 1), (3000, 0.5)], qty NaN [(3000, NaN), (2800, 1.5)], price Infinity [(Infinity, 1), (3000, 0.5)], price -Infinity [(-Infinity, 1), (3000, 0.5)], qty Infinity [(3000, Infinity), (2800, 1.5)], qty -Infinity [(3000, -Infinity), (2800, 1.5)]
     * @when 평균 진입가를 계산한다
     * @then 결과가 null이다
     */
    it("[DoD-1][DoD-2] 음수·NaN·±Infinity가 섞인 행이 하나라도 있으면 null을 반환한다", () => {
      const cases: [label: string, entries: Entry[]][] = [
        [
          "price 음수",
          [
            { price: -100, qty: 1 },
            { price: 3000, qty: 0.5 },
          ],
        ],
        [
          "qty 음수",
          [
            { price: 3000, qty: -1 },
            { price: 2800, qty: 1.5 },
          ],
        ],
        [
          "price NaN",
          [
            { price: Number.NaN, qty: 1 },
            { price: 3000, qty: 0.5 },
          ],
        ],
        [
          "qty NaN",
          [
            { price: 3000, qty: Number.NaN },
            { price: 2800, qty: 1.5 },
          ],
        ],
        [
          "price Infinity",
          [
            { price: Number.POSITIVE_INFINITY, qty: 1 },
            { price: 3000, qty: 0.5 },
          ],
        ],
        [
          "price -Infinity",
          [
            { price: Number.NEGATIVE_INFINITY, qty: 1 },
            { price: 3000, qty: 0.5 },
          ],
        ],
        [
          "qty Infinity",
          [
            { price: 3000, qty: Number.POSITIVE_INFINITY },
            { price: 2800, qty: 1.5 },
          ],
        ],
        [
          "qty -Infinity",
          [
            { price: 3000, qty: Number.NEGATIVE_INFINITY },
            { price: 2800, qty: 1.5 },
          ],
        ],
      ];
      for (const [label, entries] of cases) {
        const result = averageEntry(entries);
        expect(result, `${label}`).toBe(null);
      }
    });

    /**
     * @spec DoD-1 DoD-2
     * @given 모든 값이 양수이고 유한하지만 계산 결과가 유한하지 않은 표본을 넣는다(스펙 §4 null 규칙): 합 오버플로 [(1, 1e308), (1, 1e308)] (Σqty = 2e308 > Number.MAX_VALUE)
     * @when 평균 진입가를 계산한다
     * @then 결과가 null이다
     */
    it("[DoD-1][DoD-2] 합이 유한 범위를 넘으면 null을 반환한다", () => {
      // 합 오버플로: Σqty = 2e308 > Number.MAX_VALUE
      const entries: Entry[] = [
        { price: 1, qty: 1e308 },
        { price: 1, qty: 1e308 },
      ];
      expect(averageEntry(entries)).toBeNull();
    });
  });
});
