"use client";

import * as React from "react";

import { CalculatorLayout, ResultRow } from "@/components/calculator-layout";
import { DecimalField } from "@/components/fields/decimal-field";
import { LeverageField } from "@/components/fields/leverage-field";
import { SideToggle, type Side } from "@/components/fields/side-toggle";
import { SymbolSelect } from "@/components/fields/symbol-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isPositive, toNumber } from "@/lib/input";
import {
  formatCoinQty,
  formatPercent,
  formatQtyInput,
  formatUsdt,
  roundToStep,
} from "@/lib/format";
import { calculatePnl, qtyFromValue } from "@/lib/pnl";
import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";
import { checkQty } from "@/lib/validation";

type QtyUnit = "coin" | "usdt";

/** USDT 금액을 코인 수량으로 환산하고 `qtyStep` 기준으로 내린다(F-7 DoD-14·DoD-15). 환산할 수 없으면 null이다. */
function coinQtyFromValue(
  valueUsdt: number | null,
  entryPrice: number | null,
  symbolInfo: SymbolInfo,
): number | null {
  return roundToStep(qtyFromValue(valueUsdt, entryPrice), symbolInfo.qtyStep, "down");
}

/**
 * 수량 경고 문구(F-7 DoD-11·DoD-12·EC-1). `⚠`는 `FieldWarning`이 붙인다.
 * `notStepMultiple`(W3)은 코인 모드에서만 표시한다.
 */
function qtyWarningOf(
  check: ReturnType<typeof checkQty>,
  unit: QtyUnit,
  symbolInfo: SymbolInfo,
): string | null {
  const { baseCoin, minOrderQty, qtyStep } = symbolInfo;
  if (check === "belowMin") {
    return `최소 주문 수량은 ${formatCoinQty(minOrderQty, qtyStep)} ${baseCoin}입니다.`;
  }
  if (check === "notStepMultiple" && unit === "coin") {
    return `수량 단위는 ${formatCoinQty(qtyStep, qtyStep)} ${baseCoin}입니다.`;
  }
  return null;
}

export function PnlCalculator() {
  const unitId = `${React.useId()}-unit`;

  const [symbol, setSymbol] = React.useState<SymbolInfo["symbol"]>("BTCUSDT");
  const [side, setSide] = React.useState<Side>("long");
  const [leverage, setLeverage] = React.useState("10");
  const [entryPrice, setEntryPrice] = React.useState("");
  const [exitPrice, setExitPrice] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState<QtyUnit>("coin");

  const symbolInfo = SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0];
  const entry = toNumber(entryPrice);
  const qtyInput = toNumber(qty);
  // USDT 모드의 참고 수량 표시와 계산은 같은 내린 수량을 쓴다(DoD-14·DoD-15).
  const coinQty = unit === "coin" ? qtyInput : coinQtyFromValue(qtyInput, entry, symbolInfo);

  // 입력 원문이 양수일 때만 판정한다(EC-4). 심볼·단위·진입가가 바뀌면 렌더 때 다시 판정된다(EC-2·EC-3).
  const qtyWarning = isPositive(qtyInput)
    ? qtyWarningOf(checkQty(coinQty, symbolInfo), unit, symbolInfo)
    : null;

  const result = calculatePnl({
    side,
    leverage: leverage === "" ? 0 : Number(leverage),
    entryPrice: entry,
    exitPrice: toNumber(exitPrice),
    qty: coinQty,
  });

  const marginText = formatUsdt(result.initialMargin, { decimals: symbolInfo.marginDecimals });
  const pnlText = formatUsdt(result.pnl, { signed: true, decimals: 4 });
  const roeText = formatPercent(result.roe);

  function changeUnit(next: QtyUnit) {
    if (next === unit) return;
    let converted: number | null = null;
    // 진입가가 비어 있거나 `.`·0이면 환산할 수 없어 입력란을 비운다 (F-1 EC-11).
    if (isPositive(entry) && qtyInput !== null) {
      if (next === "usdt") {
        converted = qtyInput * entry;
      } else {
        // 내린 환산 수량으로 채운다(DoD-16). 0이면 `0`이다(EC-9).
        converted = qtyInput === 0 ? 0 : coinQtyFromValue(qtyInput, entry, symbolInfo);
      }
    }
    setQty(formatQtyInput(converted));
    setUnit(next);
  }

  return (
    <CalculatorLayout
      name="손익"
      inputs={
        <>
          <SymbolSelect value={symbol} onChange={setSymbol} />

          <SideToggle value={side} onChange={setSide} />

          <LeverageField value={leverage} onChange={setLeverage} symbol={symbolInfo} />

          <DecimalField label="진입가" value={entryPrice} onChange={setEntryPrice} />

          <DecimalField label="종료가" value={exitPrice} onChange={setExitPrice} />

          <div className="flex flex-col gap-2">
            <span id={unitId} className="text-sm leading-none font-medium select-none">
              수량 단위
            </span>
            <ToggleGroup
              aria-labelledby={unitId}
              variant="outline"
              value={[unit]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === "coin" || next === "usdt") changeUnit(next);
              }}
            >
              <ToggleGroupItem value="coin">코인</ToggleGroupItem>
              <ToggleGroupItem value="usdt">USDT</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <DecimalField label="수량" value={qty} onChange={setQty} warning={qtyWarning}>
            {unit === "usdt" ? (
              <p className="text-sm text-muted-foreground">{`≈ ${formatCoinQty(coinQty, symbolInfo.qtyStep)} ${symbolInfo.baseCoin}`}</p>
            ) : null}
          </DecimalField>
        </>
      }
      results={
        <>
          <ResultRow label="필요 증거금" value={marginText} />
          <ResultRow label="손익" value={pnlText} toned />
          <ResultRow label="ROE" value={roeText} toned />
        </>
      }
    />
  );
}
