"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SYMBOLS, SYMBOLS_AS_OF, type SymbolInfo } from "@/lib/symbols";

const SYMBOL_ITEMS = SYMBOLS.map((s) => ({ label: s.symbol, value: s.symbol }));

/** 심볼 선택과 그 아래 심볼 정보 기준일 문구(F-7 DoD-17). */
export function SymbolSelect({
  value,
  onChange,
}: {
  value: SymbolInfo["symbol"];
  onChange: (value: SymbolInfo["symbol"]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Select
        items={SYMBOL_ITEMS}
        value={value}
        onValueChange={(next) => {
          if (next === null) return;
          onChange((SYMBOLS.find((s) => s.symbol === next) ?? SYMBOLS[0]).symbol);
        }}
      >
        <SelectPrimitive.Label className="text-sm leading-none font-medium select-none">
          심볼
        </SelectPrimitive.Label>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SYMBOLS.map((s) => (
            <SelectItem key={s.symbol} value={s.symbol}>
              {s.symbol}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">{`심볼 정보 기준일 ${SYMBOLS_AS_OF} (Bybit)`}</p>
    </div>
  );
}
