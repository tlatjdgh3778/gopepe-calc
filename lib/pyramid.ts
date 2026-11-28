import { liquidationPrice } from "@/lib/liquidation";

type Side = "long" | "short";

export type PyramidStepInput = { price: number | null; reinvestPercent: number | null };

export type PyramidInput = {
  side: Side;
  entryPrice: number | null;
  margin: number | null;
  leverage: number;
  /** 소수(0.055% → 0.00055). */
  feeRate: number;
  /** 소수(0.33% → 0.0033). */
  mmr: number;
  steps: readonly PyramidStepInput[];
};

/**
 * 단계 제외 사유.
 * - `empty`: 가격과 재투입이 모두 비었다(EC-16)
 * - `invalidInput`: 한 칸만 비었거나, 가격이 0 이하이거나, 재투입이 1 미만·100 초과다(EC-12)
 * - `notProfitDirection`: 제외되지 않은 마지막 진입가보다 수익 방향이 아니다(EC-13)
 * - `noProfit`: 가용 수익이 0 이하다(EC-14, 부동소수점 오차 대비 방어 분기)
 */
export type PyramidExclusion = "invalidInput" | "notProfitDirection" | "noProfit" | "empty";

export type PyramidRow = {
  price: number | null;
  /** 최초 진입 행은 null. */
  reinvestPercent: number | null;
  /** 그 단계 가격에서 직전까지 포지션의 수수료 미차감 미실현 손익. 최초 행·`invalidInput`·`empty` 행은 null. */
  pnlAtStep: number | null;
  /** 최초 행은 초기 증거금, 제외 행은 0. */
  marginUsed: number;
  /** 최초 행은 최초 수량, 제외 행은 0. */
  addedQty: number;
  /** 그 단계까지의 누적 평단. 제외 행은 직전 값. */
  avgPrice: number;
  /** 그 단계까지 반영한 추정 청산가 원값(0 이하 가능). 담보가 0 이하이면 null. 제외 행은 직전 값. */
  liquidationPrice: number | null;
  excluded: PyramidExclusion | null;
};

export type PyramidResult = {
  totalQty: number;
  avgPrice: number;
  entryFees: number;
  /** 마지막 포함 진입가(추가 진입이 없으면 최초 진입가). */
  lastPrice: number;
  /** 추정 청산가 원값(0 이하 가능). collateral = margin − 누적 진입 수수료가 0 이하이면 null. */
  liquidationPrice: number | null;
  equity: number;
  finalNotional: number;
  effectiveLeverage: number;
  breakEvenPrice: number;
  /** 최초 진입 행 + 단계별 행. */
  rows: PyramidRow[];
};

/** 유한한 양수인지 검사한다. null·NaN·Infinity·0·음수는 false다. */
function isPositiveFinite(v: number | null): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isFiniteNumber(v: number | null): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function direction(side: Side): 1 | -1 {
  return side === "long" ? 1 : -1;
}

/** 기본 입력이 유효한지 검사한다(EC-11). */
function validBase(
  input: PyramidInput,
): input is PyramidInput & { entryPrice: number; margin: number } {
  const { entryPrice, margin, leverage, feeRate } = input;
  if (!isPositiveFinite(entryPrice) || !isPositiveFinite(margin)) return false;
  if (!Number.isFinite(leverage) || leverage < 1) return false;
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 0.01) return false;
  return true;
}

/** 단계 입력 칸 판정(empty → invalidInput). 통과하면 null. */
function inputExclusion(step: PyramidStepInput): "empty" | "invalidInput" | null {
  const { price, reinvestPercent } = step;
  if (price === null && reinvestPercent === null) return "empty";
  if (!isPositiveFinite(price)) return "invalidInput";
  if (!isFiniteNumber(reinvestPercent) || reinvestPercent < 1 || reinvestPercent > 100) {
    return "invalidInput";
  }
  return null;
}

/**
 * 최초 진입과 수익 재투입 단계로 피라미딩 포지션을 시뮬레이션한다(DoD-1~DoD-4). 반올림하지 않은 원값.
 * 단계 판정 순서는 empty → invalidInput → notProfitDirection → noProfit이고,
 * 제외된 단계는 뒤 단계의 가용 수익·방향 판정·수량에 영향을 주지 않는다(EC-15).
 * entryPrice·margin이 0 이하이거나 null, leverage가 1 미만, feeRate가 0 미만이거나 0.01 이상이거나,
 * 결과가 유한하지 않으면 null이다(EC-11). 입력 배열을 변경하지 않는다.
 */
