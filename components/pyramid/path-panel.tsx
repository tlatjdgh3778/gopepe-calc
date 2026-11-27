"use client";

import type { Side } from "@/components/fields/side-toggle";
import {
  EMPTY,
  formatReinvest,
  pathChartPoints,
  stepName,
  withCoin,
} from "@/components/pyramid/display";
import { Panel } from "@/components/pyramid/panel";
import { PathChart } from "@/components/pyramid/path-chart";
import { TONE_CLASS, toneOf } from "@/components/result-row";
import { formatCoinQty, formatPrice, formatUsdt } from "@/lib/format";
import { roundLiquidation } from "@/lib/liquidation";
import type { PyramidRow } from "@/lib/pyramid";
import type { SymbolInfo } from "@/lib/symbols";
import { cn } from "@/lib/utils";

const COLUMNS = [
  "진입 단계",
  "진입가",
  "재투입",
  "시점 수익",
  "투입 증거금",
  "추가 수량",
  "누적 평단",
  "청산가",
] as const;

const NO_LIQUIDATION = "청산 없음";

/** 경로 행의 청산가 칸(DoD-19·EC-8): 원값이 0 이하이면 `청산 없음`, 아니면 틱 값. */
function liquidationCell(row: PyramidRow, side: Side, symbolInfo: SymbolInfo): string {
  if (row.liquidationPrice !== null && row.liquidationPrice <= 0) return NO_LIQUIDATION;
  return formatPrice(
    roundLiquidation(row.liquidationPrice, side, symbolInfo.tickSize),
    symbolInfo.priceScale,
  );
}

/**
 * `포지션 경로` 패널(DoD-20·DoD-21·EC-30·EC-35). `rows`가 null이면 표 본문과 차트가 없다.
 * `stepIds`는 단계 순서대로의 단계 id이고 행 key로 쓴다.
 */
export function PathPanel({
  rows,
  stepIds,
  side,
  symbolInfo,
}: {
  rows: readonly PyramidRow[] | null;
  stepIds: readonly number[];
  side: Side;
  symbolInfo: SymbolInfo;
}) {
  const { priceScale, qtyStep, baseCoin, tickSize } = symbolInfo;
  const points = rows === null ? [] : pathChartPoints(rows, side, tickSize);

  return (
    <Panel title="포지션 경로">
      <p className="-mt-2 text-xs text-muted-foreground">
        추가 진입할수록 평단과 청산가도 함께 이동합니다.
      </p>

      {points.length > 0 ? <PathChart points={points} priceScale={priceScale} /> : null}

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b bg-muted px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground first:text-left"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.map((row, index) => {
              const key = index === 0 ? "initial" : `step-${stepIds[index - 1] ?? index}`;
              const cellClass = "border-b px-2 py-2 text-right whitespace-nowrap";

              if (index === 0) {
                return (
                  <tr key={key}>
                    <th scope="row" className={cn(cellClass, "text-left font-medium")}>
                      최초 진입
                    </th>
                    <td className={cellClass}>{formatPrice(row.price, priceScale)}</td>
                    <td className={cellClass}>{EMPTY}</td>
                    <td className={cellClass}>{EMPTY}</td>
                    <td className={cellClass}>{formatUsdt(row.marginUsed)}</td>
                    <td className={cellClass}>
                      {withCoin(formatCoinQty(row.addedQty, qtyStep), baseCoin)}
                    </td>
                    <td className={cellClass}>{formatPrice(row.avgPrice, priceScale)}</td>
                    <td className={cellClass}>{liquidationCell(row, side, symbolInfo)}</td>
                  </tr>
                );
              }

              const name = stepName(index);
              if (row.excluded !== null) {
                return (
                  <tr key={key} data-excluded={row.excluded} className="text-muted-foreground">
                    <th scope="row" className={cn(cellClass, "text-left font-medium")}>
                      <span>{name}</span>{" "}
                      <span className="rounded border border-input px-1 text-[11px]">제외</span>
                    </th>
                    <td className={cellClass}>{formatPrice(row.price, priceScale)}</td>
                    <td className={cellClass}>{formatReinvest(row.reinvestPercent)}</td>
                    <td className={cellClass}>{EMPTY}</td>
                    <td className={cellClass}>{EMPTY}</td>
                    <td className={cellClass}>{EMPTY}</td>
                    <td className={cellClass}>{EMPTY}</td>
                    <td className={cellClass}>{EMPTY}</td>
                  </tr>
                );
              }

              const pnlText = formatUsdt(row.pnlAtStep, { signed: true });
              const tone = toneOf(pnlText);
              return (
                <tr key={key}>
                  <th scope="row" className={cn(cellClass, "text-left font-medium")}>
                    {name}
                  </th>
                  <td className={cellClass}>{formatPrice(row.price, priceScale)}</td>
                  <td className={cellClass}>{formatReinvest(row.reinvestPercent)}</td>
                  <td data-tone={tone} className={cn(cellClass, TONE_CLASS[tone])}>
                    {pnlText}
                  </td>
                  <td className={cellClass}>{formatUsdt(row.marginUsed)}</td>
                  <td className={cellClass}>
                    {withCoin(formatCoinQty(row.addedQty, qtyStep), baseCoin)}
                  </td>
                  <td className={cellClass}>{formatPrice(row.avgPrice, priceScale)}</td>
                  <td className={cellClass}>{liquidationCell(row, side, symbolInfo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
