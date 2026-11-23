"use client";

import * as React from "react";

import { CalculatorLayout, ResultRow } from "@/components/calculator-layout";
import { DecimalField } from "@/components/fields/decimal-field";
import { FieldWarning } from "@/components/fields/field-warning";
import { LeverageField } from "@/components/fields/leverage-field";
import { SideToggle, type Side } from "@/components/fields/side-toggle";
import { SymbolSelect } from "@/components/fields/symbol-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCoinQty, formatPrice } from "@/lib/format";
import { isPositive, toNumber } from "@/lib/input";
import {
  distancePercent,
  exceedsFirstTier,
  formatDistance,
  isolatedCollateral,
  isStopBeforeLiquidation,
  liquidationPrice,
  roundLiquidation,
  type MarginMode,
} from "@/lib/liquidation";
import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";
import { checkQty } from "@/lib/validation";

const NO_LIQUIDATION = "청산 없음";
const CROSS_LEVERAGE_NOTE = "교차에서는 레버리지가 청산가에 영향을 주지 않습니다.";
const STOP_WARNING = "손절 전에 청산됩니다.";
const INSTANT_WARNING = "진입 즉시 청산되는 포지션입니다.";
const DISCLAIMER =
  "추정치입니다. 유지증거금률 첫 단계만 쓰고 수수료·유지증거금 공제액·마크가격·펀딩을 반영하지 않습니다. 교차는 계좌에 이 포지션 하나만 있다고 가정합니다. 거래소 표시값과 다를 수 있습니다.";

/** 한도 경고 문구(DoD-26). 한도 금액은 천 단위 구분 정수다. `⚠`는 `FieldWarning`이 붙인다. */
function tierWarningOf(symbolInfo: SymbolInfo): string {
  const limit = formatPrice(symbolInfo.maintenanceTier.riskLimitValue, 0);
  return `포지션 가치가 유지증거금률 첫 단계 한도(${limit} USDT)를 넘습니다. 실제 청산가는 진입가에 더 가까울 수 있습니다.`;
}

/**
 * 수량 경고 문구(F-7 DoD-11·DoD-12·EC-1, `components/pnl-calculator.tsx` 코인 분기와 같은 문구).
 * 수량은 기초 코인 단위만 받는다. `⚠`는 `FieldWarning`이 붙인다.
 */
function qtyWarningOf(check: ReturnType<typeof checkQty>, symbolInfo: SymbolInfo): string | null {
  const { baseCoin, minOrderQty, qtyStep } = symbolInfo;
  if (check === "belowMin") {
    return `최소 주문 수량은 ${formatCoinQty(minOrderQty, qtyStep)} ${baseCoin}입니다.`;
  }
  if (check === "notStepMultiple") {
    return `수량 단위는 ${formatCoinQty(qtyStep, qtyStep)} ${baseCoin}입니다.`;
  }
  return null;
}

