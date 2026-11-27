import { describe, expect, it } from "vitest";

import {
  baselinePnl,
  netPnl,
  priceForRoe,
  simulatePyramid,
  type PyramidInput,
  type PyramidResult,
} from "@/lib/pyramid";

// 골격(테스트 설계 단계). 본문은 구현 단계에서 채운다.
//
// 기준 사례 (스펙 docs/specs/pyramid-terminal.md §3 "기준 사례" 표). 값은 바꾸지 않고 옮긴다. 수수료율 0.055%(feeRate 0.00055).
//
// P1: ETHUSDT(MMR 0.0033), 롱, 최초 진입가 1900, 증거금 1000, 5×, 단계 (2100, 100)·(2300, 100), 익절가 2500, 손절가 2000.
// P2: SOLUSDT(MMR 0.005), 숏, 최초 진입가 150, 증거금 500, 10×, 단계 (140, 50)·(130, 100), 익절가 120, 손절가 140.
//
// | 항목                      | P1 원값        | P2 원값        |
// | 평균 진입가               | 2066.1779…     | 138.4615…      |
// | 추정 청산가               | 1895.1973…     | 142.9764…      |
// | 실효 레버리지             | 12.8195…       | 24.1428…       |
// | 총 포지션 수량            | 5.5737…        | 92.8571…       |
// | 최종 진입 시 포지션 가치  | 12819.5488…    | 12071.4285…    |
// | 미실현 수익 포함 총 자산  | 2296.9241…     | 1278.6428…     |
// | 수수료 포함 본전가        | 2068.4519…     | 138.3093…      |
// | 누적 진입 수수료          | 6.3339…        | 7.0714…        |
// | 예상 순수익(익절가)       | 2404.0037…     | 1701.0857…     |
// | 추가 진입 없이(익절가)    | 1572.5789…     | 995.05         |
// | 손절 시 예상 손익         | −381.3219…     | −157.0785…     |
//
// P1 경로 표: 최초 진입(수량 2.6315…, 평단 1900, 청산가 1526.9236…), 1차(시점 수익 526.3157…, 투입 증거금 526.3157…,
// 추가 수량 1.2531…, 평단 1964.5161…, 청산가 1714.7791…), 2차(시점 수익 1303.2581…, 투입 증거금 776.9423…,
// 추가 수량 1.6890…, 평단 2066.1779…, 청산가 1895.1973…).
//
// 아래 @then의 긴 리터럴은 DoD-1~DoD-7 규칙을 유리수로 손계산한 값이다(스펙 표의 앞자리와 일치). 구현을 돌려 얻은 값이 아니다.
// 원값 비교는 상대 오차 1e-12 이내(|실제 − 기대| ≤ 1e-12 × |기대|)로 한다(계획 T-6 완료 조건 2).

type Step = { price: number | null; reinvestPercent: number | null };
type Side = "long" | "short";

/** 상대 오차 허용치(계획 T-6 완료 조건 2) */
const REL_TOL = 1e-12;

/** |실제 − 기대| ≤ 1e-12 × |기대|인지 확인한다. 기대가 0이면 실제도 정확히 0이어야 한다 */
function expectRelClose(actual: number | null | undefined, expected: number, label: string): void {
  expect(typeof actual, `${label}: 숫자여야 한다 (실제 ${actual})`).toBe("number");
  const v = actual as number;
  expect(Number.isFinite(v), `${label}: 유한한 값이어야 한다 (실제 ${v})`).toBe(true);
  expect(Math.abs(v - expected), `${label}: 실제 ${v}, 기대 ${expected}`).toBeLessThanOrEqual(
    REL_TOL * Math.abs(expected),
  );
}

function input(
  side: Side,
  entryPrice: number | null,
  margin: number | null,
  leverage: number,
  feeRate: number,
  mmr: number,
  steps: readonly [number | null, number | null][],
): PyramidInput {
  return {
    side,
    entryPrice,
    margin,
    leverage,
    feeRate,
    mmr,
    steps: steps.map(([price, reinvestPercent]): Step => ({ price, reinvestPercent })),
  };
}

/** 기준 사례 P1 입력(테스트마다 새 객체). 단계·수수료율을 바꿔 쓸 수 있다 */
function p1(
  steps: readonly [number | null, number | null][] = [
    [2100, 100],
    [2300, 100],
  ],
  feeRate = 0.00055,
): PyramidInput {
  return input("long", 1900, 1000, 5, feeRate, 0.0033, steps);
}

/** 기준 사례 P2 입력(테스트마다 새 객체) */
function p2(
  steps: readonly [number | null, number | null][] = [
    [140, 50],
    [130, 100],
  ],
): PyramidInput {
  return input("short", 150, 500, 10, 0.00055, 0.005, steps);
}

/** 시뮬레이션 결과가 null이 아님을 확인하고 돌려준다 */
function simulate(i: PyramidInput, label: string): PyramidResult {
  const result = simulatePyramid(i);
  expect(result, `${label}: 결과가 null이 아니어야 한다`).not.toBeNull();
  return result as PyramidResult;
}

