"use client";

import * as React from "react";

import { FieldWarning } from "@/components/fields/field-warning";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { filtered } from "@/lib/input";

/** 목표 ROE: 맨 앞 `-` 하나, 숫자, 소수점 하나 (F-2 EC-1) */
const SIGNED_DECIMAL_PATTERN = /^-?\d*\.?\d*$/;

/**
 * 맨 앞 `-` 하나를 받는 숫자 입력란(F-2 EC-1). 목표 ROE에 쓴다.
 * 모바일 숫자 키패드에 `-`가 없는 경우를 피하려고 `inputMode`를 두지 않는다.
 * 숫자 변환은 쓰는 쪽이 공용 `toNumber`로 한다(`-`·`-.`는 null).
 * `children`은 입력란 아래 보조 문구, `warning`은 `⚠`를 뺀 경고 문구다.
 * 경고가 있을 때만 경고 문단을 그리고 입력란과 `aria-describedby`로 잇는다.
 */
export function SignedDecimalField({
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
        autoComplete="off"
        value={value}
        onChange={filtered(SIGNED_DECIMAL_PATTERN, onChange)}
        aria-describedby={warning ? warningId : undefined}
      />
      {children}
      {warning ? <FieldWarning id={warningId}>{warning}</FieldWarning> : null}
    </div>
  );
}
