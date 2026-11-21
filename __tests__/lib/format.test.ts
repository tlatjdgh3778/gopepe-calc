import { describe, expect, it } from "vitest";

import { formatPercent, formatUsdt } from "@/lib/format";

/** U+2212 MINUS SIGN. 음수 부호로 ASCII `-`(U+002D) 대신 쓴다. */
const MINUS = "\u2212";
/** U+2014 EM DASH. 값이 없는 결과의 표시. */
const EM_DASH = "\u2014";

describe("결과 표시 — 계산 원값을 Bybit 계산기와 같은 규칙의 문자열로 본다", () => {
  describe("USDT 금액 표시", () => {
    /**
     * @spec DoD-7
     * @given 부호 옵션 없이 표본을 하나씩 넣는다: decimals 생략(기본 2) 780 → "780.00 USDT", 207.40734 → "207.40 USDT", 1234.5678 → "1,234.56 USDT" / decimals 3 123.0984 → "123.098 USDT", 1900 → "1,900.000 USDT" / decimals 4 270.06 → "270.0600 USDT"
     * @when USDT 금액 형식으로 표시한다
     * @then 결과 문자열이 표본의 기대 문자열과 정확히 같다(천 단위 쉼표, decimals 자릿수(기본 2)까지 0을 채운 소수, 공백 하나 뒤 "USDT", 부호 없음)
     */
    it("[DoD-7] 부호 없는 금액은 천 단위 구분·decimals 자릿수(기본 2)에 ' USDT'를 붙여 표시한다", () => {
      expect(formatUsdt(780)).toBe("780.00 USDT");
      expect(formatUsdt(207.40734)).toBe("207.40 USDT");
      expect(formatUsdt(1234.5678)).toBe("1,234.56 USDT");
      expect(formatUsdt(123.0984, { decimals: 3 })).toBe("123.098 USDT");
      expect(formatUsdt(1900, { decimals: 3 })).toBe("1,900.000 USDT");
      expect(formatUsdt(270.06, { decimals: 4 })).toBe("270.0600 USDT");
    });

    /**
     * @spec DoD-7
     * @given signed 옵션을 켜고 양수·음수 표본을 하나씩 넣는다: decimals 4 1234.56789 → "+1,234.5678 USDT", 270.06 → "+270.0600 USDT", 385.8 → "+385.8000 USDT", −51.849 → "−51.8490 USDT", −337.3351 → "−337.3351 USDT" / decimals 생략(기본 2) 1234.5678 → "+1,234.56 USDT" (음수 기대 문자열의 부호는 U+2212)
     * @when USDT 금액 형식으로 표시한다
     * @then 결과 문자열이 표본의 기대 문자열과 코드 포인트 단위로 정확히 같다(양수는 앞에 "+", 음수는 앞에 U+2212 "−")
     */
    it("[DoD-7] signed 옵션이 켜지면 양수 금액 앞에 '+', 음수 금액 앞에 U+2212 '−'를 붙인다", () => {
      expect(formatUsdt(1234.56789, { signed: true, decimals: 4 })).toBe("+1,234.5678 USDT");
      expect(formatUsdt(270.06, { signed: true, decimals: 4 })).toBe("+270.0600 USDT");
      expect(formatUsdt(385.8, { signed: true, decimals: 4 })).toBe("+385.8000 USDT");
      expect(formatUsdt(-51.849, { signed: true, decimals: 4 })).toBe(`${MINUS}51.8490 USDT`);
      expect(formatUsdt(-337.3351, { signed: true, decimals: 4 })).toBe(`${MINUS}337.3351 USDT`);
      expect(formatUsdt(1234.5678, { signed: true })).toBe("+1,234.56 USDT");
    });
  });

  describe("퍼센트 표시", () => {
    /**
     * @spec DoD-8
     * @given 양수·음수 표본을 하나씩 넣는다: 12.3567 → "+12.35%", 34.6230769 → "+34.62%", 30.864 → "+30.86%", 22.3578947 → "+22.35%", −178.0775751 → "−178.07%" (음수 기대 문자열의 부호는 U+2212)
     * @when 퍼센트 형식으로 표시한다
     * @then 결과 문자열이 표본의 기대 문자열과 코드 포인트 단위로 정확히 같다(양수는 앞에 "+", 음수는 앞에 U+2212 "−", 소수 둘째 자리, 끝에 "%")
     */
    it("[DoD-8] ROE는 부호(양수 '+', 음수 U+2212 '−')와 소수 둘째 자리, '%'로 표시한다", () => {
      expect(formatPercent(12.3567)).toBe("+12.35%");
      expect(formatPercent(34.6230769)).toBe("+34.62%");
      expect(formatPercent(30.864)).toBe("+30.86%");
      expect(formatPercent(22.3578947)).toBe("+22.35%");
      expect(formatPercent(-178.0775751)).toBe(`${MINUS}178.07%`);
    });
  });

  describe("표시 자릿수 규칙 — 오차를 정리한 뒤 0 방향으로 버린다", () => {
    /**
     * @spec DoD-18
     * @given 경계 표본을 하나씩 넣는다: 양수 버림 1.006 → "1.00 USDT"(사사오입이면 1.01) / 음수 0 방향 버림 signed −51.849 → "−51.84 USDT"(floor인 "−51.85 USDT"가 아니다) / 오차 정리 후 버림 JS `100.35 - 100` 결과 0.3499999999999943 → "0.35 USDT"·signed "+0.35 USDT", 그 부호 반대 −0.3499999999999943 → signed "−0.35 USDT" / decimals 4 오차 정리 후 버림 JS `(3210.55 - 3456.78) * 1.37` 결과 −337.33510000000007 → signed "−337.3351 USDT" / 정리 자릿수 10 고정 1.2399999999(소수 10자리) → "1.23 USDT"(정리 자릿수가 9 이하이면 1.24), 1.23999999999(소수 11자리) → "1.24 USDT"(정리 자릿수가 11 이상이면 1.23) (decimals 생략 표본은 기본 2, 음수 부호는 U+2212)
     * @when USDT 금액 형식으로 표시한다
     * @then 결과 문자열이 표본의 기대 문자열과 코드 포인트 단위로 정확히 같다(원값을 소수 10자리에서 사사오입한 뒤 표시 자릿수에서 0 방향으로 버린 값: 0.3499999999999943 → 0.35이며 0.34가 아니고, 1.2399999999 → 1.23, 1.23999999999 → 1.24다)
     */
    it("[DoD-18] USDT 금액은 소수 10자리에서 오차를 정리한 뒤 표시 자릿수에서 0 방향으로 버려 표시한다", () => {
      // 양수 버림: 사사오입이면 1.01
      expect(formatUsdt(1.006)).toBe("1.00 USDT");
      // 음수 0 방향 버림: floor라면 −51.85
      expect(formatUsdt(-51.849, { signed: true })).toBe(`${MINUS}51.84 USDT`);
      // 오차 정리 후 버림: JS `100.35 - 100`의 결과
      const diff = 0.3499999999999943;
      expect(formatUsdt(diff)).toBe("0.35 USDT");
      expect(formatUsdt(diff, { signed: true })).toBe("+0.35 USDT");
      expect(formatUsdt(-diff, { signed: true })).toBe(`${MINUS}0.35 USDT`);
      // decimals 4 오차 정리 후 버림: JS `(3210.55 - 3456.78) * 1.37`의 결과
      expect(formatUsdt(-337.33510000000007, { signed: true, decimals: 4 })).toBe(
        `${MINUS}337.3351 USDT`,
      );
      // 정리 자릿수 10 고정: 9자리 이하로 정리하면 1.24, 11자리 이상으로 정리하면 1.23
      expect(formatUsdt(1.2399999999)).toBe("1.23 USDT");
      expect(formatUsdt(1.23999999999)).toBe("1.24 USDT");
    });

    /**
     * @spec DoD-18
     * @given 경계 표본을 하나씩 넣는다: 양수 버림 1.006 → "+1.00%"(사사오입이면 1.01) / 음수 0 방향 버림 −24.998633 → "−24.99%"(floor인 "−25.00%"가 아니다) / 오차 정리 후 버림 0.3499999999999943 → "+0.35%", −0.3499999999999943 → "−0.35%" / 정리 자릿수 10 고정 1.2399999999(소수 10자리) → "+1.23%"(정리 자릿수가 9 이하이면 1.24), 1.23999999999(소수 11자리) → "+1.24%"(정리 자릿수가 11 이상이면 1.23) (음수 부호는 U+2212)
     * @when 퍼센트 형식으로 표시한다
     * @then 결과 문자열이 표본의 기대 문자열과 코드 포인트 단위로 정확히 같다(원값을 소수 10자리에서 사사오입한 뒤 소수 둘째 자리에서 0 방향으로 버린 값: 1.2399999999 → 1.23, 1.23999999999 → 1.24)
     */
    it("[DoD-18] 퍼센트는 소수 10자리에서 오차를 정리한 뒤 소수 둘째 자리에서 0 방향으로 버려 표시한다", () => {
      // 양수 버림: 사사오입이면 1.01
      expect(formatPercent(1.006)).toBe("+1.00%");
      // 음수 0 방향 버림: floor라면 −25.00
      expect(formatPercent(-24.998633)).toBe(`${MINUS}24.99%`);
      // 오차 정리 후 버림
      expect(formatPercent(0.3499999999999943)).toBe("+0.35%");
      expect(formatPercent(-0.3499999999999943)).toBe(`${MINUS}0.35%`);
      // 정리 자릿수 10 고정
      expect(formatPercent(1.2399999999)).toBe("+1.23%");
      expect(formatPercent(1.23999999999)).toBe("+1.24%");
    });
  });

  describe("진입가와 종료가가 같아 손익이 0인 경우", () => {
    /**
     * @spec EC-5
     * @given 진입가와 종료가가 같은 포지션의 원값 pnl 0, roe 0이다
     * @when 손익을 signed 옵션을 켜고 decimals 4인 USDT 금액 형식으로, ROE를 퍼센트 형식으로 표시한다
     * @then 손익 문자열이 정확히 "0.0000 USDT"다
     * @then ROE 문자열이 정확히 "0.00%"다
     */
    it("[EC-5] 손익 0은 '0.0000 USDT', ROE 0은 '0.00%'로 부호 없이 표시한다", () => {
      const pnl = 0;
      const roe = 0;
      expect(formatUsdt(pnl, { signed: true, decimals: 4 })).toBe("0.0000 USDT");
      expect(formatPercent(roe)).toBe("0.00%");
    });
  });

  describe("버리면 0이 되는 값", () => {
    /**
     * @spec EC-6
     * @given 버린 결과가 0인 표본을 하나씩 넣는다: signed decimals 4 0.00004, −0.00004, 0.00009, −0.00009 → "0.0000 USDT" / signed decimals 생략(기본 2) 0.009, −0.009 → "0.00 USDT" / 부호 옵션 없이 양수만 decimals 4 0.00004, 0.00009 → "0.0000 USDT", decimals 생략(기본 2) 0.009 → "0.00 USDT"
     * @when USDT 금액 형식으로 표시한다
     * @then 모든 결과 문자열이 표본의 기대 문자열("0.0000 USDT" 또는 "0.00 USDT")과 정확히 같다("+0.0000"·U+2212 "−0.0000" 없음)
     */
    it("[EC-6] 버리면 0이 되는 금액은 원값의 부호와 상관없이 부호 없는 0으로 표시한다", () => {
      const cases: [number, { signed?: boolean; decimals?: number }, string][] = [
        [0.00004, { signed: true, decimals: 4 }, "0.0000 USDT"],
        [-0.00004, { signed: true, decimals: 4 }, "0.0000 USDT"],
        [0.00009, { signed: true, decimals: 4 }, "0.0000 USDT"],
        [-0.00009, { signed: true, decimals: 4 }, "0.0000 USDT"],
        [0.009, { signed: true }, "0.00 USDT"],
        [-0.009, { signed: true }, "0.00 USDT"],
        [0.00004, { decimals: 4 }, "0.0000 USDT"],
        [0.00009, { decimals: 4 }, "0.0000 USDT"],
        [0.009, {}, "0.00 USDT"],
      ];
      for (const [value, opts, expected] of cases) {
        expect(formatUsdt(value, opts), `${value} ${JSON.stringify(opts)}`).toBe(expected);
      }
    });

    /**
     * @spec EC-6
     * @given 버린 결과가 0인 표본을 하나씩 넣는다: 0.009, 0.001, −0.004, −0.009
     * @when 퍼센트 형식으로 표시한다
     * @then 모든 결과 문자열이 정확히 "0.00%"다("+0.00%"·U+2212 "−0.00%" 없음)
     */
    it("[EC-6] 버리면 0이 되는 ROE는 원값의 부호와 상관없이 '0.00%'로 표시한다", () => {
      for (const value of [0.009, 0.001, -0.004, -0.009]) {
        expect(formatPercent(value), `${value}`).toBe("0.00%");
      }
    });
  });

  describe("큰 값", () => {
    /**
     * @spec EC-7
     * @given 수량 1e9 규모의 금액 표본을 하나씩 넣는다: 부호 옵션 없이 decimals 생략(기본 2) 6500000000000 → "6,500,000,000,000.00 USDT", signed decimals 4 2250500000000 → "+2,250,500,000,000.0000 USDT", signed decimals 4 −2250500000000 → "−2,250,500,000,000.0000 USDT" (부호는 U+2212)
     * @when USDT 금액 형식으로 표시한다
     * @then 결과 문자열이 표본의 기대 문자열과 정확히 같다(세 자리마다 쉼표, 지수 표기 없음)
     */
    it("[EC-7] 수량 1e9 규모의 큰 금액도 천 단위 구분 형식으로 표시한다", () => {
      expect(formatUsdt(6500000000000)).toBe("6,500,000,000,000.00 USDT");
      expect(formatUsdt(2250500000000, { signed: true, decimals: 4 })).toBe(
        "+2,250,500,000,000.0000 USDT",
      );
      expect(formatUsdt(-2250500000000, { signed: true, decimals: 4 })).toBe(
        `${MINUS}2,250,500,000,000.0000 USDT`,
      );
    });
  });

  describe("값이 없는 결과", () => {
    /**
     * @spec EC-3 EC-8
     * @given 값이 없는(null) 결과를 옵션 없이, signed 옵션을 켜고, signed와 decimals 4를 함께 지정해 각각 넣는다
     * @when USDT 금액 형식으로 표시한다
     * @then 결과 문자열이 정확히 U+2014 "—" 한 글자다
     */
    it("[EC-3][EC-8] 값이 없는 금액은 U+2014 '—'로 표시한다", () => {
      expect(formatUsdt(null)).toBe(EM_DASH);
      expect(formatUsdt(null, { signed: true })).toBe(EM_DASH);
      expect(formatUsdt(null, { signed: true, decimals: 4 })).toBe(EM_DASH);
    });

    /**
     * @spec EC-3 EC-8
     * @given 값이 없는(null) ROE다
     * @when 퍼센트 형식으로 표시한다
     * @then 결과 문자열이 정확히 U+2014 "—" 한 글자다
     */
    it("[EC-3][EC-8] 값이 없는 ROE는 U+2014 '—'로 표시한다", () => {
      expect(formatPercent(null)).toBe(EM_DASH);
    });
  });
});
