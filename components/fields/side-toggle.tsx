"use client";

import * as React from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type Side = "long" | "short";

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
        <ToggleGroupItem value="long">롱</ToggleGroupItem>
        <ToggleGroupItem value="short">숏</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