describe("피라미딩 계산 — 최초 진입과 수익 재투입 단계로 포지션 결과를 계산한다", () => {
  describe("수량·평단·진입 수수료", () => {
    /**
     * @spec DoD-1
     * @given 기준 사례 P1(롱, 1900, 증거금 1000, 5×, feeRate 0.00055, mmr 0.0033, 단계 (2100, 100)·(2300, 100))과 P2(숏, 150, 증거금 500, 10×, feeRate 0.00055, mmr 0.005, 단계 (140, 50)·(130, 100))를 하나씩 넣는다
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then totalQty가 최초 수량(margin × leverage ÷ entryPrice)과 포함된 추가 수량의 합인 손계산 리터럴(P1 5.573716900948022, P2 92.85714285714286)과 상대 오차 1e-12 이내로 같다
     * @then avgPrice가 Σ(진입가 × 수량) ÷ 총 수량의 반올림하지 않은 손계산 리터럴(P1 2066.177908113392, P2 138.46153846153845)과 상대 오차 1e-12 이내로 같다
     * @then entryFees가 각 진입(최초·포함된 추가 진입)의 진입가 × 수량 × feeRate 합인 손계산 리터럴(P1 6.333959899749374, P2 7.071428571428571)과 상대 오차 1e-12 이내로 같다
     */
    it("[DoD-1] 총 수량·평단·누적 진입 수수료가 기준 사례 P1·P2의 손계산 원값과 같다", () => {
      const cases: [
        id: string,
        i: PyramidInput,
        totalQty: number,
        avgPrice: number,
        fees: number,
      ][] = [
        ["P1", p1(), 5.573716900948022, 2066.177908113392, 6.333959899749374],
        ["P2", p2(), 92.85714285714286, 138.46153846153845, 7.071428571428571],
      ];
      for (const [id, i, totalQty, avgPrice, fees] of cases) {
        const result = simulatePyramid(i);
        expect(result, `${id}: 결과가 null이 아니어야 한다`).not.toBeNull();
        const r = result as PyramidResult;
        expectRelClose(r.totalQty, totalQty, `${id} totalQty`);
        expectRelClose(r.avgPrice, avgPrice, `${id} avgPrice`);
        expectRelClose(r.entryFees, fees, `${id} entryFees`);
      }
    });

    /**
     * @spec DoD-1 DoD-2
     * @given 기준 사례 P1·P2의 입력을 하나씩 넣고, 호출 전 steps 배열의 길이·순서와 각 단계의 price·reinvestPercent를 기록해 둔다
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 호출 뒤 steps 배열의 길이·순서와 각 단계의 price·reinvestPercent가 호출 전과 같다(입력을 바꾸지 않는다)
     */
    it("[DoD-1][DoD-2] 계산은 입력 단계 배열을 바꾸지 않는다", () => {
      for (const [id, i] of [
        ["P1", p1()],
        ["P2", p2()],
      ] as const) {
        const steps = i.steps;
        const stepObjects = [...steps];
        const before = steps.map((s) => ({ price: s.price, reinvestPercent: s.reinvestPercent }));
        simulatePyramid(i);
        expect(i.steps, `${id} steps 배열`).toBe(steps);
        expect(steps.length, `${id} 길이`).toBe(before.length);
        steps.forEach((s, n) => {
          expect(s, `${id} ${n + 1}번째 단계 순서`).toBe(stepObjects[n]);
        });
        expect(
          steps.map((s) => ({ price: s.price, reinvestPercent: s.reinvestPercent })),
          `${id} price·reinvestPercent`,
        ).toEqual(before);
      }
    });
  });

  describe("단계별 수익 재투입", () => {
    /**
     * @spec DoD-1 DoD-2
     * @given 기준 사례 P1과 P2를 하나씩 넣는다
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then rows가 최초 진입 행 1개와 단계마다 1행으로 3행이고, 최초 진입 행은 price가 최초 진입가(P1 1900, P2 150), reinvestPercent·pnlAtStep이 null, marginUsed가 초기 증거금(P1 1000, P2 500), addedQty가 최초 수량(P1 2.6315789473684212, P2 33.333333333333336), avgPrice가 최초 진입가, excluded가 null이다
     * @then 1차 행의 pnlAtStep(그 단계 가격에서 직전까지 포지션의 수수료 미차감 미실현 손익)이 P1 526.3157894736842, P2 333.3333333333333이다
     * @then 1차 행의 marginUsed(가용 수익 × 재투입% ÷ 100)가 P1 526.3157894736842, P2 166.66666666666666이고, addedQty(투입 증거금 × 최초 레버리지 ÷ 단계 가격)가 P1 1.2531328320802004, P2 11.904761904761905이다
     * @then 2차 행의 pnlAtStep이 P1 1303.2581453634086, P2 785.7142857142857이다
     * @then 2차 행의 marginUsed가 가용 수익(시점 수익 − 앞 단계가 배정한 수익: P1 1303.2581453634086 − 526.3157894736842, P2 785.7142857142857 − 166.66666666666666) × 재투입% ÷ 100인 P1 776.9423558897244, P2 619.047619047619이고, addedQty가 P1 1.6890051214994006, P2 47.61904761904762이다
     * @then 각 행의 avgPrice(그 단계까지의 누적 평단)가 1차 P1 1964.516129032258·P2 147.3684210526316, 2차 P1 2066.177908113392·P2 138.46153846153845이다
     * @then 모든 원값은 손계산 리터럴과 상대 오차 1e-12 이내로 같고, 단계 행의 reinvestPercent는 입력값(P1 100·100, P2 50·100), excluded는 null이다
     */
    it("[DoD-1][DoD-2] 경로 행의 시점 수익·투입 증거금·추가 수량·누적 평단이 기준 사례 손계산 원값과 같다", () => {
      type Expected = {
        entry: number;
        margin: number;
        qty0: number;
        reinvest: [number, number];
        pnl: [number, number];
        marginUsed: [number, number];
        addedQty: [number, number];
        avg: [number, number];
      };
      const cases: [id: string, i: PyramidInput, e: Expected][] = [
        [
          "P1",
          p1(),
          {
            entry: 1900,
            margin: 1000,
            qty0: 2.6315789473684212,
            reinvest: [100, 100],
            pnl: [526.3157894736842, 1303.2581453634086],
            marginUsed: [526.3157894736842, 776.9423558897244],
            addedQty: [1.2531328320802004, 1.6890051214994006],
            avg: [1964.516129032258, 2066.177908113392],
          },
        ],
        [
          "P2",
          p2(),
          {
            entry: 150,
            margin: 500,
            qty0: 33.333333333333336,
            reinvest: [50, 100],
            pnl: [333.3333333333333, 785.7142857142857],
            marginUsed: [166.66666666666666, 619.047619047619],
            addedQty: [11.904761904761905, 47.61904761904762],
            avg: [147.3684210526316, 138.46153846153845],
          },
        ],
      ];
      for (const [id, i, e] of cases) {
        const r = simulate(i, id);
        expect(r.rows.length, `${id} 행 수`).toBe(3);
        const first = r.rows[0];
        expect(first.price, `${id} 최초 행 price`).toBe(e.entry);
        expect(first.reinvestPercent, `${id} 최초 행 reinvestPercent`).toBeNull();
        expect(first.pnlAtStep, `${id} 최초 행 pnlAtStep`).toBeNull();
        expectRelClose(first.marginUsed, e.margin, `${id} 최초 행 marginUsed`);
        expectRelClose(first.addedQty, e.qty0, `${id} 최초 행 addedQty`);
        expectRelClose(first.avgPrice, e.entry, `${id} 최초 행 avgPrice`);
        expect(first.excluded, `${id} 최초 행 excluded`).toBeNull();
        for (const n of [0, 1] as const) {
          const row = r.rows[n + 1];
          const label = `${id} ${n + 1}차 행`;
          expectRelClose(row.pnlAtStep, e.pnl[n], `${label} pnlAtStep`);
          expectRelClose(row.marginUsed, e.marginUsed[n], `${label} marginUsed`);
          expectRelClose(row.addedQty, e.addedQty[n], `${label} addedQty`);
          expectRelClose(row.avgPrice, e.avg[n], `${label} avgPrice`);
          expect(row.reinvestPercent, `${label} reinvestPercent`).toBe(e.reinvest[n]);
          expect(row.excluded, `${label} excluded`).toBeNull();
        }
      }
    });
  });

  describe("추정 청산가", () => {
    /**
     * @spec DoD-3
     * @given 기준 사례 P1과 P2를 하나씩 넣는다(청산가는 F-3 liquidationPrice에 collateral = margin − 그 시점까지 누적 진입 수수료, mmr = 심볼 MMR + feeRate를 넣은 값이고 재투입 미실현 수익은 담보에 더하지 않는다)
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 행별 liquidationPrice가 그 단계까지 반영한 손계산 리터럴(P1 최초 1526.9236560758923·1차 1714.7791578221313·2차 1895.1973259316208, P2 최초 164.00725970861717·1차 157.4660633484163·2차 142.9764805330416)과 상대 오차 1e-12 이내로 같다
     * @then 결과의 liquidationPrice가 마지막 행 값(P1 1895.1973259316208, P2 142.9764805330416)과 상대 오차 1e-12 이내로 같다
     */
    it("[DoD-3] 행별·최종 추정 청산가가 누적 수수료를 뺀 담보와 MMR + feeRate로 계산한 원값과 같다", () => {
      const cases: [id: string, i: PyramidInput, liq: [number, number, number]][] = [
        ["P1", p1(), [1526.9236560758923, 1714.7791578221313, 1895.1973259316208]],
        ["P2", p2(), [164.00725970861717, 157.4660633484163, 142.9764805330416]],
      ];
      for (const [id, i, liq] of cases) {
        const r = simulate(i, id);
        expect(r.rows.length, `${id} 행 수`).toBe(3);
        liq.forEach((expected, n) => {
          expectRelClose(r.rows[n].liquidationPrice, expected, `${id} ${n}번 행 liquidationPrice`);
        });
        expectRelClose(r.liquidationPrice, liq[2], `${id} 결과 liquidationPrice`);
      }
    });

    /**
     * @spec DoD-3
     * @given 롱, 최초 진입가 1000, 증거금 1000, 레버리지 1, feeRate 0, mmr 0.0033, 단계 없음(담보 1000이 포지션 가치 1000과 같아 청산가 원값이 0이 되는 입력)
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 결과의 liquidationPrice와 최초 진입 행의 liquidationPrice가 null이 아니라 원값 0이다(0 이하 원값을 그대로 돌려준다)
     */
    it("[DoD-3] 청산가 원값이 0 이하이면 null로 바꾸지 않고 그 값을 돌려준다", () => {
      const r = simulate(input("long", 1000, 1000, 1, 0, 0.0033, []), "청산가 0 표본");
      expect(r.liquidationPrice, "결과 liquidationPrice").not.toBeNull();
      expect(
        r.liquidationPrice === 0,
        `결과 liquidationPrice가 0이어야 한다 (실제 ${r.liquidationPrice})`,
      ).toBe(true);
      expect(r.rows[0].liquidationPrice, "최초 행 liquidationPrice").not.toBeNull();
      expect(
        r.rows[0].liquidationPrice === 0,
        `최초 행 liquidationPrice가 0이어야 한다 (실제 ${r.rows[0].liquidationPrice})`,
      ).toBe(true);
    });
  });

  describe("총 자산·포지션 가치·실효 레버리지", () => {
    /**
     * @spec DoD-4
     * @given 기준 사례 P1과 P2를 하나씩 넣는다
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then lastPrice가 마지막 포함 진입가(P1 2300, P2 130)다
     * @then equity(margin + 마지막 포함 진입가 기준 미실현 손익 − 누적 진입 수수료)가 P1 2296.9241854636593, P2 1278.642857142857이다
     * @then finalNotional(총 수량 × 마지막 포함 진입가)이 P1 12819.54887218045, P2 12071.42857142857이다
     * @then effectiveLeverage(최종 포지션 가치 ÷ margin)가 P1 12.819548872180452, P2 24.142857142857142이다
     * @then 원값은 손계산 리터럴과 상대 오차 1e-12 이내로 같다
     */
    it("[DoD-4] 총 자산·최종 포지션 가치·실효 레버리지가 기준 사례 손계산 원값과 같다", () => {
      const cases: [
        id: string,
        i: PyramidInput,
        lastPrice: number,
        equity: number,
        finalNotional: number,
        effectiveLeverage: number,
      ][] = [
        ["P1", p1(), 2300, 2296.9241854636593, 12819.54887218045, 12.819548872180452],
        ["P2", p2(), 130, 1278.642857142857, 12071.42857142857, 24.142857142857142],
      ];
      for (const [id, i, lastPrice, equity, finalNotional, effectiveLeverage] of cases) {
        const r = simulate(i, id);
        expect(r.lastPrice, `${id} lastPrice`).toBe(lastPrice);
        expectRelClose(r.equity, equity, `${id} equity`);
        expectRelClose(r.finalNotional, finalNotional, `${id} finalNotional`);
        expectRelClose(r.effectiveLeverage, effectiveLeverage, `${id} effectiveLeverage`);
      }
    });
  });

  describe("종료 가격별 순손익과 역산 가격", () => {
    /**
     * @spec DoD-5
     * @given 기준 사례 P1·P2의 시뮬레이션 결과와 종료 가격 표본(P1 익절가 2500·손절가 2000, P2 익절가 120·손절가 140)을 하나씩 넣는다
     * @when 종료 가격의 순손익(netPnl)을 계산한다
     * @then 방향 × (exitPrice × 총 수량 − Σ진입가×수량) − 누적 진입 수수료 − exitPrice × 총 수량 × feeRate의 손계산 리터럴(P1 2500 → 2404.0037049144603, P1 2000 → −381.32197341179034, P2 120 → 1701.0857142857142, P2 140 → −157.07857142857142)과 상대 오차 1e-12 이내로 같다
     */
    it("[DoD-5] 종료 가격의 순손익이 진입·종료 수수료를 뺀 기준 사례 손계산 원값과 같다", () => {
      const cases: [id: string, i: PyramidInput, exitPrice: number, pnl: number][] = [
        ["P1", p1(), 2500, 2404.0037049144603],
        ["P1", p1(), 2000, -381.32197341179034],
        ["P2", p2(), 120, 1701.0857142857142],
        ["P2", p2(), 140, -157.07857142857142],
      ];
      for (const [id, i, exitPrice, pnl] of cases) {
        const r = simulate(i, id);
        const actual = netPnl(i, r, exitPrice);
        expect(actual, `${id} netPnl(${exitPrice})가 null이 아니어야 한다`).not.toBeNull();
        expectRelClose(actual, pnl, `${id} netPnl(${exitPrice})`);
      }
    });

    /**
     * @spec DoD-6
     * @given 기준 사례 P1·P2의 입력과 종료 가격 표본(P1 2500·2000, P2 120·140)을 하나씩 넣는다
     * @when 추가 진입 없이 종료했을 때의 순손익(baselinePnl)을 계산한다
     * @then 최초 수량만으로 진입해 같은 가격에 종료한 순손익(최초 진입 수수료와 그 수량의 종료 수수료 차감)의 손계산 리터럴(P1 2500 → 1572.578947368421, P1 2000 → 257.5131578947368, P2 120 → 995.05, P2 140 → 328.01666666666665)과 상대 오차 1e-12 이내로 같다
     */
    it("[DoD-6] 추가 진입 없이 순손익이 최초 수량만의 기준 사례 손계산 원값과 같다", () => {
      const cases: [id: string, i: PyramidInput, exitPrice: number, pnl: number][] = [
        ["P1", p1(), 2500, 1572.578947368421],
        ["P1", p1(), 2000, 257.5131578947368],
        ["P2", p2(), 120, 995.05],
        ["P2", p2(), 140, 328.01666666666665],
      ];
      for (const [id, i, exitPrice, pnl] of cases) {
        const actual = baselinePnl(i, exitPrice);
        expect(actual, `${id} baselinePnl(${exitPrice})가 null이 아니어야 한다`).not.toBeNull();
        expectRelClose(actual, pnl, `${id} baselinePnl(${exitPrice})`);
      }
    });

    /**
     * @spec DoD-7
     * @given 기준 사례 P1·P2의 입력·시뮬레이션 결과와 목표 수익률 표본 50·0을 하나씩 넣는다
     * @when 목표 수익률의 가격(priceForRoe)을 계산한다
     * @then netPnl(p) = roe ÷ 100 × margin을 p에 대해 푼 손계산 리터럴(P1 50 → 2158.2080652667864, P1 0 → 2068.4519545378503, P2 50 → 135.6184867553615, P2 0 → 138.3093144924138)과 상대 오차 1e-12 이내로 같다
     * @then 결과의 breakEvenPrice가 priceForRoe(0)의 값(P1 2068.4519545378503, P2 138.3093144924138)과 상대 오차 1e-12 이내로 같다
     * @then 역산한 가격의 netPnl이 roe ÷ 100 × margin(P1 50 → 500, P2 50 → 250, 0 → 0)과 1e-9 이내로 같다
     */
    it("[DoD-7] 목표 수익률의 가격과 본전가가 순손익 식을 푼 기준 사례 손계산 원값과 같다", () => {
      const cases: [id: string, i: PyramidInput, margin: number, roe: number, price: number][] = [
        ["P1", p1(), 1000, 50, 2158.2080652667864],
        ["P1", p1(), 1000, 0, 2068.4519545378503],
        ["P2", p2(), 500, 50, 135.6184867553615],
        ["P2", p2(), 500, 0, 138.3093144924138],
      ];
      for (const [id, i, margin, roe, price] of cases) {
        const r = simulate(i, id);
        const p = priceForRoe(i, r, roe);
        expectRelClose(p, price, `${id} priceForRoe(${roe})`);
        if (roe === 0) expectRelClose(r.breakEvenPrice, price, `${id} breakEvenPrice`);
        const pnl = netPnl(i, r, p as number);
        expect(typeof pnl, `${id} netPnl(priceForRoe(${roe}))`).toBe("number");
        expect(
          Math.abs((pnl as number) - (roe / 100) * margin),
          `${id} netPnl(priceForRoe(${roe})) 실제 ${pnl}, 기대 ${(roe / 100) * margin}`,
        ).toBeLessThanOrEqual(1e-9);
      }
    });

    /**
     * @spec DoD-5 DoD-6 DoD-7
     * @given 기준 사례 P1의 입력·시뮬레이션 결과에 무효 인자 표본을 하나씩 넣는다: 종료 가격 0, −1, null(netPnl·baselinePnl), 목표 수익률 null(priceForRoe)
     * @when 순손익·추가 진입 없이 순손익·목표 수익률 가격을 계산한다
     * @then 각 함수가 null을 돌려준다
     */
    it("[DoD-5][DoD-6][DoD-7] 무효 인자(0 이하 가격, null)에서 순손익·역산 가격은 null이다", () => {
      const i = p1();
      const r = simulate(i, "P1");
      for (const exitPrice of [0, -1, null]) {
        expect(netPnl(i, r, exitPrice), `netPnl(${exitPrice})`).toBeNull();
        expect(baselinePnl(i, exitPrice), `baselinePnl(${exitPrice})`).toBeNull();
      }
      expect(priceForRoe(i, r, null), "priceForRoe(null)").toBeNull();
    });
  });

  describe("수수료 0", () => {
    /**
     * @spec EC-5
     * @given 기준 사례 P1에서 feeRate만 0으로 바꾼다(롱, 1900, 증거금 1000, 5×, mmr 0.0033, 단계 (2100, 100)·(2300, 100))
     * @when 피라미딩 시뮬레이션과 익절가 2500의 순손익을 계산한다
     * @then 결과가 null이 아니고 entryFees가 0이다
     * @then totalQty·avgPrice가 P1과 같은 5.573716900948022·2066.177908113392다
     * @then liquidationPrice가 collateral = 1000, mmr = 0.0033으로 계산한 손계산 리터럴 1893.011355851632이고, breakEvenPrice가 평단과 같은 2066.177908113392다
     * @then equity가 2303.2581453634084, 익절가 2500의 netPnl이 2418.001525553013이다(원값은 상대 오차 1e-12 이내)
     */
    it("[EC-5] 수수료율 0은 허용되고 수수료 없이 계산된다", () => {
      const i = p1(undefined, 0);
      const r = simulate(i, "수수료 0");
      expect(r.entryFees, "entryFees").toBe(0);
      expectRelClose(r.totalQty, 5.573716900948022, "totalQty");
      expectRelClose(r.avgPrice, 2066.177908113392, "avgPrice");
      expectRelClose(r.liquidationPrice, 1893.011355851632, "liquidationPrice");
      expectRelClose(r.breakEvenPrice, 2066.177908113392, "breakEvenPrice");
      expectRelClose(r.equity, 2303.2581453634084, "equity");
      expectRelClose(netPnl(i, r, 2500), 2418.001525553013, "netPnl(2500)");
    });
  });

  describe("무효 기본 입력", () => {
    /**
     * @spec EC-11
     * @given 기준 사례 P1에서 한 값씩 무효로 바꾼 표본을 하나씩 넣는다: entryPrice null·0·−1900, margin null·0·−1000, leverage 0·0.5, feeRate −0.0001·0.01·0.02
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 결과가 null이다
     */
    it("[EC-11] 진입가·증거금이 0 이하이거나 null, 레버리지 1 미만, 수수료율 0 미만이거나 0.01 이상이면 null이다", () => {
      const base = (): PyramidInput => p1();
      const cases: [label: string, i: PyramidInput][] = [
        ["entryPrice null", { ...base(), entryPrice: null }],
        ["entryPrice 0", { ...base(), entryPrice: 0 }],
        ["entryPrice −1900", { ...base(), entryPrice: -1900 }],
        ["margin null", { ...base(), margin: null }],
        ["margin 0", { ...base(), margin: 0 }],
        ["margin −1000", { ...base(), margin: -1000 }],
        ["leverage 0", { ...base(), leverage: 0 }],
        ["leverage 0.5", { ...base(), leverage: 0.5 }],
        ["feeRate −0.0001", { ...base(), feeRate: -0.0001 }],
        ["feeRate 0.01", { ...base(), feeRate: 0.01 }],
        ["feeRate 0.02", { ...base(), feeRate: 0.02 }],
      ];
      for (const [label, i] of cases) {
        expect(simulatePyramid(i), `${label}`).toBeNull();
      }
    });

    /**
     * @spec EC-11
     * @given 기준 사례 P1에서 경계 안쪽 값으로 바꾼 표본을 하나씩 넣는다: leverage 1, feeRate 0.0099
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 결과가 null이 아니다
     */
    it("[EC-11] 레버리지 1과 수수료율 0.01 미만은 무효 입력이 아니다", () => {
      const cases: [label: string, i: PyramidInput][] = [
        ["leverage 1", { ...p1(), leverage: 1 }],
        ["feeRate 0.0099", { ...p1(), feeRate: 0.0099 }],
      ];
      for (const [label, i] of cases) {
        expect(simulatePyramid(i), `${label}`).not.toBeNull();
      }
    });
  });

  describe("단계 제외 판정", () => {
    /**
     * @spec EC-12
     * @given 기준 사례 P1(롱, 1900)의 단계를 한 개로 바꾼 표본을 하나씩 넣는다: (null, 100), (2100, null), (0, 100), (2100, 0), (2100, 0.5), (2100, 100.5), (2100, 101), (1800, 0)
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 그 단계 행의 excluded가 "invalidInput"이다
     * @then 그 행의 marginUsed·addedQty가 0이고 pnlAtStep이 null이다
     * @then totalQty·avgPrice·entryFees가 최초 진입만의 값(2.6315789473684212, 1900, 2.75)과 상대 오차 1e-12 이내로 같다
     */
    it("[EC-12] 한 칸만 비었거나 가격 0, 재투입 1 미만·100 초과인 단계는 invalidInput으로 제외된다", () => {
      const samples: [number | null, number | null][] = [
        [null, 100],
        [2100, null],
        [0, 100],
        [2100, 0],
        [2100, 0.5],
        [2100, 100.5],
        [2100, 101],
        [1800, 0],
      ];
      for (const step of samples) {
        const label = `단계 (${step[0]}, ${step[1]})`;
        const r = simulate(p1([step]), label);
        const row = r.rows[1];
        expect(row.excluded, `${label} excluded`).toBe("invalidInput");
        expect(row.marginUsed, `${label} marginUsed`).toBe(0);
        expect(row.addedQty, `${label} addedQty`).toBe(0);
        expect(row.pnlAtStep, `${label} pnlAtStep`).toBeNull();
        expectRelClose(r.totalQty, 2.6315789473684212, `${label} totalQty`);
        expectRelClose(r.avgPrice, 1900, `${label} avgPrice`);
        expectRelClose(r.entryFees, 2.75, `${label} entryFees`);
      }
    });

    /**
     * @spec EC-12
     * @given 기준 사례 P1(롱, 1900)의 단계를 한 개로 바꾼 경계 표본을 하나씩 넣는다: (2100, 1), (2100, 100)
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 그 단계 행의 excluded가 null이다
     * @then 그 행의 marginUsed가 526.3157894736842 × 재투입% ÷ 100(1 → 5.263157894736842, 100 → 526.3157894736842)과 상대 오차 1e-12 이내로 같다
     */
    it("[EC-12] 재투입 1과 100은 허용 범위라 제외되지 않는다", () => {
      const cases: [reinvest: number, marginUsed: number][] = [
        [1, 5.263157894736842],
        [100, 526.3157894736842],
      ];
      for (const [reinvest, marginUsed] of cases) {
        const label = `단계 (2100, ${reinvest})`;
        const row = simulate(p1([[2100, reinvest]]), label).rows[1];
        expect(row.excluded, `${label} excluded`).toBeNull();
        expectRelClose(row.marginUsed, marginUsed, `${label} marginUsed`);
      }
    });

    /**
     * @spec EC-12 EC-16
     * @given 기준 사례 P1(롱, 1900)의 단계를 가격과 재투입이 모두 null인 (null, null) 한 개로 바꾼다
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 그 단계 행의 excluded가 "invalidInput"이 아니라 "empty"다
     * @then 그 행의 marginUsed·addedQty가 0이고 pnlAtStep이 null이다
     */
    it("[EC-12][EC-16] 두 칸이 모두 빈 단계는 invalidInput이 아니라 empty로 제외된다", () => {
      const row = simulate(p1([[null, null]]), "단계 (null, null)").rows[1];
      expect(row.excluded, "excluded").toBe("empty");
      expect(row.marginUsed, "marginUsed").toBe(0);
      expect(row.addedQty, "addedQty").toBe(0);
      expect(row.pnlAtStep, "pnlAtStep").toBeNull();
    });

    /**
     * @spec EC-13
     * @given 수익 방향이 아닌 단계를 둔 표본을 하나씩 넣는다: P1 입력(롱, 1900)에 단계 [(1900, 100)]·[(1800, 100)]·[(2100, 100), (2100, 100)]·[(2100, 100), (2000, 100)], P2 입력(숏, 150)에 단계 [(150, 50)]·[(160, 50)]·[(140, 50), (145, 100)]
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 제외되지 않은 마지막 진입가 대비 롱은 이하, 숏은 이상인 단계 행(각 표본의 마지막 단계)의 excluded가 "notProfitDirection"이다
     * @then 그 행의 marginUsed·addedQty가 0이다
     * @then 그 앞의 포함 단계 행은 excluded가 null이다
     */
    it("[EC-13] 제외되지 않은 마지막 진입가보다 수익 방향이 아닌 단계는 notProfitDirection으로 제외된다", () => {
      const cases: [label: string, i: PyramidInput][] = [
        ["P1 [(1900, 100)]", p1([[1900, 100]])],
        ["P1 [(1800, 100)]", p1([[1800, 100]])],
        [
          "P1 [(2100, 100), (2100, 100)]",
          p1([
            [2100, 100],
            [2100, 100],
          ]),
        ],
        [
          "P1 [(2100, 100), (2000, 100)]",
          p1([
            [2100, 100],
            [2000, 100],
          ]),
        ],
        ["P2 [(150, 50)]", p2([[150, 50]])],
        ["P2 [(160, 50)]", p2([[160, 50]])],
        [
          "P2 [(140, 50), (145, 100)]",
          p2([
            [140, 50],
            [145, 100],
          ]),
        ],
      ];
      for (const [label, i] of cases) {
        const r = simulate(i, label);
        const last = r.rows[r.rows.length - 1];
        expect(r.rows.length, `${label} 행 수`).toBe(i.steps.length + 1);
        expect(last.excluded, `${label} 마지막 단계 excluded`).toBe("notProfitDirection");
        expect(last.marginUsed, `${label} 마지막 단계 marginUsed`).toBe(0);
        expect(last.addedQty, `${label} 마지막 단계 addedQty`).toBe(0);
        r.rows.slice(1, -1).forEach((row, n) => {
          expect(row.excluded, `${label} ${n + 1}차 excluded`).toBeNull();
        });
      }
    });

    /**
     * @spec EC-15
     * @given 기준 사례 P1의 단계 (2100, 100)·(2300, 100) 사이 또는 앞에 제외 단계를 하나씩 끼운 표본을 넣는다: [(1800, 100), (2100, 100), (2300, 100)](앞, notProfitDirection), [(2100, 100), (null, 100), (2300, 100)](invalidInput), [(2100, 100), (2200, 0), (2300, 100)](invalidInput), [(2100, 100), (2400, 0.5), (2300, 100)](제외 단계 가격이 뒤 단계보다 수익 방향), [(2100, 100), (2000, 100), (2300, 100)](notProfitDirection), [(2100, 100), (null, null), (2300, 100)](empty)
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 끼운 단계 행만 excluded가 null이 아니다
     * @then 2100·2300 단계 행의 pnlAtStep·marginUsed·addedQty·avgPrice·liquidationPrice와 excluded(null)가 제외 단계 없이 계산한 P1의 행 값과 같다
     * @then totalQty·avgPrice·entryFees·liquidationPrice·lastPrice·equity·finalNotional·effectiveLeverage·breakEvenPrice가 P1의 값과 같다
     */
    it("[EC-15] 제외된 단계는 뒤 단계의 가용 수익·방향 판정·수량에 영향을 주지 않는다", () => {
      const reference = simulate(p1(), "P1");
      const cases: [label: string, steps: [number | null, number | null][], inserted: number][] = [
        [
          "앞 (1800, 100)",
          [
            [1800, 100],
            [2100, 100],
            [2300, 100],
          ],
          1,
        ],
        [
          "사이 (null, 100)",
          [
            [2100, 100],
            [null, 100],
            [2300, 100],
          ],
          2,
        ],
        [
          "사이 (2200, 0)",
          [
            [2100, 100],
            [2200, 0],
            [2300, 100],
          ],
          2,
        ],
        [
          "사이 (2400, 0.5)",
          [
            [2100, 100],
            [2400, 0.5],
            [2300, 100],
          ],
          2,
        ],
        [
          "사이 (2000, 100)",
          [
            [2100, 100],
            [2000, 100],
            [2300, 100],
          ],
          2,
        ],
        [
          "사이 (null, null)",
          [
            [2100, 100],
            [null, null],
            [2300, 100],
          ],
          2,
        ],
      ];
      const rowFields = [
        "pnlAtStep",
        "marginUsed",
        "addedQty",
        "avgPrice",
        "liquidationPrice",
      ] as const;
      const resultFields = [
        "totalQty",
        "avgPrice",
        "entryFees",
        "liquidationPrice",
        "lastPrice",
        "equity",
        "finalNotional",
        "effectiveLeverage",
        "breakEvenPrice",
      ] as const;
      for (const [label, steps, inserted] of cases) {
        const r = simulate(p1(steps), label);
        expect(r.rows.length, `${label} 행 수`).toBe(4);
        expect(
          r.rows.map((row) => row.excluded !== null),
          `${label} 끼운 행(${inserted}번)만 excluded가 null이 아니어야 한다`,
        ).toEqual(r.rows.map((_, n) => n === inserted));
        const kept = r.rows.filter((_, n) => n !== 0 && n !== inserted);
        kept.forEach((row, n) => {
          const ref = reference.rows[n + 1];
          for (const field of rowFields) {
            expectRelClose(row[field], ref[field] as number, `${label} ${ref.price} 행 ${field}`);
          }
        });
        for (const field of resultFields) {
          expectRelClose(r[field], reference[field] as number, `${label} 결과 ${field}`);
        }
      }
    });
  });

  describe("소수 재투입", () => {
    /**
     * @spec EC-17
     * @given 기준 사례 P1(롱, 1900)의 단계를 (2100, 12.5) 한 개로 바꾼다
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 그 단계 행의 excluded가 null이고 reinvestPercent가 12.5다
     * @then 그 행의 marginUsed가 526.3157894736842 × 12.5 ÷ 100 = 65.78947368421052, addedQty가 0.15664160401002505다
     * @then totalQty가 2.788220551378446, avgPrice가 1911.2359550561798이다(원값은 상대 오차 1e-12 이내)
     */
    it("[EC-17] 재투입 12.5%는 소수 그대로 계산된다", () => {
      const r = simulate(p1([[2100, 12.5]]), "단계 (2100, 12.5)");
      const row = r.rows[1];
      expect(row.excluded, "excluded").toBeNull();
      expect(row.reinvestPercent, "reinvestPercent").toBe(12.5);
      expectRelClose(row.marginUsed, 65.78947368421052, "marginUsed");
      expectRelClose(row.addedQty, 0.15664160401002505, "addedQty");
      expectRelClose(r.totalQty, 2.788220551378446, "totalQty");
      expectRelClose(r.avgPrice, 1911.2359550561798, "avgPrice");
    });
  });

  describe("진입 즉시 청산되는 포지션", () => {
    /**
     * @spec EC-34
     * @given 누적 진입 수수료가 증거금 이상이 되는 표본을 하나씩 넣는다: 롱, 1900, 증거금 1000, 250×, feeRate 0.005, mmr 0.0033, 단계 없음(최초 진입 수수료 1250), 롱, 1900, 증거금 1000, 200×, feeRate 0.009, 단계 없음(최초 진입 수수료 1800)
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 결과가 null이 아니다
     * @then 결과의 liquidationPrice와 최초 진입 행의 liquidationPrice가 null이다
     */
    it("[EC-34] 최초 진입 수수료가 증거금 이상이면 추정 청산가는 null이다", () => {
      const cases: [label: string, i: PyramidInput][] = [
        ["250×, feeRate 0.005", input("long", 1900, 1000, 250, 0.005, 0.0033, [])],
        ["200×, feeRate 0.009", input("long", 1900, 1000, 200, 0.009, 0.0033, [])],
      ];
      for (const [label, i] of cases) {
        const r = simulate(i, label);
        expect(r.liquidationPrice, `${label} 결과 liquidationPrice`).toBeNull();
        expect(r.rows[0].liquidationPrice, `${label} 최초 행 liquidationPrice`).toBeNull();
      }
    });

    /**
     * @spec EC-34
     * @given 롱, 1900, 증거금 1000, 150×, feeRate 0.006, mmr 0.0033, 단계 (2100, 100)을 넣는다(최초 진입 수수료 900, 1차 포함 뒤 누적 진입 수수료 15110.526315789473)
     * @when 피라미딩 시뮬레이션을 계산한다
     * @then 최초 진입 행의 liquidationPrice가 null이 아니고 손계산 리터럴 1916.5573163756267과 상대 오차 1e-12 이내로 같다
     * @then 1차 행의 liquidationPrice와 결과의 liquidationPrice가 null이다
     */
    it("[EC-34] 단계를 반영한 누적 진입 수수료가 증거금 이상이 되면 그 행부터 추정 청산가는 null이다", () => {
      const r = simulate(
        input("long", 1900, 1000, 150, 0.006, 0.0033, [[2100, 100]]),
        "150×, feeRate 0.006, 단계 (2100, 100)",
      );
      expect(r.rows[0].liquidationPrice, "최초 행 liquidationPrice").not.toBeNull();
      expectRelClose(r.rows[0].liquidationPrice, 1916.5573163756267, "최초 행 liquidationPrice");
      expect(r.rows[1].liquidationPrice, "1차 행 liquidationPrice").toBeNull();
      expect(r.liquidationPrice, "결과 liquidationPrice").toBeNull();
    });
  });
});
