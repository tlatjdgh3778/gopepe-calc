"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { DecimalField } from "@/components/fields/decimal-field";
import { SideToggle, type Side } from "@/components/fields/side-toggle";
import { LeverageControl } from "@/components/pyramid/leverage-control";
import { Panel, PanelTag, WithUnit } from "@/components/pyramid/panel";

/**
 * `포지션 설정` 패널(DoD-32): 방향, 최초 진입가, 초기 증거금, 레버리지, 접힌 `수수료 설정`(DoD-15).
 * 유지증거금률 입력란은 없다(DoD-14).
 */
export function SetupPanel({
  side,
  onSideChange,
  entryPrice,
  onEntryPriceChange,
  entryPriceWarning,
  margin,
  onMarginChange,
  marginWarning,
  leverage,
  leverageSliderValue,
  maxLeverage,
  onLeverageChange,
  onLeverageBlur,
  feeOpen,
  onFeeOpenChange,
  feeRate,
  onFeeRateChange,
  feeRateWarning,
}: {
  side: Side;
  onSideChange: (side: Side) => void;
  entryPrice: string;
  onEntryPriceChange: (value: string) => void;
  entryPriceWarning: string | null;
  margin: string;
  onMarginChange: (value: string) => void;
  marginWarning: string | null;
  leverage: string;
  leverageSliderValue: number;
  maxLeverage: number;
  onLeverageChange: (value: string) => void;
  onLeverageBlur: () => void;
  feeOpen: boolean;
  onFeeOpenChange: (open: boolean) => void;
  feeRate: string;
  onFeeRateChange: (value: string) => void;
  feeRateWarning: string | null;
}) {
  const id = React.useId();
  const feeButtonId = `${id}-fee-button`;
  const feePanelId = `${id}-fee-panel`;

  return (
    <Panel title="포지션 설정" aside={<PanelTag>자동 계산</PanelTag>}>
      <SideToggle value={side} onChange={onSideChange} />

      <DecimalField
        label="최초 진입가"
        value={entryPrice}
        onChange={onEntryPriceChange}
        warning={entryPriceWarning}
      />

      <DecimalField
        label="초기 증거금"
        value={margin}
        onChange={onMarginChange}
        warning={marginWarning}
      />

      <LeverageControl
        value={leverage}
        sliderValue={leverageSliderValue}
        max={maxLeverage}
        onChange={onLeverageChange}
        onBlur={onLeverageBlur}
      />

      <div className="flex flex-col gap-3 border-t pt-3">
        <button
          id={feeButtonId}
          type="button"
          aria-expanded={feeOpen}
          aria-controls={feePanelId}
          onClick={() => onFeeOpenChange(!feeOpen)}
          className="relative flex min-h-11 items-center justify-between rounded-md text-left text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          수수료 설정
          {feeOpen ? (
            <ChevronUp aria-hidden="true" className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
        </button>
        <fieldset
          id={feePanelId}
          aria-labelledby={feeButtonId}
          hidden={!feeOpen}
          className="m-0 min-w-0 border-0 p-0"
        >
          <WithUnit unit="%">
            <DecimalField
              label="거래 수수료율"
              value={feeRate}
              onChange={onFeeRateChange}
              warning={feeRateWarning}
            />
          </WithUnit>
        </fieldset>
      </div>
    </Panel>
  );
}
