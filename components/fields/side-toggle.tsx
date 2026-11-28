"use client";

import * as React from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type Side = "long" | "short";

/**
 * 선택 항목은 primary 배경(호버 중에도 유지)이고, 720px 이하에서는 누를 수 있는 영역이 44×44px 이상이다.
 * `after:-inset-px`는 테두리(1px)와 둥근 모서리까지 버튼 박스 전체를 누를 수 있게 한다(::after는 padding box 기준이라 inset-0이면 테두리가 빠진다).
 */
const ITEM_CLASS =
  "relative after:absolute after:-inset-px aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground max-[720px]:h-11 max-[720px]:min-w-11";

/** 방향(롱·숏) 토글. 그룹 이름은 `방향`이다. */
export function SideToggle({ value, onChange }: { value: Side; onChange: (value: Side) => void }) {
  const id = React.useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-sm leading-none font-medium select-none">
        방향
      </span>
      <ToggleGroup
        aria-labelledby={id}
        variant="outline"
        value={[value]}
        onValueChange={(next) => {
          const side = next[0];
          if (side === "long" || side === "short") onChange(side);
        }}
      >
        <ToggleGroupItem value="long" className={ITEM_CLASS}>
          롱
        </ToggleGroupItem>
        <ToggleGroupItem value="short" className={ITEM_CLASS}>
          숏
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
