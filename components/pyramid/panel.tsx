"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 터미널 패널. `section`의 이름은 제목 `h2`다(region 이름, DoD-32).
 * `aside`는 제목 오른쪽 보조 표시다.
 */
export function Panel({
  title,
  aside,
  className,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();

  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-md border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="text-[15px] font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** 패널 제목 옆의 작은 태그. */
export function PanelTag({ children }: { children: string }) {
  return (
    <span className="rounded border border-input bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * 입력 필드(레이블 위, 입력란 아래) 오른쪽 끝에 단위를 겹쳐 그린다.
 * 단위는 입력란 높이(h-8)에 맞춰 레이블(14px)과 간격(8px) 아래에 둔다.
 */
export function WithUnit({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute top-[22px] right-2.5 flex h-8 items-center text-xs text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}
