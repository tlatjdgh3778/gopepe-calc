"use client";

import * as React from "react";

import { CalculatorLayout, ResultRow } from "@/components/calculator-layout";
import { DecimalField } from "@/components/fields/decimal-field";
import { LeverageField } from "@/components/fields/leverage-field";
import { SideToggle, type Side } from "@/components/fields/side-toggle";
import { SignedDecimalField } from "@/components/fields/signed-decimal-field";
import { SymbolSelect } from "@/components/fields/symbol-select";
import { formatPercent, formatPrice } from "@/lib/format";
import { toNumber } from "@/lib/input";
import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";
import { calculateTargetPrice, checkTargetRoe } from "@/lib/target-price";

/**
 * 목표 ROE 경고 문구(F-2 EC-7·EC-8·EC-9). `⚠`는 `FieldWarning`이 붙인다.
 * 둘 다 해당하는 경우의 우선순위(EC-9)는 `checkTargetRoe`가 정한다.
 */
function targetRoeWarningOf(check: ReturnType<typeof checkTargetRoe>): string | null {
  if (check === "noPrice") return "이 ROE에 해당하는 가격이 없습니다.";
  if (check === "beyondMargin") return "증거금 이상 손실 — 이 가격 전에 청산됩니다.";
  return null;
}

export function TargetPriceCalculator() {
  const [symbol, setSymbol] = React.useState<SymbolInfo["symbol"]>("BTCUSDT");
  const [side, setSide] = React.useState<Side>("long");
  const [leverage, setLeverage] = React.useState("10");
  const [entryPrice, setEntryPrice] = React.useState("");
  const [targetRoe, setTargetRoe] = React.useState("");

  const symbolInfo = SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0];

  // 입력 원문에서 렌더 때 계산한다. 심볼·방향·입력이 바뀌면 다시 계산·판정된다(EC-10·EC-11·EC-12).
  const input = {
    side,
    leverage: leverage === "" ? 0 : Number(leverage),
    entryPrice: toNumber(entryPrice),
    targetRoe: toNumber(targetRoe),
    tickSize: symbolInfo.tickSize,
  };
  const result = calculateTargetPrice(input);
  const targetRoeWarning = targetRoeWarningOf(checkTargetRoe(input));

  const targetPriceText = formatPrice(result.targetPrice, symbolInfo.priceScale);
  const priceChangeText = formatPercent(result.priceChangePercent);

  return (
    <CalculatorLayout
      name="목표가"
      inputs={
        <>
          <SymbolSelect value={symbol} onChange={setSymbol} />

          <SideToggle value={side} onChange={setSide} />

          <LeverageField value={leverage} onChange={setLeverage} symbol={symbolInfo} />

          <DecimalField label="진입가" value={entryPrice} onChange={setEntryPrice} />

          <SignedDecimalField
            label="목표 ROE"
            value={targetRoe}
            onChange={setTargetRoe}
            warning={targetRoeWarning}
          />
        </>
      }
      results={
        <>
          <ResultRow label="목표가" value={targetPriceText} />
          <ResultRow label="가격 변동률" value={priceChangeText} />
        </>
      }
    />
  );
}
