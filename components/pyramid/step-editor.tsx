"use client";

import * as React from "react";

import { DecimalField } from "@/components/fields/decimal-field";
import { FieldWarning } from "@/components/fields/field-warning";
import {
  exclusionWarningText,
  stepName,
  stepNumber,
  stepPriceLabel,
  stepReinvestLabel,
  stepRemoveLabel,
} from "@/components/pyramid/display";
import { Panel, PanelTag } from "@/components/pyramid/panel";
import { Button } from "@/components/ui/button";
import type { PyramidExclusion } from "@/lib/pyramid";

/** 추가 진입 단계 입력 원문. `id`는 화면 순서와 무관한 고유 키다. */
export type StepDraft = { id: number; price: string; reinvest: string };

export const MAX_STEPS = 8;

/**
 * `추가 진입` 패널(DoD-32): 단계 카드(가격·재투입·삭제)와 `추가 진입 단계` 버튼.
 * 단계마다 `exclusions[index]`가 있으면 카드 아래에 제외 경고를 그린다(EC-12·EC-13·EC-14, `empty`는 없음).
 * 단계가 `MAX_STEPS`개이면 추가 버튼을 비활성화하고 안내 문구를 그린다(EC-18).
 */
export function StepEditor({
  steps,
  exclusions,
  onStepChange,
  onRemove,
  onAdd,
  priceWrapperRef,
  addButtonRef,
}: {
  steps: readonly StepDraft[];
  /** 단계 순서대로의 제외 사유. 계산 결과가 없으면 null이다. */
  exclusions: readonly (PyramidExclusion | null)[] | null;
  onStepChange: (id: number, field: "price" | "reinvest", value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  priceWrapperRef: (id: number) => (el: HTMLDivElement | null) => (() => void) | undefined;
  addButtonRef: React.Ref<HTMLButtonElement>;
}) {
  const id = React.useId();
  const full = steps.length >= MAX_STEPS;

  return (
    <Panel title="추가 진입" aside={<PanelTag>선택</PanelTag>}>
      <p className="-mt-2 text-xs text-muted-foreground">
        해당 시점의 가용 수익을 증거금으로 사용합니다.
      </p>

      {steps.map((step, index) => {
        const n = index + 1;
        const headingId = `${id}-${step.id}-heading`;
        const warningId = `${id}-${step.id}-warning`;
        const warning = exclusionWarningText(n, exclusions?.[index] ?? null);

        return (
          <fieldset
            key={step.id}
            aria-labelledby={headingId}
            className="m-0 flex min-w-0 flex-col gap-3 rounded-md border border-input bg-muted p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span aria-hidden="true" className="text-xs text-muted-foreground">
                  {stepNumber(n)}
                </span>
                <span id={headingId}>{stepName(n)}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={stepRemoveLabel(n)}
                onClick={() => onRemove(index)}
              >
                <span aria-hidden="true">×</span>
              </Button>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <div className="min-w-0" ref={priceWrapperRef(step.id)}>
                <DecimalField
                  label={stepPriceLabel(n)}
                  value={step.price}
                  onChange={(value) => onStepChange(step.id, "price", value)}
                />
              </div>
              <div className="min-w-0">
                <DecimalField
                  label={stepReinvestLabel(n)}
                  value={step.reinvest}
                  onChange={(value) => onStepChange(step.id, "reinvest", value)}
                />
              </div>
            </div>
            {warning ? <FieldWarning id={warningId}>{warning}</FieldWarning> : null}
          </fieldset>
        );
      })}

      <div className="flex flex-col gap-2">
        <Button
          ref={addButtonRef}
          type="button"
          variant="outline"
          disabled={full}
          onClick={onAdd}
          className="w-full border-dashed"
        >
          <span aria-hidden="true">＋</span>
          추가 진입 단계
        </Button>
        {full ? (
          <p className="text-xs text-muted-foreground">최대 8단계까지 추가할 수 있습니다.</p>
        ) : null}
        <p className="text-xs text-muted-foreground">추가 진입에도 최초 레버리지가 적용됩니다.</p>
      </div>
    </Panel>
  );
}
