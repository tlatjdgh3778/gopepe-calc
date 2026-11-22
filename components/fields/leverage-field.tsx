"use client";

import * as React from "react";

import { FieldWarning } from "@/components/fields/field-warning";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { filtered, isPositive, LEVERAGE_PATTERN, toNumber } from "@/lib/input";
import type { SymbolInfo } from "@/lib/symbols";
import { checkLeverage } from "@/lib/validation";

/**
 * 레버리지 입력란(숫자만, F-1 EC-1)과 최대 레버리지 경고(F-7 DoD-9).
 * 원문이 양수일 때만 판정하고(EC-4), 심볼이 바뀌면 렌더 때 다시 판정한다(EC-2).
 */
export function LeverageField({
  value,
  onChange,
  symbol,
}: {
  value: string;
  onChange: (value: string) => void;
  symbol: SymbolInfo;
}) {
  const id = React.useId();
  const warningId = `${id}-warning`;

  const leverage = toNumber(value);
  const warning =
    isPositive(leverage) && checkLeverage(leverage, symbol) === "exceedsMax"
      ? `${symbol.symbol}의 최대 레버리지는 ${symbol.maxLeverage}배입니다.`
      : null;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>레버리지</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={filtered(LEVERAGE_PATTERN, onChange)}
        aria-describedby={warning ? warningId : undefined}
      />
      {warning ? <FieldWarning id={warningId}>{warning}</FieldWarning> : null}
    </div>
  );
}
