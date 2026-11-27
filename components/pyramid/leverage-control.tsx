"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { formatLeverageMark } from "@/components/pyramid/display";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { filtered, LEVERAGE_PATTERN } from "@/lib/input";

/**
 * 레버리지 정수 입력란(`레버리지`)과 슬라이더(`레버리지 슬라이더`)(DoD-12).
 * 둘은 같은 원문 상태를 쓴다. 슬라이더 값 `sliderValue`는 원문을 1~`max`로 맞춘 값이다(EC-33).
 * 범위 밖 값은 포커스를 뺄 때 `onBlur`에서 맞춘다(EC-7).
 */
export function LeverageControl({
  value,
  sliderValue,
  max,
  onChange,
  onBlur,
}: {
  value: string;
  sliderValue: number;
  max: number;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const id = React.useId();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={id}>레버리지</Label>
        <div className="flex w-24 items-center gap-1.5">
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={filtered(LEVERAGE_PATTERN, onChange)}
            onBlur={onBlur}
            className="text-right"
          />
          <span className="text-sm text-muted-foreground">×</span>
        </div>
      </div>
      <SliderPrimitive.Root
        value={sliderValue}
        min={1}
        max={max}
        step={1}
        onValueChange={(next) => onChange(String(next))}
        className="w-full"
      >
        <SliderPrimitive.Control className="relative flex w-full touch-none items-center py-2 select-none">
          <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted select-none">
            <SliderPrimitive.Indicator className="h-full bg-primary select-none" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="레버리지 슬라이더"
            className="relative block size-3.5 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3"
          />
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
      <div aria-hidden="true" className="flex justify-between text-[11px] text-muted-foreground">
        <span>{formatLeverageMark(1)}</span>
        <span>{formatLeverageMark(max)}</span>
      </div>
    </div>
  );
}
