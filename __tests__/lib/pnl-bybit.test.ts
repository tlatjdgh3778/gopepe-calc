import { describe, expect, it } from "vitest";

import { calculatePnl } from "@/lib/pnl";

// Bybit 기준 사례 (스펙 DoD-5·DoD-18, 계획 T-5)
// 기준일: 2026-11-21. 사용자가 Bybit 계산기(USDT 무기한, Profit/Loss)에서 확인했고 입력 보정은 없었다.
// 출처: docs/specs/pnl-calculation.md §3 "DoD-5 기준 사례" 표. 값은 바꾸지 않고 옮긴다.
//
// | ID | 심볼    | 방향 | 레버리지 | 진입가  | 종료가  | 수량(코인) | 증거금    | 손익      | ROE     |
// | C1 | BTCUSDT | 롱   | 10       | 65000   | 67250.5 | 0.12       | 780.00    | 270.0600  | 34.62%  |
// | C2 | BTCUSDT | 숏   | 20       | 98765.4 | 99999.9 | 0.042      | 207.40    | -51.8490  | -24.99% |
// | C3 | ETHUSDT | 롱   | 25       | 3456.78 | 3210.55 | 1.37       | 189.43    | -337.3351 | -178.07% |
// | C4 | ETHUSDT | 숏   | 5        | 2500    | 2345.68 | 2.5        | 1,250.00  | 385.8000  | 30.86%  |
// | C5 | SOLUSDT | 롱   | 15       | 150.12  | 150.12  | 12.3       | 123.098   | 0.0000    | 0.00%   |
// | C6 | SOLUSDT | 숏   | 3        | 142.5   | 131.88  | 40         | 1,900.000 | 424.8000  | 22.35%  |
//
// 표시 규칙(DoD-18): 원값을 소수 10자리에서 사사오입한 뒤 표시 자릿수에서 0 방향으로 버린다.
// 버림 판별 표본(스펙 DoD-18): C2 증거금, C2·C3·C6 ROE.
// 표시 자릿수(DoD-20): 증거금 BTCUSDT·ETHUSDT 2, SOLUSDT 3 / 손익 4 / ROE 2.

type BybitCase = {
  id: string;
  symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
  side: "long" | "short";
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  /** 스펙 표의 Bybit 표시값 그대로(쉼표·`%` 포함) */
  bybitMargin: string;
  bybitPnl: string;
  bybitRoe: string;
};

// 스펙 DoD-5 기준 사례 표를 그대로 옮긴다(롱 = long, 숏 = short).
const BYBIT_CASES: readonly BybitCase[] = [
  {
    id: "C1",
    symbol: "BTCUSDT",
    side: "long",
    leverage: 10,
    entryPrice: 65000,
    exitPrice: 67250.5,
    qty: 0.12,
    bybitMargin: "780.00",
    bybitPnl: "270.0600",
    bybitRoe: "34.62%",
  },
  {
    id: "C2",
    symbol: "BTCUSDT",
    side: "short",
    leverage: 20,
    entryPrice: 98765.4,
    exitPrice: 99999.9,
    qty: 0.042,
    bybitMargin: "207.40",
    bybitPnl: "-51.8490",
    bybitRoe: "-24.99%",
  },
  {
    id: "C3",
    symbol: "ETHUSDT",
    side: "long",
    leverage: 25,
    entryPrice: 3456.78,
    exitPrice: 3210.55,
    qty: 1.37,
    bybitMargin: "189.43",
    bybitPnl: "-337.3351",
    bybitRoe: "-178.07%",
  },
  {
    id: "C4",
    symbol: "ETHUSDT",
    side: "short",
    leverage: 5,
    entryPrice: 2500,
    exitPrice: 2345.68,
    qty: 2.5,
    bybitMargin: "1,250.00",
    bybitPnl: "385.8000",
    bybitRoe: "30.86%",
  },
  {
    id: "C5",
    symbol: "SOLUSDT",
    side: "long",
    leverage: 15,
    entryPrice: 150.12,
    exitPrice: 150.12,
    qty: 12.3,
    bybitMargin: "123.098",
    bybitPnl: "0.0000",
    bybitRoe: "0.00%",
  },
  {
    id: "C6",
    symbol: "SOLUSDT",
    side: "short",
    leverage: 3,
    entryPrice: 142.5,
    exitPrice: 131.88,
    qty: 40,
    bybitMargin: "1,900.000",
    bybitPnl: "424.8000",
    bybitRoe: "22.35%",
  },
];

