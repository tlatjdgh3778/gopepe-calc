"use client";

import * as React from "react";

import { FieldWarning } from "@/components/fields/field-warning";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DECIMAL_PATTERN, filtered } from "@/lib/input";

/**
 * 숫자와 소수점 하나만 받는 입력란(F-1 EC-2). 진입가·종료가·수량·USDT 금액에 쓴다.
 * `children`은 입력란 아래 보조 문구(예: 참고 수량), `warning`은 `⚠`를 뺀 경고 문구다.
 * 경고가 있을 때만 경고 문단을 그리고 입력란과 `aria-describedby`로 잇는다.
 */
export function DecimalField({
  label,
  value,
  onChange,
  warning,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  warning?: string | null;
  children?: React.ReactNode;
}) {
  const id = React.useId();
  const warningId = `${id}-warning`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={filtered(DECIMAL_PATTERN, onChange)}
        aria-describedby={warning ? warningId : undefined}
      />
      {children}
      {warning ? <FieldWarning id={warningId}>{warning}</FieldWarning> : null}
    </div>
  );
}
