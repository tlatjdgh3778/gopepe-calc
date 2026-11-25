"use client";

import * as React from "react";

import { CalculatorLayout, ResultRow } from "@/components/calculator-layout";
import { DecimalField } from "@/components/fields/decimal-field";
import { FieldWarning } from "@/components/fields/field-warning";
import { LeverageField } from "@/components/fields/leverage-field";
import { SymbolSelect } from "@/components/fields/symbol-select";
import { formatCoinQty, formatPrice, formatUsdt } from "@/lib/format";
import { toNumber } from "@/lib/input";
import { exceedsFirstTier } from "@/lib/liquidation";
import { maxQuantity } from "@/lib/max-quantity";
import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";

const FEE_NOTE = "수수료를 빼지 않은 값이라 실제 주문 가능 수량은 더 작을 수 있습니다.";

/** 한도 경고 문구(DoD-9). 한도 금액은 천 단위 구분 정수다. `⚠`는 `FieldWarning`이 붙인다. */
function tierWarningOf(symbolInfo: SymbolInfo): string {
  const limit = formatPrice(symbolInfo.maintenanceTier.riskLimitValue, 0);
  return `포지션 가치가 유지증거금률 첫 단계 한도(${limit} USDT)를 넘습니다. 실제 최대 수량은 더 작을 수 있습니다.`;
}

/** 최소 수량 미달 문구(EC-6). `⚠`는 `FieldWarning`이 붙인다. */
function minQtyWarningOf(symbolInfo: SymbolInfo): string {
  const { baseCoin, minOrderQty, qtyStep } = symbolInfo;
  return `최소 주문 수량은 ${formatCoinQty(minOrderQty, qtyStep)} ${baseCoin}입니다.`;
}

export function MaxQuantityCalculator() {
  const id = React.useId();
  const minQtyWarningId = `${id}-min-qty-warning`;
  const tierWarningId = `${id}-tier-warning`;

  const [symbol, setSymbol] = React.useState<SymbolInfo["symbol"]>("BTCUSDT");
  const [leverage, setLeverage] = React.useState("10");
  const [entryPrice, setEntryPrice] = React.useState("");
  const [balance, setBalance] = React.useState("");

  const symbolInfo = SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0];
  const { qtyStep, minOrderQty, baseCoin, maintenanceTier } = symbolInfo;
  const entry = toNumber(entryPrice);

  const result = maxQuantity({
    balance: toNumber(balance),
    leverage: toNumber(leverage),
    entryPrice: entry,
    qtyStep,
    minOrderQty,
  });

  // 수량이 없으면 단위를 붙이지 않는다(EC-2·EC-3·EC-5).
  const qtyDigits = formatCoinQty(result.qty, qtyStep);
  const qtyText = result.qty === null ? qtyDigits : `${qtyDigits} ${baseCoin}`;
  const valueText = formatUsdt(result.positionValue);

  // 한도 경고는 계산된 수량이 있을 때만 판정한다(DoD-9, EC-7).
  const overTier =
    result.qty !== null && exceedsFirstTier(entry, result.qty, maintenanceTier.riskLimitValue);

  return (
    <div className="flex flex-col gap-4">
      <CalculatorLayout
        name="최대 수량"
        inputs={
          <>
            <SymbolSelect value={symbol} onChange={setSymbol} />

            <LeverageField value={leverage} onChange={setLeverage} symbol={symbolInfo} />

            <DecimalField label="진입가" value={entryPrice} onChange={setEntryPrice} />

            <DecimalField label="사용 가능 잔고" value={balance} onChange={setBalance} />
          </>
        }
        results={
          <>
            <ResultRow label="최대 수량" value={qtyText} />
            {result.belowMin ? (
              <dd className="col-span-2">
                <FieldWarning id={minQtyWarningId}>{minQtyWarningOf(symbolInfo)}</FieldWarning>
              </dd>
            ) : null}
            {overTier ? (
              <dd className="col-span-2">
                <FieldWarning id={tierWarningId}>{tierWarningOf(symbolInfo)}</FieldWarning>
              </dd>
            ) : null}
            <ResultRow label="포지션 가치" value={valueText} />
          </>
        }
      />
      <p className="text-sm text-muted-foreground">{FEE_NOTE}</p>
    </div>
  );
}
