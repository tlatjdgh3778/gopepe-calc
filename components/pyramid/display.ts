import { formatPrice } from "@/lib/format";
import { roundLiquidation } from "@/lib/liquidation";
import type { PyramidExclusion, PyramidRow } from "@/lib/pyramid";

/** 결과가 없을 때의 표시(U+2014). */
export const EMPTY = "—";

type Side = "long" | "short";

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 실효 레버리지 표시(DoD-18): 소수 2자리 버림·천 단위 구분 + `×`(U+00D7).
 * 예: 12.8195… → `12.81×`, 2534.21… → `2,534.21×`. 값이 없으면 `—`.
 */
export function formatLeverage(v: number | null): string {
  if (!isFiniteNumber(v)) return EMPTY;
  return `${formatPrice(v, 2)}×`;
}

/**
 * 손익비 표시(DoD-18): `1 : {소수 2자리 버림}`. 예: 6.3043… → `1 : 6.30`. 값이 없으면 `—`.
 */
export function formatRiskReward(v: number | null): string {
  if (!isFiniteNumber(v)) return EMPTY;
  return `1 : ${formatPrice(v, 2)}`;
}

/**
 * 추가 진입 효과 배수 표시(DoD-18): 소수 2자리 버림·천 단위 구분 + `배`.
 * 예: 1.5287… → `1.52배`. 값이 없으면 `—`.
 */
export function formatMultiple(v: number | null): string {
  if (!isFiniteNumber(v)) return EMPTY;
  return `${formatPrice(v, 2)}배`;
}

const fillPriceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 20,
  useGrouping: false,
  signDisplay: "negative",
});

/**
 * 입력란에 자동으로 채우는 가격 문자열(DoD-22·DoD-27). 틱에 맞춘 값을 받는다.
 * 천 단위 구분·지수 표기·끝자리 0이 없다. 예: 2415 → `2415`, 2100.1 → `2100.1`,
 * 1e21 → `1000000000000000000000`. 값이 없으면 빈 문자열이다.
 */
export function formatFillPrice(v: number | null): string {
  if (!isFiniteNumber(v)) return "";
  return fillPriceFormatter.format(v);
}

const roeFillFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  roundingMode: "trunc",
  useGrouping: false,
  signDisplay: "negative",
});

/**
 * 목표 수익률 입력란에 다시 채우는 문자열(DoD-23). 소수 10자리에서 오차를 정리한 뒤
 * 소수 2자리 버림, 천 단위 구분 없음, 음수 부호는 입력란이 받는 `-`(U+002D).
 * 예: 240.4003… → `240.40`, −38.1321… → `-38.13`. 값이 없으면 빈 문자열이다.
 */
export function formatRoeFill(v: number | null): string {
  if (!isFiniteNumber(v)) return "";
  return roeFillFormatter.format(Number(v.toFixed(10)));
}

const reinvestFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 20,
  useGrouping: false,
  signDisplay: "negative",
});

/**
 * 경로 표의 재투입 칸(DoD-20·EC-35): 끝자리 0 없는 숫자 + `%`. 예: 100 → `100%`, 12.5 → `12.5%`.
 * 값이 없으면 `—`.
 */
export function formatReinvest(v: number | null): string {
  if (!isFiniteNumber(v)) return EMPTY;
  return `${reinvestFormatter.format(v)}%`;
}

/** 마켓 스트립의 심볼 표시(DoD-33). 예: `ETH` → `ETH / USDT`. */
export function formatPair(baseCoin: string): string {
  return `${baseCoin} / USDT`;
}

/** 레버리지 배율 표시. 예: 5 → `5×`. 슬라이더 눈금에 쓴다. */
export function formatLeverageMark(n: number): string {
  return `${n}×`;
}

/** 단계 이름(DoD-20). 예: 1 → `1차 추가 진입`. */
export function stepName(n: number): string {
  return `${n}차 추가 진입`;
}

/** 단계 입력 접근 이름(DoD-34). 예: 1 → `1차 추가 진입가`·`1차 재투입 비율`·`1차 추가 진입 삭제`. */
export function stepPriceLabel(n: number): string {
  return `${stepName(n)}가`;
}

export function stepReinvestLabel(n: number): string {
  return `${n}차 재투입 비율`;
}

export function stepRemoveLabel(n: number): string {
  return `${stepName(n)} 삭제`;
}

/** 단계 카드 번호. 예: 1 → `01`. */
export function stepNumber(n: number): string {
  return String(n).padStart(2, "0");
}

/** 수량 + 공백 + 기초 코인(DoD-18). 수량 문자열이 `—`이면 단위를 붙이지 않는다. */
export function withCoin(qtyText: string, baseCoin: string): string {
  return qtyText === EMPTY ? qtyText : `${qtyText} ${baseCoin}`;
}

/** 평균 진입가 보조 문구(DoD-17). `percentText`는 `formatPercent` 결과다. */
export function avgShiftText(percentText: string): string {
  return `최초 진입 대비 ${percentText} 이동`;
}

/** 실효 레버리지 보조 문구(DoD-17). 예: (5, 12.81…) → `최초 5× → 12.81× 노출`. */
export function leverageChangeText(initial: number, effective: number): string {
  return `최초 ${formatLeverageMark(initial)} → ${formatLeverage(effective)} 노출`;
}

