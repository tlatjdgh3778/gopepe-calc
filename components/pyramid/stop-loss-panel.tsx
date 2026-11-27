"use client";

import * as React from "react";

import { DecimalField } from "@/components/fields/decimal-field";
import { FieldWarning } from "@/components/fields/field-warning";
import type { Side } from "@/components/fields/side-toggle";
import {
  distanceEndText,
  distanceStartText,
  formatRiskReward,
  stopMarkerPercent,
} from "@/components/pyramid/display";
import { Panel, PanelTag } from "@/components/pyramid/panel";
import { ResultRow } from "@/components/result-row";
import { formatPercent, formatPrice, formatUsdt } from "@/lib/format";
import { distancePercent, formatDistance } from "@/lib/liquidation";

const STOP_NOTE = "표시선은 손절가입니다. 급격한 변동 시 체결가는 달라질 수 있습니다.";

/**
 * `손절` 패널(DoD-25·EC-22·EC-24·EC-25·EC-26·EC-27·EC-34).
 * `liquidation`은 틱에 맞춘 청산가(청산 없음·즉시 청산이면 null), `lastPrice`는 마지막 포함 진입가다.
 * `stopWarning`은 EC-24·EC-25 경고 문구, `stopLossWarning`은 손절가 입력란 경고(EC-22)다.
 */
export function StopLossPanel({
  stopLoss,
  onStopLossChange,
  stopLossWarning,
  stopWarning,
  stopPrice,
  side,
  priceScale,
  margin,
  lastPrice,
  liquidation,
  noLiquidation,
  stopNet,
  takeProfitNet,
}: {
  stopLoss: string;
  onStopLossChange: (value: string) => void;
  stopLossWarning: string | null;
  stopWarning: string | null;
  /** 손절가 숫자(유효한 양수일 때만). */
  stopPrice: number | null;
  side: Side;
  priceScale: number;
  margin: number | null;
  lastPrice: number | null;
  liquidation: number | null;
  noLiquidation: boolean;
  stopNet: number | null;
  takeProfitNet: number | null;
}) {
  const id = React.useId();

  const ratio = stopNet !== null && margin !== null ? (stopNet / margin) * 100 : null;
  // 손절 손익이 음수이고 익절 순수익이 양수일 때만 손익비가 있다(EC-26).
  const rewardRisk =
    stopNet !== null && takeProfitNet !== null && stopNet < 0 && takeProfitNet > 0
      ? takeProfitNet / -stopNet
      : null;
  const marker = stopMarkerPercent(side, lastPrice, stopPrice, liquidation);

  return (
    <Panel title="손절" aside={<PanelTag>STOP LOSS</PanelTag>}>
      <DecimalField
        label="손절가"
        value={stopLoss}
        onChange={onStopLossChange}
        warning={stopLossWarning}
      />

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm [&>dd:first-of-type]:text-xl [&>dd:first-of-type]:font-semibold">
        <ResultRow label="손절 시 예상 손익" value={formatUsdt(stopNet, { signed: true })} toned />
        <ResultRow label="원금 대비" value={formatPercent(ratio)} toned />
        <ResultRow label="손익비" value={formatRiskReward(rewardRisk)} />
        <ResultRow
          label="청산가까지 거리"
          value={formatDistance(distancePercent(liquidation, lastPrice))}
        />
      </dl>

      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <div className="relative h-2 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-chart-1/40 to-loss/60"
            style={{ width: `${marker ?? 0}%` }}
          />
          {marker === null ? null : (
            <span
              data-slot="stop-marker"
              aria-hidden="true"
              className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-foreground"
              style={{ left: `${marker}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{distanceStartText(formatPrice(lastPrice, priceScale))}</span>
          <span>
            {distanceEndText(noLiquidation ? "청산 없음" : formatPrice(liquidation, priceScale))}
          </span>
        </div>
      </div>

      {stopWarning ? (
        <FieldWarning id={`${id}-stop-warning`}>{stopWarning}</FieldWarning>
      ) : (
        <p className="text-xs text-muted-foreground">
          <span aria-hidden="true">ⓘ </span>
          {STOP_NOTE}
        </p>
      )}
    </Panel>
  );
}
