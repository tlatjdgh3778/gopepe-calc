"use client";

import * as React from "react";

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

/** 경로 표 열 순서(DoD-20). */
const COLUMNS = [
  "진입 단계",
  "진입가",
  "누적 평단",
  "청산가",
  "재투입",
  "시점 수익",
  "투입 증거금",
  "추가 수량",
] as const;

const NO_LIQUIDATION = "청산 없음";

const CELL = "border-b px-2 py-2 text-right whitespace-nowrap";
/** 첫 열(진입 단계)은 가로 스크롤해도 왼쪽에 고정하고, 뒤 칸이 비치지 않게 배경을 채운다(DoD-47). */
const STICKY = "sticky left-0 z-10 text-left font-medium";

/** 경로 행의 청산가 칸(DoD-19·EC-8): 원값이 0 이하이면 `청산 없음`, 아니면 틱 값. */
function liquidationCell(row: PyramidRow, side: Side, symbolInfo: SymbolInfo): string {
  if (row.liquidationPrice !== null && row.liquidationPrice <= 0) return NO_LIQUIDATION;
  return formatPrice(
    roundLiquidation(row.liquidationPrice, side, symbolInfo.tickSize),
    symbolInfo.priceScale,
  );
}

/**
 * 가로 스크롤 영역의 오른쪽에 더 볼 내용이 남았는지 추적한다(DoD-47).
 * 스크롤·크기 변화·내용 변화 때 다시 판정한다. 측정할 수 없는 환경(크기 0)에서는 false다.
 */
function useCanScrollRight(
  deps: unknown,
): [React.RefObject<HTMLDivElement | null>, boolean, () => void] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (el === null) return;
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    measure();
    const el = ref.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // 내용(표) 폭이 바뀌어도 다시 판정한다.
    if (el.firstElementChild !== null) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure, deps]);

  return [ref, canScrollRight, measure];
}

/**
 * `포지션 경로` 패널(DoD-20·DoD-21·DoD-47·EC-30·EC-35). `rows`가 null이면 표 본문과 차트가 없다.
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
  const [scrollRef, canScrollRight, measure] = useCanScrollRight(rows);

  return (
    <Panel title="포지션 경로">
      <p className="-mt-2 text-xs text-pretty text-muted-foreground">
        추가 진입할수록 평단과 청산가도 함께 이동합니다.
      </p>

      {points.length > 0 ? <PathChart points={points} priceScale={priceScale} /> : null}

      <div className="relative min-w-0">
        <div ref={scrollRef} onScroll={measure} className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs tabular-nums">
            <thead>
              <tr>
                {COLUMNS.map((column, columnIndex) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn(
                      "border-b bg-muted px-2 py-2 text-right font-medium whitespace-nowrap text-muted-foreground",
                      columnIndex === 0 && STICKY,
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, index) => {
                const key = index === 0 ? "initial" : `step-${stepIds[index - 1] ?? index}`;

                if (index === 0) {
                  return (
                    <tr key={key}>
                      <th scope="row" className={cn(CELL, STICKY, "bg-card")}>
                        최초 진입
                      </th>
                      <td className={CELL}>{formatPrice(row.price, priceScale)}</td>
                      <td className={CELL}>{formatPrice(row.avgPrice, priceScale)}</td>
                      <td className={CELL}>{liquidationCell(row, side, symbolInfo)}</td>
                      <td className={CELL}>{EMPTY}</td>
                      <td className={CELL}>{EMPTY}</td>
                      <td className={CELL}>{formatUsdt(row.marginUsed)}</td>
                      <td className={CELL}>
                        {withCoin(formatCoinQty(row.addedQty, qtyStep), baseCoin)}
                      </td>
                    </tr>
                  );
                }

                const name = stepName(index);
                if (row.excluded !== null) {
                  return (
                    <tr key={key} data-excluded={row.excluded} className="text-muted-foreground">
                      <th scope="row" className={cn(CELL, STICKY, "bg-card")}>
                        <span>{name}</span>{" "}
                        <span className="rounded border border-input px-1 text-[11px]">제외</span>
                      </th>
                      <td className={CELL}>{formatPrice(row.price, priceScale)}</td>
                      <td className={CELL}>{EMPTY}</td>
                      <td className={CELL}>{EMPTY}</td>
                      <td className={CELL}>{formatReinvest(row.reinvestPercent)}</td>
                      <td className={CELL}>{EMPTY}</td>
                      <td className={CELL}>{EMPTY}</td>
                      <td className={CELL}>{EMPTY}</td>
                    </tr>
                  );
                }

                const pnlText = formatUsdt(row.pnlAtStep, { signed: true });
                const tone = toneOf(pnlText);
                return (
                  <tr key={key}>
                    <th scope="row" className={cn(CELL, STICKY, "bg-card")}>
                      {name}
                    </th>
                    <td className={CELL}>{formatPrice(row.price, priceScale)}</td>
                    <td className={CELL}>{formatPrice(row.avgPrice, priceScale)}</td>
                    <td className={CELL}>{liquidationCell(row, side, symbolInfo)}</td>
                    <td className={CELL}>{formatReinvest(row.reinvestPercent)}</td>
                    <td data-tone={tone} className={cn(CELL, TONE_CLASS[tone])}>
                      {pnlText}
                    </td>
                    <td className={CELL}>{formatUsdt(row.marginUsed)}</td>
                    <td className={CELL}>
                      {withCoin(formatCoinQty(row.addedQty, qtyStep), baseCoin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* 오른쪽에 더 볼 열이 남아 있는 동안만 보이는 페이드 단서(DoD-47). 끝까지 스크롤하면 숨긴다. */}
        <div
          aria-hidden="true"
          data-slot="scroll-fade"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-card to-transparent",
            canScrollRight ? "visible opacity-100" : "invisible opacity-0",
          )}
        />
      </div>
    </Panel>
  );
}
