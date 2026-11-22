import { roundToStep } from "@/lib/format";
import type { SymbolInfo } from "@/lib/symbols";

/** 레버리지 경고 판정(F-7 DoD-7). `maxLeverage`보다 크면 `"exceedsMax"`, 그 외·`null`은 `null`이다. */
export function checkLeverage(leverage: number | null, symbol: SymbolInfo): "exceedsMax" | null {
  if (leverage === null) return null;
  return leverage > symbol.maxLeverage ? "exceedsMax" : null;
}

/**
 * 수량 경고 판정(F-7 DoD-8). `minOrderQty`보다 작으면 `"belowMin"`(0 포함),
 * `minOrderQty` 이상이지만 `qtyStep`의 배수가 아니면 `"notStepMultiple"`, 그 외·`null`은 `null`이다.
 */
export function checkQty(
  qty: number | null,
  symbol: SymbolInfo,
): "belowMin" | "notStepMultiple" | null {
  if (qty === null) return null;
  if (qty < symbol.minOrderQty) return "belowMin";
  return isStepMultiple(qty, symbol.qtyStep) ? null : "notStepMultiple";
}

/**
 * `roundToStep`과 같은 부동소수점 오차 정의(F-7 DoD-3)로 배수인지 본다.
 * 단위 수가 정수이거나 가장 가까운 정수와 오차 안일 때만 올림과 내림 결과가 같다.
 */
function isStepMultiple(value: number, step: number): boolean {
  const down = roundToStep(value, step, "down");
  return down !== null && down === roundToStep(value, step, "up");
}
