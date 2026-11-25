import { roundToStep } from "@/lib/format";
import { isPositive } from "@/lib/input";
import { qtyFromValue } from "@/lib/pnl";

export type MaxQuantityInput = {
  balance: number | null; // 사용 가능 잔고(USDT)
  leverage: number | null;
  entryPrice: number | null;
  qtyStep: number;
  minOrderQty: number;
};

export type MaxQuantityResult = {
  qty: number | null;
  positionValue: number | null;
  belowMin: boolean;
};

const EMPTY_RESULT: MaxQuantityResult = { qty: null, positionValue: null, belowMin: false };

/**
 * 최대 진입 수량과 그 포지션 가치를 계산한다(DoD-1·DoD-2).
 * 수량은 `roundToStep(balance × leverage ÷ entryPrice, qtyStep, "down")`,
 * 포지션 가치는 `qty × entryPrice`의 반올림하지 않은 값이다.
 * 예: `maxQuantity({ balance: 1000, leverage: 10, entryPrice: 65000, qtyStep: 0.001, minOrderQty: 0.001 })`
 * → `{ qty: 0.153, positionValue: 9945, belowMin: false }`.
 * 잔고·레버리지·진입가가 없거나 0 이하이거나 결과가 유한하지 않으면 `qty`·`positionValue`는
 * `null`, `belowMin`은 `false`다(EC-2·EC-3). 내린 수량이 `minOrderQty`보다 작으면(0 포함)
 * `qty`·`positionValue`는 `null`, `belowMin`은 `true`다(EC-5).
 */
export function maxQuantity(input: MaxQuantityInput): MaxQuantityResult {
  const { balance, leverage, entryPrice, qtyStep, minOrderQty } = input;
  if (!isPositive(balance) || !isPositive(leverage) || !isPositive(entryPrice)) {
    return EMPTY_RESULT;
  }

  const qty = roundToStep(qtyFromValue(balance * leverage, entryPrice), qtyStep, "down");
  if (qty === null || !Number.isFinite(qty)) return EMPTY_RESULT;

  if (qty < minOrderQty) return { qty: null, positionValue: null, belowMin: true };

  const positionValue = qty * entryPrice;
  if (!Number.isFinite(positionValue)) return EMPTY_RESULT;

  return { qty, positionValue, belowMin: false };
}
