import { roundToStep } from "@/lib/format";
import { isPositive } from "@/lib/input";

export type MarginMode = "isolated" | "cross";

type Side = "long" | "short";

const EMPTY = "—";

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

/**
 * 추정 청산가 원값(반올림하지 않은 값)을 계산한다(DoD-8·DoD-9).
 * 롱: `(entryPrice × qty − collateral) ÷ (qty × (1 − mmr))`,
 * 숏: `(entryPrice × qty + collateral) ÷ (qty × (1 + mmr))`.
 * 예: 롱, 100000, 0.1, 1000, 0.0033 → `90297.98334…` / 숏 같은 입력 → `109638.19395…`.
 * 진입가·수량·담보가 비었거나 0 이하이거나, `mmr`이 0 이하이거나 1 이상이거나,
 * 결과가 유한하지 않으면 `null`이다. 롱의 원값이 0 이하여도 그 값을 돌려준다(EC-4).
 */
export function liquidationPrice(input: {
  side: Side;
  entryPrice: number | null;
  qty: number | null;
  collateral: number | null; // 격리 = 개시증거금, 교차 = 계좌 잔고(USDT)
  mmr: number; // 소수(0.0033 = 0.33%)
}): number | null {
  const { side, entryPrice, qty, collateral, mmr } = input;
  if (!isPositive(entryPrice) || !isPositive(qty) || !isPositive(collateral)) return null;
  if (!(mmr > 0 && mmr < 1)) return null;
  const notional = entryPrice * qty;
  return finiteOrNull(
    side === "long"
      ? (notional - collateral) / (qty * (1 - mmr))
      : (notional + collateral) / (qty * (1 + mmr)),
  );
}

/**
 * 격리 모드의 담보(개시증거금) `entryPrice × qty ÷ leverage`(DoD-11).
 * 예: `isolatedCollateral(100000, 0.1, 10)` → `1000`.
 * 입력이 비었거나 0 이하이거나 결과가 유한하지 않으면 `null`이다.
 */
export function isolatedCollateral(
  entryPrice: number | null,
  qty: number | null,
  leverage: number | null,
): number | null {
  if (!isPositive(entryPrice) || !isPositive(qty) || !isPositive(leverage)) return null;
  return finiteOrNull((entryPrice * qty) / leverage);
}

/**
 * 청산가를 가격 틱에 맞춘다(DoD-15). 롱은 올림, 숏은 내림(`roundToStep`에 위임).
 * 예: `roundLiquidation(90297.983…, "long", 0.1)` → `90298`,
 * `roundLiquidation(109638.193…, "short", 0.1)` → `109638.1`.
 * `price`가 비었거나 유한하지 않거나 0 이하이거나, 틱에 맞춘 결과가 유한하지 않으면 `null`이다.
 */
export function roundLiquidation(
  price: number | null,
  side: Side,
  tickSize: number,
): number | null {
  if (!isPositive(price) || !Number.isFinite(price)) return null;
  const rounded = roundToStep(price, tickSize, side === "long" ? "up" : "down");
  return rounded === null ? null : finiteOrNull(rounded);
}

/**
 * 진입가 대비 청산가 거리(%) `|liq − entry| ÷ entry × 100`(DoD-17).
 * 예: `distancePercent(90298, 100000)` → `9.702`.
 * 입력이 비었거나 0 이하이거나 결과가 유한하지 않으면 `null`이다.
 */
export function distancePercent(liq: number | null, entry: number | null): number | null {
  if (!isPositive(liq) || !isPositive(entry)) return null;
  return finiteOrNull((Math.abs(liq - entry) / entry) * 100);
}

/**
 * 손절가가 청산가보다 불리한지(손절 전에 청산되는지) 판정한다(DoD-23).
 * 롱은 `stop ≤ liq`, 숏은 `stop ≥ liq`이면 `true`. `stop`·`liq` 중 하나라도 `null`이면 `false`.
 */
export function isStopBeforeLiquidation(
  side: Side,
  stop: number | null,
  liq: number | null,
): boolean {
  if (stop === null || liq === null) return false;
  return side === "long" ? stop <= liq : stop >= liq;
}

/**
 * 포지션 가치(`entryPrice × qty`)가 유지증거금률 첫 단계 한도를 넘는지 판정한다(DoD-25).
 * 예: `exceedsFirstTier(100000, 3.001, 300000)` → `true`, `(100000, 3, 300000)` → `false`.
 * 진입가·수량이 비었거나 0 이하이면 `false`다.
 */
export function exceedsFirstTier(
  entryPrice: number | null,
  qty: number | null,
  riskLimitValue: number,
): boolean {
  if (!isPositive(entryPrice) || !isPositive(qty)) return false;
  return entryPrice * qty > riskLimitValue;
}

/** 부동소수점 오차를 정리한다: 원값을 소수 10자리에서 사사오입한다. */
function cleanup(v: number): number {
  return Number(v.toFixed(10));
}

const distanceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  roundingMode: "trunc",
  signDisplay: "never",
  useGrouping: true,
});

/**
 * 거리 표시(DoD-18). 소수 10자리에서 오차를 정리한 뒤 부호 없이 소수 2자리로 0 방향 버림,
 * 천 단위 구분, `%`. 예: `9.702` → `9.70%`, `1993.456` → `1,993.45%`.
 * 값이 없거나 유한하지 않으면 `—`.
 */
export function formatDistance(v: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return EMPTY;
  return `${distanceFormatter.format(cleanup(v))}%`;
}
