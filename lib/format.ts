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

/** 단위(틱·수량 단위)의 소수 자릿수. 예: 0.001 → 3, 0.1 → 1, 1 → 0, 1e-7 → 7. */
function stepDecimals(step: number): number {
  const [mantissa, exponent] = String(step).split("e");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  const shift = exponent === undefined ? 0 : -Number(exponent);
  return Math.max(0, fraction + shift);
}

/**
 * 부동소수점 오차 판정(F-7 DoD-3). 단위 수(value ÷ step)와 가장 가까운 정수의 차가
 * `1e-12 × max(1, |단위 수|)` 이하이면 그 정수를, 아니면 `null`을 돌려준다.
 * 배수·내림 판정의 허용치는 이곳에만 둔다.
 */
function nearestUnitWithinError(units: number): number | null {
  const nearest = Math.round(units);
  return Math.abs(units - nearest) <= 1e-12 * Math.max(1, Math.abs(units)) ? nearest : null;
}

/**
 * 값을 단위(`step`)의 배수로 반올림한다(F-7 DoD-3). `up`은 +∞, `down`은 −∞ 방향이다.
 * 단위 수(value ÷ step)가 가장 가까운 정수와 부동소수점 오차 안이면 그 정수 배로 보고,
 * 아니면 올림·내림한 뒤 단위 자릿수로 고정한다.
 * 예: `roundToStep(0.3, 0.1, "down")` → `0.3`, `roundToStep(262.441, 0.001, "down")` → `262.441`,
 * `roundToStep(0.00199999999999, 0.001, "down")` → `0.001`.
 * 값이 `null`·`NaN`·`±Infinity`이면 `null`이다(EC-6).
 */
export function roundToStep(
  value: number | null,
  step: number,
  mode: "up" | "down",
): number | null {
  if (!isFiniteNumber(value)) return null;
  if (!isFiniteNumber(step) || step <= 0) return null;
  const units = value / step;
  const n = nearestUnitWithinError(units) ?? (mode === "up" ? Math.ceil(units) : Math.floor(units));
  // `+ 0`은 −0을 0으로 바꾼다.
  return Number((n * step).toFixed(stepDecimals(step))) + 0;
}

/**
 * 가격 표시(F-7 DoD-4·DoD-5). `priceScale` 소수 자릿수, 천 단위 구분, 음수 부호 U+2212, 단위 없음.
 * 더 긴 소수는 DoD-18 규칙(오차 정리 후 0 방향 버림)으로 자른다. 틱 반올림은 호출자가 먼저 한다.
 * 예: `formatPrice(60274, 2)` → `60,274.00`. 값이 없으면 `—`(EC-7).
 */
export function formatPrice(value: number | null, priceScale: number): string {
  if (!isFiniteNumber(value)) return EMPTY;
  return formatTrunc(value, priceScale, false);
}

/**
 * 코인 수량 표시(F-7 DoD-6). DoD-18 규칙으로 `qtyStep`의 소수 자릿수까지, 끝의 0을 유지한다.
 * 예: `formatCoinQty(0.2, 0.001)` → `0.200`, `formatCoinQty(6.999999999999999, 0.001)` → `7.000`.
 * 값이 없으면 `—`. 단위(`≈`, 기초 코인)는 붙이지 않는다.
 */
export function formatCoinQty(v: number | null, qtyStep: number): string {
  if (!isFiniteNumber(v)) return EMPTY;
  return formatTrunc(v, stepDecimals(qtyStep), false);
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
