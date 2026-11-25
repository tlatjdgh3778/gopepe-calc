"use client";

import * as React from "react";

import { CalculatorLayout, ResultRow } from "@/components/calculator-layout";
import { DecimalField } from "@/components/fields/decimal-field";
import { SymbolSelect } from "@/components/fields/symbol-select";
import { averageEntry } from "@/lib/average-entry";
import { formatCoinQty, formatPrice } from "@/lib/format";
import { isPositive, toNumber } from "@/lib/input";
import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";
import { checkQty } from "@/lib/validation";

type EntryRow = { id: number; price: string; qty: string };

const INITIAL_ROWS: EntryRow[] = [
  { id: 0, price: "", qty: "" },
  { id: 1, price: "", qty: "" },
];

const BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-input bg-transparent px-3 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

/** 입력란 원문이 `""`·`.`이면 빈 칸이다(EC-2). */
function isBlank(text: string): boolean {
  return text === "" || text === ".";
}

/**
 * 행 원문을 계산 입력으로 바꾼다. 두 칸 모두 빈 행은 빠지고(EC-3),
 * 한 칸만 빈 행이 있으면 계산할 수 없어 `null`이다(EC-4). 0·비유한 판정은 `averageEntry`가 한다(EC-5).
 */
function entriesOf(rows: EntryRow[]): { price: number; qty: number }[] | null {
  const entries: { price: number; qty: number }[] = [];
  for (const row of rows) {
    const priceBlank = isBlank(row.price);
    const qtyBlank = isBlank(row.qty);
    if (priceBlank && qtyBlank) continue;
    if (priceBlank || qtyBlank) return null;
    entries.push({ price: Number(row.price), qty: Number(row.qty) });
  }
  return entries;
}

/**
 * 수량 경고 문구(EC-8·EC-9·EC-10). 경고 기호는 `FieldWarning`이 붙인다.
 * `components/pnl-calculator.tsx`의 `qtyWarningOf`에서 USDT 분기를 뺀 복제본이다.
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

export function AverageEntryCalculator() {
  const [symbol, setSymbol] = React.useState<SymbolInfo["symbol"]>("BTCUSDT");
  const [rows, setRows] = React.useState<EntryRow[]>(INITIAL_ROWS);

  // 다음 행 id. 증가는 이벤트 핸들러에서만 한다(updater 안에서 하지 않는다).
  const nextId = React.useRef(INITIAL_ROWS.length);
  // 행 id → 진입가 입력란을 감싼 요소. 포커스 이동에 쓴다(DoD-11·DoD-13·DoD-14).
  const priceWrappers = React.useRef(new Map<number, HTMLElement>());
  // 다음 커밋 뒤 포커스할 행 id.
  const pendingFocus = React.useRef<number | null>(null);

  React.useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    priceWrappers.current.get(id)?.querySelector("input")?.focus();
  }, [rows]);

  const symbolInfo = SYMBOLS.find((s) => s.symbol === symbol) ?? SYMBOLS[0];

  const entries = entriesOf(rows);
  const result = entries === null ? null : averageEntry(entries);

  const avgPriceText = formatPrice(result?.avgPrice ?? null, symbolInfo.priceScale);
  const totalQtyValue = formatCoinQty(result?.totalQty ?? null, symbolInfo.qtyStep);
  const totalQtyText = result === null ? totalQtyValue : `${totalQtyValue} ${symbolInfo.baseCoin}`;

  function updateRow(id: number, field: "price" | "qty", value: string) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    const id = nextId.current;
    nextId.current += 1;
    pendingFocus.current = id;
    setRows((prev) => [...prev, { id, price: "", qty: "" }]);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return;
    const removed = rows[index];
    // 마지막이 아니면 그 자리로 오는 다음 행, 마지막이면 이전 행에 포커스한다.
    const target = index < rows.length - 1 ? rows[index + 1] : rows[index - 1];
    pendingFocus.current = target.id;
    setRows((prev) => prev.filter((row) => row.id !== removed.id));
  }

  return (
    <CalculatorLayout
      name="평균 진입가"
      inputs={
        <>
          <SymbolSelect value={symbol} onChange={setSymbol} />

          {rows.map((row, index) => {
            const n = index + 1;
            const qtyNumber = toNumber(row.qty);
            // 수량 원문이 양수일 때만 판정한다(EC-11). 심볼이 바뀌면 렌더 때 다시 판정된다(EC-14).
            const qtyWarning = isPositive(qtyNumber)
              ? qtyWarningOf(checkQty(qtyNumber, symbolInfo), symbolInfo)
              : null;

            return (
              <div key={row.id} className="flex items-start gap-2">
                <div
                  className="min-w-0 flex-1"
                  ref={(el) => {
                    if (el === null) return;
                    priceWrappers.current.set(row.id, el);
                    return () => {
                      priceWrappers.current.delete(row.id);
                    };
                  }}
                >
                  <DecimalField
                    label={`진입가 ${n}`}
                    value={row.price}
                    onChange={(value) => updateRow(row.id, "price", value)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <DecimalField
                    label={`수량 ${n}`}
                    value={row.qty}
                    onChange={(value) => updateRow(row.id, "qty", value)}
                    warning={qtyWarning}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`${n}행 삭제`}
                  disabled={rows.length <= 1}
                  onClick={() => removeRow(index)}
                  className={`${BUTTON_CLASS} mt-6`}
                >
                  삭제
                </button>
              </div>
            );
          })}

          <button type="button" onClick={addRow} className={`${BUTTON_CLASS} self-start`}>
            행 추가
          </button>
        </>
      }
      results={
        <>
          <ResultRow label="평균 진입가" value={avgPriceText} />
          <ResultRow label="총 수량" value={totalQtyText} />
        </>
      }
    />
  );
}