export function LiquidationCalculator() {
  const id = React.useId();
  const modeId = `${id}-mode`;
  const instantWarningId = `${id}-instant-warning`;
  const tierWarningId = `${id}-tier-warning`;

  const [symbol, setSymbol] = React.useState<SymbolInfo["symbol"]>("BTCUSDT");
  const [side, setSide] = React.useState<Side>("long");
  const [leverage, setLeverage] = React.useState("10");
  const [mode, setMode] = React.useState<MarginMode>("isolated");
  const [entryPrice, setEntryPrice] = React.useState("");
  const [qty, setQty] = React.useState("");
  // 격리에서도 값을 유지하고 입력란만 숨긴다(EC-10).
  const [balance, setBalance] = React.useState("");
  const [stopPrice, setStopPrice] = React.useState("");

  const symbolInfo = SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0];
  const { tickSize, priceScale, maintenanceTier } = symbolInfo;
  const entry = toNumber(entryPrice);
  const qtyInput = toNumber(qty);
  const stop = toNumber(stopPrice);

  // 담보: 격리는 개시증거금(DoD-12, EC-1), 교차는 계좌 잔고이고 레버리지를 쓰지 않는다(DoD-13·DoD-14, EC-2).
  const collateral =
    mode === "isolated"
      ? isolatedCollateral(entry, qtyInput, toNumber(leverage))
      : toNumber(balance);

  const raw = liquidationPrice({
    side,
    entryPrice: entry,
    qty: qtyInput,
    collateral,
    mmr: maintenanceTier.mmr,
  });
  // 롱 원값이 0 이하이면 `청산 없음`이고 거리는 `—`다(EC-4·EC-5).
  const noLiquidation = side === "long" && raw !== null && raw <= 0;
  const liq = noLiquidation ? null : roundLiquidation(raw, side, tickSize);

  const liqText = noLiquidation ? NO_LIQUIDATION : formatPrice(liq, priceScale);
  const distanceText = formatDistance(distancePercent(liq, entry));

  // 틱에 맞춘 청산가가 진입가를 넘어서면 즉시 청산 경고(EC-7).
  const instantLiquidation =
    liq !== null && entry !== null && (side === "long" ? liq >= entry : liq <= entry);
  // 한도 경고는 진입가·수량만으로 판정한다(DoD-26, EC-12·EC-15).
  const overTier = exceedsFirstTier(entry, qtyInput, maintenanceTier.riskLimitValue);

  // 수량 원문이 양수일 때만 판정한다(EC-14).
  const qtyWarning = isPositive(qtyInput)
    ? qtyWarningOf(checkQty(qtyInput, symbolInfo), symbolInfo)
    : null;
  // 손절가가 양수이고 표시 청산가가 있을 때만 판정한다(DoD-24, EC-3·EC-6·EC-9).
  const stopWarning =
    isPositive(stop) && liq !== null && isStopBeforeLiquidation(side, stop, liq)
      ? STOP_WARNING
      : null;

  return (
    <div className="flex flex-col gap-4">
      <CalculatorLayout
        name="청산가"
        inputs={
          <>
            <SymbolSelect value={symbol} onChange={setSymbol} />

            <SideToggle value={side} onChange={setSide} />

            <div className="flex flex-col gap-2">
              <LeverageField value={leverage} onChange={setLeverage} symbol={symbolInfo} />
              {mode === "cross" ? (
                <p className="text-sm text-muted-foreground">{CROSS_LEVERAGE_NOTE}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <span id={modeId} className="text-sm leading-none font-medium select-none">
                마진 모드
              </span>
              <ToggleGroup
                aria-labelledby={modeId}
                variant="outline"
                value={[mode]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === "isolated" || next === "cross") setMode(next);
                }}
              >
                <ToggleGroupItem value="isolated">격리</ToggleGroupItem>
                <ToggleGroupItem value="cross">교차</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <DecimalField label="진입가" value={entryPrice} onChange={setEntryPrice} />

            <DecimalField label="수량" value={qty} onChange={setQty} warning={qtyWarning} />

            {mode === "cross" ? (
              <DecimalField label="계좌 잔고" value={balance} onChange={setBalance} />
            ) : null}

            <DecimalField
              label="손절가"
              value={stopPrice}
              onChange={setStopPrice}
              warning={stopWarning}
            />
          </>
        }
        results={
          <>
            <ResultRow label="추정 청산가" value={liqText} />
            {instantLiquidation ? (
              <dd className="col-span-2">
                <FieldWarning id={instantWarningId}>{INSTANT_WARNING}</FieldWarning>
              </dd>
            ) : null}
            {overTier ? (
              <dd className="col-span-2">
                <FieldWarning id={tierWarningId}>{tierWarningOf(symbolInfo)}</FieldWarning>
              </dd>
            ) : null}
            <ResultRow label="청산가까지 거리" value={distanceText} />
          </>
        }
      />
      <p className="text-sm text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
