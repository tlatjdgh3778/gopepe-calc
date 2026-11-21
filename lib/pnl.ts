export type PnlInput = {
  side: "long" | "short";
  leverage: number;
  entryPrice: number | null;
  exitPrice: number | null;
  qty: number | null;
};

export type PnlResult = {
  initialMargin: number | null;
  pnl: number | null;
  roe: number | null;
};

/** 유한한 양수인지 검사한다. null·NaN·Infinity·0·음수는 false다. */
function isPositiveFinite(v: number | null): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

/**
 * 포지션의 필요 증거금·손익·ROE 원값(반올림하지 않은 값)을 계산한다.
 * 각 결과는 자기 계산에 필요한 값만 검사하고, 값이 없거나 0 이하이거나
 * 결과가 유한하지 않으면 그 결과만 null이다.
 */
export function calculatePnl(input: PnlInput): PnlResult {
  const { side, leverage, entryPrice, exitPrice, qty } = input;

  const initialMargin =
    isPositiveFinite(entryPrice) && isPositiveFinite(qty) && isPositiveFinite(leverage)
      ? finiteOrNull((entryPrice * qty) / leverage)
      : null;

  const pnl =
    isPositiveFinite(entryPrice) && isPositiveFinite(exitPrice) && isPositiveFinite(qty)
      ? finiteOrNull(
          side === "long" ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty,
        )
      : null;

  const roe =
    pnl !== null && initialMargin !== null ? finiteOrNull((pnl / initialMargin) * 100) : null;

  return { initialMargin, pnl, roe };
}

/** USDT 금액(포지션 가치)을 코인 수량으로 환산한다. 환산할 수 없으면 null이다. */
export function qtyFromValue(valueUsdt: number | null, entryPrice: number | null): number | null {
  if (!isPositiveFinite(valueUsdt) || !isPositiveFinite(entryPrice)) return null;
  return finiteOrNull(valueUsdt / entryPrice);
}
