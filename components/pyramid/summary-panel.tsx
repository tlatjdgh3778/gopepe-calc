"use client";

import * as React from "react";

import type { Side } from "@/components/fields/side-toggle";
import { FieldWarning } from "@/components/fields/field-warning";
import {
  avgShiftText,
  formatLeverage,
  leverageChangeText,
  riskNoticeText,
  tierWarningText,
  withCoin,
} from "@/components/pyramid/display";
import { INNER_CARD_RADIUS, Panel } from "@/components/pyramid/panel";
import { ResultRow } from "@/components/result-row";
import { formatCoinQty, formatPercent, formatPrice, formatUsdt } from "@/lib/format";
import { exceedsFirstTier, formatDistance } from "@/lib/liquidation";
import type { PyramidResult } from "@/lib/pyramid";
import type { SymbolInfo } from "@/lib/symbols";
import { cn } from "@/lib/utils";

const INSTANT_WARNING = "진입 즉시 청산되는 포지션입니다.";

/** 포지션 요약의 큰 지표 하나(이름·값·보조 문구). */
function Metric({ label, value, sub }: { label: string; value: string; sub: string | null }) {
  return (
    <div
      className={cn(
        INNER_CARD_RADIUS,
        "flex min-w-0 flex-col gap-1 border border-input bg-muted p-3 [&>dd]:text-left [&>dd:first-of-type]:text-xl [&>dd:first-of-type]:font-semibold",
      )}
    >
      <ResultRow label={label} value={value} />
      {sub === null ? null : <dd className="text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/**
 * `포지션 요약` 패널(DoD-17·DoD-26·EC-8·EC-9·EC-29·EC-34).
 * `liquidation`은 틱에 맞춘 청산가이고, 원값이 0 이하이면 `noLiquidation`, 담보가 0 이하이면 `instantLiquidation`이다.
 */
export function SummaryPanel({
  result,
  side,
  entryPrice,
  margin,
  leverage,
  symbolInfo,
  liquidation,
  noLiquidation,
  instantLiquidation,
}: {
  result: PyramidResult | null;
  side: Side;
  entryPrice: number | null;
  margin: number | null;
  leverage: number | null;
  symbolInfo: SymbolInfo;
  liquidation: number | null;
  noLiquidation: boolean;
  instantLiquidation: boolean;
}) {
  const id = React.useId();
  const { priceScale, qtyStep, baseCoin, maintenanceTier } = symbolInfo;
  const s = side === "long" ? 1 : -1;

  const avgShift =
    result !== null && entryPrice !== null ? (result.avgPrice / entryPrice - 1) * 100 : null;
  const liqText = noLiquidation ? "청산 없음" : formatPrice(liquidation, priceScale);

  const overTier =
    result !== null &&
    exceedsFirstTier(result.lastPrice, result.totalQty, maintenanceTier.riskLimitValue);

  // 포함된 추가 진입이 1개 이상이고 마지막 포함 진입가가 본전가보다 수익 쪽일 때만(EC-29).
  const hasIncludedStep = result !== null && result.rows.slice(1).some((r) => r.excluded === null);
  const showRisk =
    result !== null && hasIncludedStep && s * (result.lastPrice - result.breakEvenPrice) > 0;
  const riskDistance =
    result !== null
      ? (Math.abs(result.lastPrice - result.breakEvenPrice) / result.lastPrice) * 100
      : null;

  return (
    <Panel title="포지션 요약">
      <dl className="grid min-w-0 gap-3 min-[480px]:grid-cols-3">
        <Metric
          label="평균 진입가"
          value={formatPrice(result?.avgPrice ?? null, priceScale)}
          sub={result === null ? null : avgShiftText(formatPercent(avgShift))}
        />
        <Metric label="추정 청산가" value={liqText} sub={null} />
        <Metric
          label="실효 레버리지"
          value={formatLeverage(result?.effectiveLeverage ?? null)}
          sub={
            result === null || leverage === null
              ? null
              : leverageChangeText(leverage, result.effectiveLeverage)
          }
        />
      </dl>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <ResultRow
          label="총 포지션 수량"
          value={withCoin(formatCoinQty(result?.totalQty ?? null, qtyStep), baseCoin)}
        />
        <ResultRow
          label="최종 진입 시 포지션 가치"
          value={formatUsdt(result?.finalNotional ?? null)}
        />
        <ResultRow label="실제 투입 원금" value={formatUsdt(result === null ? null : margin)} />
        <ResultRow label="미실현 수익 포함 총 자산" value={formatUsdt(result?.equity ?? null)} />
        <ResultRow
          label="수수료 포함 본전가"
          value={formatPrice(result?.breakEvenPrice ?? null, priceScale)}
        />
        <ResultRow label="누적 진입 수수료" value={formatUsdt(result?.entryFees ?? null)} />
      </dl>

      {instantLiquidation ? (
        <FieldWarning id={`${id}-instant-warning`}>{INSTANT_WARNING}</FieldWarning>
      ) : null}
      {overTier ? (
        <FieldWarning id={`${id}-tier-warning`}>
          {tierWarningText(maintenanceTier.riskLimitValue)}
        </FieldWarning>
      ) : null}

      {showRisk ? (
        <div
          className={cn(
            INNER_CARD_RADIUS,
            "flex flex-col gap-1 border border-warning-border bg-warning p-3 text-sm text-warning-foreground",
          )}
        >
          <strong className="font-semibold">수익으로 키운 포지션도, 내 원금의 리스크입니다.</strong>
          <p className="text-pretty text-warning-muted-foreground">
            {riskNoticeText(formatDistance(riskDistance))}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
