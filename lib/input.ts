/** 레버리지: 숫자만 (F-1 EC-1) */
export const LEVERAGE_PATTERN = /^\d*$/;
/** 진입가·종료가·수량·USDT 금액: 숫자와 소수점 하나 (F-1 EC-2) */
export const DECIMAL_PATTERN = /^\d*\.?\d*$/;

/** 입력 문자열을 계산용 숫자로 바꾼다. 빈 값·`.`·유한하지 않은 값은 null이다. */
export function toNumber(text: string): number | null {
  if (text === "" || text === ".") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function isPositive(n: number | null): n is number {
  return n !== null && n > 0;
}

/** 정규식에 맞을 때만 새 값을 받는 onChange 헬퍼. */
export function filtered(
  pattern: RegExp,
  set: (v: string) => void,
): (event: { target: { value: string } }) => void {
  return (event) => {
    const next = event.target.value;
    if (pattern.test(next)) set(next);
  };
}