// 표시 자릿수(스펙 DoD-20). 제품의 심볼 데이터와 독립적으로 둔다.
const MARGIN_DIGITS: Record<BybitCase["symbol"], number> = {
  BTCUSDT: 2,
  ETHUSDT: 2,
  SOLUSDT: 3,
};
const PNL_DIGITS = 4;
const ROE_DIGITS = 2;

/**
 * 스펙 DoD-18 규칙으로 표시 숫자를 만든다(제품 형식 함수를 쓰지 않는다).
 * 원값을 소수 10자리에서 사사오입해 오차를 정리한 뒤, 10진 표현에서 표시 자릿수로 0 방향 버림한다.
 * 천 단위 구분 없음, 음수 부호는 ASCII `-`, 표시값이 0이면 부호 없음.
 */
function toDisplayNumber(raw: number | null, digits: number): string {
  if (raw === null) return "null";
  const cleaned = Number(raw.toFixed(10));
  return new Intl.NumberFormat("en-US", {
    roundingMode: "trunc",
    useGrouping: false,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "negative",
  }).format(cleaned);
}

/** 스펙 표 값을 비교용 숫자 문자열로 바꾼다: 천 단위 쉼표와 `%`를 뗀다. */
function toComparable(bybitValue: string): string {
  return bybitValue.replaceAll(",", "").replace(/%$/, "");
}

describe("손익 계산 — 같은 입력이면 Bybit 계산기와 같은 결과를 낸다", () => {
  describe("Bybit 기준 사례 표", () => {
    /**
     * @spec DoD-5 DoD-18
     * @given 스펙 DoD-5 기준 사례 표(2026-11-21 확인, 입력 보정 없음)의 C1 BTCUSDT 롱, C2 BTCUSDT 숏, C3 ETHUSDT 롱, C4 ETHUSDT 숏, C5 SOLUSDT 롱, C6 SOLUSDT 숏을 하나씩 반복하며, 버림 판별 표본 C2 증거금과 C2·C3·C6 ROE를 포함한다
     * @when 사례 입력으로 계산 모듈의 원값을 구하고, 제품의 USDT 표시 형식을 쓰지 않고 스펙 DoD-18 규칙(소수 10자리 사사오입 후 표시 자릿수에서 0 방향 버림)과 DoD-20 자릿수(증거금 BTCUSDT·ETHUSDT 2·SOLUSDT 3, 손익 4, ROE 2)로 표시 숫자를 만든다
     * @then 필요 증거금 표시 숫자가 표의 Bybit 증거금 값과 같다
     * @then 손익 표시 숫자가 표의 Bybit 손익 값과 같다
     * @then ROE 표시 숫자가 표의 Bybit ROE 값과 같다
     */
    it.each(BYBIT_CASES)(
      "[DoD-5][DoD-18] 각 사례의 필요 증거금·손익·ROE 원값을 DoD-18 규칙과 DoD-20 자릿수로 표시하면 Bybit 표시값과 같다",
      (c) => {
        const result = calculatePnl({
          side: c.side,
          leverage: c.leverage,
          entryPrice: c.entryPrice,
          exitPrice: c.exitPrice,
          qty: c.qty,
        });

        expect(
          toDisplayNumber(result.initialMargin, MARGIN_DIGITS[c.symbol]),
          `${c.id} 증거금`,
        ).toBe(toComparable(c.bybitMargin));
        expect(toDisplayNumber(result.pnl, PNL_DIGITS), `${c.id} 손익`).toBe(
          toComparable(c.bybitPnl),
        );
        expect(toDisplayNumber(result.roe, ROE_DIGITS), `${c.id} ROE`).toBe(
          toComparable(c.bybitRoe),
        );
      },
    );
  });
});
