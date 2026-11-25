export type AverageEntryInput = { price: number; qty: number };

export type AverageEntryResult = { avgPrice: number; totalQty: number };

/** 유한한 양수인지 검사한다. NaN·Infinity·0·음수는 false다. */
function isPositiveFinite(v: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * 진입 목록의 평균 진입가 Σ(price × qty) ÷ Σqty와 총 수량 Σqty를 반올림하지 않은 원값으로 계산한다.
 * 합은 입력 순서대로 단일 패스로 구하고 입력 배열을 변경하지 않는다.
 * 배열이 비었거나, `price`·`qty` 중 0 이하이거나 유한하지 않은 값이 하나라도 있거나,
 * 결과가 유한하지 않으면 `null`이다(F-5 스펙 4장, EC-5·EC-6).
 */
export function averageEntry(entries: readonly AverageEntryInput[]): AverageEntryResult | null {
  if (entries.length === 0) return null;

  let notional = 0;
  let totalQty = 0;
  for (const { price, qty } of entries) {
    if (!isPositiveFinite(price) || !isPositiveFinite(qty)) return null;
    notional += price * qty;
    totalQty += qty;
  }

  const avgPrice = notional / totalQty;
  if (!Number.isFinite(avgPrice) || !Number.isFinite(totalQty)) return null;
  return { avgPrice, totalQty };
}