/** 리스크 문구(DoD-26). `distanceText`는 `formatDistance` 결과다. */
export function riskNoticeText(distanceText: string): string {
  return `마지막 진입가에서 ${distanceText} 역행하면 수수료 포함 전체 수익이 사라집니다.`;
}

/** 추가 진입 효과 값(DoD-24·EC-28). 배수가 있으면 ` · {x.xx}배`를 붙인다. */
export function effectText(diffText: string, multiple: number | null): string {
  if (diffText === EMPTY) return EMPTY;
  return multiple === null ? diffText : `${diffText} · ${formatMultiple(multiple)}`;
}

/** 손절 거리 막대의 시작 표시. `priceText`는 `formatPrice` 결과다. */
export function distanceStartText(priceText: string): string {
  return `최종 진입 ${priceText}`;
}

/** 손절 거리 막대의 끝 표시. `priceText`는 `formatPrice` 결과이거나 `청산 없음`이다. */
export function distanceEndText(priceText: string): string {
  return `청산 ${priceText}`;
}

/** 한도 경고 문구(EC-9). 한도 금액은 `formatPrice(riskLimitValue, 0)`. 경고 기호는 `FieldWarning`이 붙인다. */
export function tierWarningText(riskLimitValue: number): string {
  const limit = formatPrice(riskLimitValue, 0);
  return `포지션 가치가 유지증거금률 첫 단계 한도(${limit} USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`;
}

const EXCLUSION_REASON: Record<Exclude<PyramidExclusion, "empty">, string> = {
  invalidInput: "가격과 재투입 비율(1~100%)을 확인해 주세요.",
  notProfitDirection: "수익 방향으로 진행하는 가격을 입력해 주세요.",
  noProfit: "재투입할 수 있는 수익이 없습니다.",
};

/**
 * 단계 제외 경고 문구(EC-12·EC-13·EC-14). `empty`(EC-16)와 포함 단계는 `null`이다.
 * 경고 기호는 `FieldWarning`이 붙인다.
 */
export function exclusionWarningText(n: number, excluded: PyramidExclusion | null): string | null {
  if (excluded === null || excluded === "empty") return null;
  return `${stepName(n)} 제외: ${EXCLUSION_REASON[excluded]}`;
}

/** 경로 차트의 점 하나. 값은 원값이고 청산가는 틱에 맞춘 값(없으면 null)이다. */
export type PathChartPoint = {
  label: string;
  price: number;
  avgPrice: number;
  liquidation: number | null;
};

/**
 * 경로 행을 차트 점으로 바꾼다(DoD-21·DoD-19·EC-8). 최초 진입과 포함된 단계만 순서대로 남기고
 * 제외된 단계는 점이 없다. 진입가·누적 평단은 원값, 청산가는 `roundLiquidation`(롱 올림, 숏 내림)
 * 값이며 원값이 0 이하이거나 없으면 null이다. 유한하지 않은 진입가·평단의 행은 점을 만들지 않는다.
 */
export function pathChartPoints(
  rows: readonly PyramidRow[],
  side: Side,
  tickSize: number,
): PathChartPoint[] {
  const points: PathChartPoint[] = [];
  rows.forEach((row, index) => {
    if (row.excluded !== null) return;
    if (!isFiniteNumber(row.price) || !isFiniteNumber(row.avgPrice)) return;
    points.push({
      label: index === 0 ? "최초 진입" : stepName(index),
      price: row.price,
      avgPrice: row.avgPrice,
      liquidation: roundLiquidation(row.liquidationPrice, side, tickSize),
    });
  });
  return points;
}

/**
 * 손절가 위치 마커의 위치(%)(DoD-25): 방향 × (마지막 진입가 − 손절가) ÷ |마지막 진입가 − 틱 청산가| × 100을
 * 0~100으로 자른 값. 값이 없거나 거리가 0이거나 유한하지 않으면 null이다.
 */
export function stopMarkerPercent(
  side: Side,
  lastPrice: number | null,
  stopPrice: number | null,
  liquidation: number | null,
): number | null {
  if (!isFiniteNumber(lastPrice) || !isFiniteNumber(stopPrice) || !isFiniteNumber(liquidation)) {
    return null;
  }
  const span = Math.abs(lastPrice - liquidation);
  if (!(span > 0) || !Number.isFinite(span)) return null;
  const s = side === "long" ? 1 : -1;
  const v = ((s * (lastPrice - stopPrice)) / span) * 100;
  if (!Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, v));
}

/**
 * 비교 막대 두 줄의 너비(%). 큰 쪽 절댓값(최소 1)을 100%로 본다. 값이 없으면 0이다.
 */
export function comparisonWidths(
  baseline: number | null,
  pyramid: number | null,
): { baseline: number; pyramid: number } {
  const b = isFiniteNumber(baseline) ? Math.abs(baseline) : 0;
  const p = isFiniteNumber(pyramid) ? Math.abs(pyramid) : 0;
  const max = Math.max(b, p, 1);
  if (!Number.isFinite(max)) return { baseline: 0, pyramid: 0 };
  return { baseline: (b / max) * 100, pyramid: (p / max) * 100 };
}