export function simulatePyramid(input: PyramidInput): PyramidResult | null {
  if (!validBase(input)) return null;
  const { side, entryPrice, margin, leverage, feeRate, mmr, steps } = input;
  const s = direction(side);

  let qty = (margin * leverage) / entryPrice;
  let cost = qty * entryPrice;
  let fees = cost * feeRate;
  let allocated = 0;
  let last = entryPrice;

  const liquidation = (): number | null =>
    liquidationPrice({
      side,
      entryPrice: cost / qty,
      qty,
      collateral: margin - fees,
      mmr: mmr + feeRate,
    });

  let liq = liquidation();
  const rows: PyramidRow[] = [
    {
      price: entryPrice,
      reinvestPercent: null,
      pnlAtStep: null,
      marginUsed: margin,
      addedQty: qty,
      avgPrice: entryPrice,
      liquidationPrice: liq,
      excluded: null,
    },
  ];

  for (const step of steps) {
    const base = inputExclusion(step);
    if (base !== null) {
      rows.push({
        price: step.price,
        reinvestPercent: step.reinvestPercent,
        pnlAtStep: null,
        marginUsed: 0,
        addedQty: 0,
        avgPrice: cost / qty,
        liquidationPrice: liq,
        excluded: base,
      });
      continue;
    }
    // inputExclusion을 통과했으므로 두 값은 유한한 수다.
    const price = step.price as number;
    const reinvestPercent = step.reinvestPercent as number;
    const pnlAtStep = s * (price * qty - cost);
    const available = Math.max(0, pnlAtStep - allocated);

    let excluded: PyramidExclusion | null = null;
    if (s * (price - last) <= 0) excluded = "notProfitDirection";
    else if (available <= 0) excluded = "noProfit";

    if (excluded !== null) {
      rows.push({
        price,
        reinvestPercent,
        pnlAtStep,
        marginUsed: 0,
        addedQty: 0,
        avgPrice: cost / qty,
        liquidationPrice: liq,
        excluded,
      });
      continue;
    }

    const marginUsed = (available * reinvestPercent) / 100;
    const addedQty = (marginUsed * leverage) / price;
    qty += addedQty;
    cost += addedQty * price;
    fees += addedQty * price * feeRate;
    allocated += marginUsed;
    last = price;
    liq = liquidation();
    rows.push({
      price,
      reinvestPercent,
      pnlAtStep,
      marginUsed,
      addedQty,
      avgPrice: cost / qty,
      liquidationPrice: liq,
      excluded: null,
    });
  }

  const avgPrice = cost / qty;
  const equity = margin + s * (last * qty - cost) - fees;
  const finalNotional = qty * last;
  const effectiveLeverage = finalNotional / margin;
  const breakEvenPrice = solvePrice(s, feeRate, margin, qty, cost, fees, 0);

  const values = [qty, avgPrice, fees, equity, finalNotional, effectiveLeverage, breakEvenPrice];
  if (!values.every((v) => Number.isFinite(v))) return null;

  return {
    totalQty: qty,
    avgPrice,
    entryFees: fees,
    lastPrice: last,
    liquidationPrice: liq,
    equity,
    finalNotional,
    effectiveLeverage,
    breakEvenPrice,
    rows,
  };
}

/**
 * `netPnl(p) = s × (p × qty − cost) − fees − p × qty × feeRate = roe ÷ 100 × margin`을 p에 대해 푼다.
 * p = (roe ÷ 100 × margin + s × cost + fees) ÷ (qty × (s − feeRate)).
 */
function solvePrice(
  s: 1 | -1,
  feeRate: number,
  margin: number,
  qty: number,
  cost: number,
  fees: number,
  roePercent: number,
): number {
  return ((roePercent / 100) * margin + s * cost + fees) / (qty * (s - feeRate));
}

/**
 * 종료 가격의 순손익(DoD-5): 방향 × (exitPrice × 총 수량 − Σ진입가×수량) − 누적 진입 수수료 − exitPrice × 총 수량 × feeRate.
 * exitPrice가 null이거나 0 이하이거나, 결과가 유한하지 않으면 null이다.
 */
export function netPnl(
  input: PyramidInput,
  result: PyramidResult,
  exitPrice: number | null,
): number | null {
  if (!isPositiveFinite(exitPrice)) return null;
  const s = direction(input.side);
  const { totalQty, avgPrice, entryFees } = result;
  const cost = avgPrice * totalQty;
  const exitNotional = exitPrice * totalQty;
  const v = s * (exitNotional - cost) - entryFees - exitNotional * input.feeRate;
  return Number.isFinite(v) ? v : null;
}

/**
 * 최초 수량만으로 진입해 같은 가격에 종료했을 때의 순손익(DoD-6).
 * 최초 진입 수수료와 그 수량의 종료 수수료를 뺀다.
 * 기본 입력이 무효이거나(EC-11), exitPrice가 null이거나 0 이하이거나, 결과가 유한하지 않으면 null이다.
 */
export function baselinePnl(input: PyramidInput, exitPrice: number | null): number | null {
  if (!validBase(input) || !isPositiveFinite(exitPrice)) return null;
  const { side, entryPrice, margin, leverage, feeRate } = input;
  const s = direction(side);
  const qty = (margin * leverage) / entryPrice;
  const v =
    s * (exitPrice - entryPrice) * qty - entryPrice * qty * feeRate - exitPrice * qty * feeRate;
  return Number.isFinite(v) ? v : null;
}

/**
 * 목표 ROE(%)가 되는 종료 가격(DoD-7): `netPnl(p) = roe ÷ 100 × margin`을 p에 대해 푼 원값.
 * 본전가는 `priceForRoe(input, result, 0)`이다. 결과가 0 이하여도 그 값을 돌려준다.
 * roePercent가 null이거나 유한하지 않거나, margin이 무효이거나, 결과가 유한하지 않으면 null이다.
 */
export function priceForRoe(
  input: PyramidInput,
  result: PyramidResult,
  roePercent: number | null,
): number | null {
  if (!isFiniteNumber(roePercent) || !isPositiveFinite(input.margin)) return null;
  const s = direction(input.side);
  const { totalQty, avgPrice, entryFees } = result;
  const v = solvePrice(
    s,
    input.feeRate,
    input.margin,
    totalQty,
    avgPrice * totalQty,
    entryFees,
    roePercent,
  );
  return Number.isFinite(v) ? v : null;
}
