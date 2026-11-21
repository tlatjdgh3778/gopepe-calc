"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCoinQty, formatPercent, formatQtyInput, formatUsdt } from "@/lib/format";
import { calculatePnl, qtyFromValue } from "@/lib/pnl";
import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";

type Side = "long" | "short";
type QtyUnit = "coin" | "usdt";
type Tone = "profit" | "loss" | "neutral";

/** 레버리지: 숫자만 (EC-1) */
const LEVERAGE_PATTERN = /^\d*$/;
/** 진입가·종료가·수량·USDT 금액: 숫자와 소수점 하나 (EC-2) */
const DECIMAL_PATTERN = /^\d*\.?\d*$/;

const SYMBOL_ITEMS = SYMBOLS.map((s) => ({ label: s.symbol, value: s.symbol }));

/** 입력 문자열을 계산용 숫자로 바꾼다. 빈 값·`.`·유한하지 않은 값은 null이다. */
function toNumber(text: string): number | null {
  if (text === "" || text === ".") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function isPositive(n: number | null): n is number {
  return n !== null && n > 0;
}

/** 표시값 기준 이익·손실 판정 (DoD-12·EC-12). `+`는 이익, `−`(U+2212)는 손실, 그 외는 중립. */
function toneOf(display: string): Tone {
  if (display.startsWith("+")) return "profit";
  if (display.startsWith("−")) return "loss";
  return "neutral";
}

const TONE_CLASS: Record<Tone, string | undefined> = {
  profit: "text-profit",
  loss: "text-loss",
  neutral: undefined,
};

function findSymbol(symbol: string): SymbolInfo {
  return SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0];
}

export function PnlCalculator() {
  const id = React.useId();
  const ids = {
    side: `${id}-side`,
    leverage: `${id}-leverage`,
    entry: `${id}-entry`,
    exit: `${id}-exit`,
    qty: `${id}-qty`,
    unit: `${id}-unit`,
    margin: `${id}-margin`,
    pnl: `${id}-pnl`,
    roe: `${id}-roe`,
    inputTitle: `${id}-input-title`,
    resultTitle: `${id}-result-title`,
  };

  const [symbol, setSymbol] = React.useState<SymbolInfo["symbol"]>("BTCUSDT");
  const [side, setSide] = React.useState<Side>("long");
  const [leverage, setLeverage] = React.useState("10");
  const [entryPrice, setEntryPrice] = React.useState("");
  const [exitPrice, setExitPrice] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState<QtyUnit>("coin");

  const symbolInfo = findSymbol(symbol);
  const entry = toNumber(entryPrice);
  const qtyInput = toNumber(qty);
  const coinQty = unit === "coin" ? qtyInput : qtyFromValue(qtyInput, entry);

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
  const pnlTone = toneOf(pnlText);
  const roeTone = toneOf(roeText);

  function filtered(pattern: RegExp, set: (v: string) => void) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      if (pattern.test(next)) set(next);
    };
  }

  function changeUnit(next: QtyUnit) {
    if (next === unit) return;
    let converted: number | null = null;
    // 진입가가 비어 있거나 `.`·0이면 환산할 수 없어 입력란을 비운다 (EC-11).
    if (isPositive(entry) && qtyInput !== null) {
      if (next === "usdt") {
        converted = qtyInput * entry;
      } else {
        converted = qtyInput === 0 ? 0 : qtyFromValue(qtyInput, entry);
      }
    }
    setQty(formatQtyInput(converted));
    setUnit(next);
  }

  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
      <section aria-labelledby={ids.inputTitle} className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle id={ids.inputTitle}>입력</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Select
                items={SYMBOL_ITEMS}
                value={symbol}
                onValueChange={(value) => {
                  if (value !== null) setSymbol(findSymbol(value).symbol);
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
            </div>

            <div className="flex flex-col gap-2">
              <span id={ids.side} className="text-sm leading-none font-medium select-none">
                방향
              </span>
              <ToggleGroup
                aria-labelledby={ids.side}
                variant="outline"
                value={[side]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === "long" || next === "short") setSide(next);
                }}
              >
                <ToggleGroupItem value="long">롱</ToggleGroupItem>
                <ToggleGroupItem value="short">숏</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.leverage}>레버리지</Label>
              <Input
                id={ids.leverage}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={leverage}
                onChange={filtered(LEVERAGE_PATTERN, setLeverage)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.entry}>진입가</Label>
              <Input
                id={ids.entry}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={entryPrice}
                onChange={filtered(DECIMAL_PATTERN, setEntryPrice)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.exit}>종료가</Label>
              <Input
                id={ids.exit}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={exitPrice}
                onChange={filtered(DECIMAL_PATTERN, setExitPrice)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span id={ids.unit} className="text-sm leading-none font-medium select-none">
                수량 단위
              </span>
              <ToggleGroup
                aria-labelledby={ids.unit}
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

            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.qty}>수량</Label>
              <Input
                id={ids.qty}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={qty}
                onChange={filtered(DECIMAL_PATTERN, setQty)}
              />
              {unit === "usdt" ? (
                <p className="text-sm text-muted-foreground">{`≈ ${formatCoinQty(coinQty)} ${symbolInfo.baseCoin}`}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby={ids.resultTitle} className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle id={ids.resultTitle}>결과</CardTitle>
          </CardHeader>
          <CardContent>
            <dl
              aria-live="polite"
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"
            >
              <dt id={ids.margin} className="text-muted-foreground">
                필요 증거금
              </dt>
              <dd
                aria-labelledby={ids.margin}
                className="min-w-0 text-right font-medium tabular-nums wrap-anywhere"
              >
                {marginText}
              </dd>
              <dt id={ids.pnl} className="text-muted-foreground">
                손익
              </dt>
              <dd
                aria-labelledby={ids.pnl}
                data-tone={pnlTone}
                className={cn(
                  "min-w-0 text-right font-medium tabular-nums wrap-anywhere",
                  TONE_CLASS[pnlTone],
                )}
              >
                {pnlText}
              </dd>
              <dt id={ids.roe} className="text-muted-foreground">
                ROE
              </dt>
              <dd
                aria-labelledby={ids.roe}
                data-tone={roeTone}
                className={cn(
                  "min-w-0 text-right font-medium tabular-nums wrap-anywhere",
                  TONE_CLASS[roeTone],
                )}
              >
                {roeText}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
