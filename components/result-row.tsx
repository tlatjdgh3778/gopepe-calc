"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type Tone = "profit" | "loss" | "neutral";

/** 표시값 기준 이익·손실 판정 (F-1 DoD-12·EC-12). `+`는 이익, `−`(U+2212)는 손실, 그 외는 중립. */
export function toneOf(display: string): Tone {
  if (display.startsWith("+")) return "profit";
  if (display.startsWith("−")) return "loss";
  return "neutral";
}

export const TONE_CLASS: Record<Tone, string | undefined> = {
  profit: "text-profit",
  loss: "text-loss",
  neutral: undefined,
};

/**
 * 결과 한 행(`dt`·`dd`). `dd`는 `aria-labelledby`로 `dt`를 이름으로 갖는다.
 * `toned`이면 표시값 부호로 `data-tone`과 이익·손실 색을 정한다.
 */
export function ResultRow({
  label,
  value,
  toned = false,
}: {
  label: string;
  value: string;
  toned?: boolean;
}) {
  const id = React.useId();
  const tone = toned ? toneOf(value) : undefined;

  return (
    <>
      <dt id={id} className="text-muted-foreground">
        {label}
      </dt>
      <dd
        aria-labelledby={id}
        data-tone={tone}
        className={cn(
          "min-w-0 text-right font-medium tabular-nums wrap-anywhere",
          tone && TONE_CLASS[tone],
        )}
      >
        {value}
      </dd>
    </>
  );
}
