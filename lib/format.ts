const EMPTY = "—";
const MINUS = "−";

/** 부동소수점 오차를 정리한다: 원값을 소수 10자리에서 사사오입한다. */
function cleanup(v: number): number {
  return Number(v.toFixed(10));
}

const truncFormatters = new Map<string, Intl.NumberFormat>();

function truncFormatter(decimals: number, signed: boolean): Intl.NumberFormat {
  const key = `${decimals}:${signed}`;
  let formatter = truncFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      roundingMode: "trunc",
      // exceptZero·negative 모두 버린 결과가 0(−0 포함)이면 부호를 붙이지 않는다.
      signDisplay: signed ? "exceptZero" : "negative",
      useGrouping: true,
    });
    truncFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * 표시값 규칙(DoD-18): 소수 10자리에서 오차를 정리한 뒤 표시 자릿수에서 0 방향으로 버린다.
 * 천 단위 구분을 하고 음수 부호는 U+2212로 쓴다.
 */
function formatTrunc(v: number, decimals: number, signed: boolean): string {
  return truncFormatter(decimals, signed).format(cleanup(v)).replace("-", MINUS);
}

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** USDT 금액 표시. 예: `formatUsdt(1234.56789, { signed: true, decimals: 4 })` → `+1,234.5678 USDT` */
export function formatUsdt(
  v: number | null,
  opts: { signed?: boolean; decimals?: number } = {},
): string {
  if (!isFiniteNumber(v)) return EMPTY;
  const { signed = false, decimals = 2 } = opts;
  return `${formatTrunc(v, decimals, signed)} USDT`;
}

/** ROE 표시. 소수 둘째 자리, 부호, `%`. 예: `+12.35%` */
export function formatPercent(v: number | null): string {
  if (!isFiniteNumber(v)) return EMPTY;
  return `${formatTrunc(v, 2, true)}%`;
}

/**
 * 참고 코인 수량 표시(DoD-14). DoD-18 규칙으로 소수 넷째 자리까지, 끝의 0을 유지한다.
 * 예: 0.2 → `0.2000`, 6.999999999999999 → `7.0000`. 값이 없으면 `—`.
 * 단위(`≈`, 기초 코인)는 붙이지 않는다.
 */
export function formatCoinQty(v: number | null): string {
  if (!isFiniteNumber(v)) return EMPTY;
  return formatTrunc(v, 4, false);
}

const fillFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 8,
  roundingMode: "halfExpand",
  signDisplay: "negative",
  useGrouping: false,
});

/**
 * 수량 단위 전환 시 입력란에 채울 문자열(DoD-13).
 * 소수 최대 8자리 사사오입(10진 값 기준), 끝의 0 제거, 지수 표기·천 단위 구분 없음.
 * DoD-18의 버림은 적용하지 않는다. 예: 0.2 → `0.2`, 1.54e-6 → `0.00000154`, 7800 → `7800`.
 * 값이 없으면 빈 문자열이다.
 */
export function formatQtyInput(v: number | null): string {
  if (!isFiniteNumber(v)) return "";
  return fillFormatter.format(v);
}
