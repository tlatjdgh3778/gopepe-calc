import { roundToStep } from "@/lib/format";

export type TargetPriceInput = {
  side: "long" | "short";
  leverage: number;
  entryPrice: number | null;
  /** 목표 ROE(%). 음수와 0을 허용한다. */
  targetRoe: number | null;
  tickSize: number;
};

export type TargetPriceResult = {
  targetPrice: number | null;
  priceChangePercent: number | null;
};

/** 유한한 양수인지 검사한다. null·NaN·Infinity·0·음수는 false다. */
function isPositiveFinite(v: number | null): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * 틱 맞춤 결과.
 * - `invalid`: 입력이 계산 불가(레버리지·진입가가 없거나 0 이하, 목표 ROE가 없거나 유한하지 않음)
 * - `nonPositive`: 틱에 맞춘 목표가가 0 이하(−∞ 포함, EC-6)
 * - `unbounded`: 원값·틱 맞춤 결과가 +∞ 등 유한하지 않아 가격으로 볼 수 없음(오버플로)
 * - `positive`: 틱에 맞춘 유한한 양수 목표가
 */
type TickedTarget =
  | { kind: "invalid" }
  | { kind: "nonPositive" }
  | { kind: "unbounded" }
  | { kind: "positive"; price: number };

/** 틱에 맞춘 목표가(F-2 DoD-1~DoD-4). 계산과 경고 판정이 함께 쓴다. */
function tickedTargetPrice(input: TargetPriceInput): TickedTarget {
  const { side, leverage, entryPrice, targetRoe, tickSize } = input;
  if (!isPositiveFinite(leverage) || !isPositiveFinite(entryPrice)) return { kind: "invalid" };
  if (typeof targetRoe !== "number" || !Number.isFinite(targetRoe)) return { kind: "invalid" };

  const ratio = targetRoe / (100 * leverage);
  const raw = side === "long" ? entryPrice * (1 + ratio) : entryPrice * (1 - ratio);
  // 롱은 +∞ 방향, 숏은 −∞ 방향으로 맞춰 ROE가 목표 이상이 되게 한다(DoD-3·DoD-4).
  const ticked = roundToStep(raw, tickSize, side === "long" ? "up" : "down");
  // 원값이 −∞이면 `roundToStep`은 null을, 거대한 유한 음수이면 −∞를 돌려준다. 둘 다 0 이하다.
  if (raw === -Infinity || (ticked !== null && ticked <= 0)) return { kind: "nonPositive" };
  // `roundToStep`은 거대한 유한 입력에서 +∞를 돌려줄 수 있다.
  if (ticked === null || !Number.isFinite(ticked)) return { kind: "unbounded" };
  return { kind: "positive", price: ticked };
}

/**
 * 목표 ROE 이상이 되는 틱 단위 목표가와 진입가 대비 가격 변동률(반올림하지 않은 값)을 계산한다.
 * 레버리지·진입가가 없거나 0 이하이거나, 목표 ROE가 없거나, 결과가 유한하지 않거나,
 * 목표가가 0 이하이면 두 필드 모두 `null`이다(F-2 스펙 4장, EC-2·EC-3·EC-6).
 */
export function calculateTargetPrice(input: TargetPriceInput): TargetPriceResult {
  const ticked = tickedTargetPrice(input);
  if (ticked.kind !== "positive" || !isPositiveFinite(input.entryPrice)) {
    return { targetPrice: null, priceChangePercent: null };
  }
  const targetPrice = ticked.price;
  const priceChangePercent = ((targetPrice - input.entryPrice) / input.entryPrice) * 100;
  if (!Number.isFinite(priceChangePercent)) {
    return { targetPrice: null, priceChangePercent: null };
  }
  return { targetPrice, priceChangePercent };
}

/**
 * 목표 ROE 경고 판정(F-2 EC-7·EC-8·EC-9).
 * 입력이 유효하고 틱에 맞춘 목표가가 0 이하(−∞ 포함)이면 `"noPrice"`(EC-7),
 * 그 외에 입력이 유효하고 목표 ROE가 −100 이하이면 `"beyondMargin"`(EC-8, 결과가 +∞여도),
 * 입력이 계산 불가이거나 해당 없으면 `null`이다. 둘 다 해당하면 `"noPrice"`만 돌려준다(EC-9).
 */
export function checkTargetRoe(input: TargetPriceInput): "noPrice" | "beyondMargin" | null {
  const ticked = tickedTargetPrice(input);
  if (ticked.kind === "invalid") return null;
  if (ticked.kind === "nonPositive") return "noPrice";
  return input.targetRoe !== null && input.targetRoe <= -100 ? "beyondMargin" : null;
}
