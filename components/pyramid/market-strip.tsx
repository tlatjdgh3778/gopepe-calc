"use client";

import { SymbolSelect } from "@/components/fields/symbol-select";
import { MethodDialog } from "@/components/pyramid/method-dialog";
import { formatPair } from "@/components/pyramid/display";
import type { SymbolInfo } from "@/lib/symbols";

/**
 * 마켓 스트립(DoD-33): 선택 심볼(`{기초} / USDT`), `무기한` 태그, 심볼 선택과 심볼 정보 기준일 문구,
 * `계산 기준` 버튼. 기준일 문구는 `SymbolSelect`가 그린다.
 */
export function MarketStrip({
  symbolInfo,
  onSymbolChange,
}: {
  symbolInfo: SymbolInfo;
  onSymbolChange: (symbol: SymbolInfo["symbol"]) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-md border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <strong className="text-base font-semibold">{formatPair(symbolInfo.baseCoin)}</strong>
        <span className="rounded border border-input bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          무기한
        </span>
      </div>
      <span className="hidden text-xs text-muted-foreground min-[900px]:inline">
        USDT 선형 계약 · 미실현 수익 재투입 가정
      </span>
      <div className="min-w-0 [&_p]:text-xs">
        <SymbolSelect value={symbolInfo.symbol} onChange={onSymbolChange} />
      </div>
      <div className="ml-auto">
        <MethodDialog />
      </div>
    </div>
  );
}
