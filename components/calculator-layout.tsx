"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "profit" | "loss" | "neutral";

/** 표시값 기준 이익·손실 판정 (F-1 DoD-12·EC-12). `+`는 이익, `−`(U+2212)는 손실, 그 외는 중립. */
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

/**
 * 입력·결과 2단 카드. 카드 제목과 region 이름은 `{name} 입력`·`{name} 결과`다(F-7 DoD-19).
 * `results`는 결과 `dl` 안에 들어갈 `ResultRow`들이고, `dl`은 `aria-live="polite"`다.
 */
export function CalculatorLayout({
  name,
  inputs,
  results,
}: {
  name: string;
  inputs: React.ReactNode;
  results: React.ReactNode;
}) {
  const id = React.useId();
  const inputTitle = `${id}-input-title`;
  const resultTitle = `${id}-result-title`;

  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
      <section aria-labelledby={inputTitle} className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle id={inputTitle}>{`${name} 입력`}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{inputs}</CardContent>
        </Card>
      </section>

      <section aria-labelledby={resultTitle} className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle id={resultTitle}>{`${name} 결과`}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl
              aria-live="polite"
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"
            >
              {results}
            </dl>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

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
