"use client";

import { DecimalField } from "@/components/fields/decimal-field";
import { SignedDecimalField } from "@/components/fields/signed-decimal-field";
import { comparisonWidths, effectText } from "@/components/pyramid/display";
import { Panel, PanelTag, WithUnit } from "@/components/pyramid/panel";
import { ResultRow } from "@/components/result-row";
import { formatPercent, formatUsdt } from "@/lib/format";

/**
 * `익절` 패널(DoD-22·DoD-23·DoD-24·EC-20·EC-21·EC-23·EC-28·EC-30·EC-32).
 * `net`은 `netPnl(익절가)`, `baseline`은 `baselinePnl(익절가)`다. `hasResult`가 false이면 비교 막대를 그리지 않는다.
 */
export function TakeProfitPanel({
  takeProfit,
  onTakeProfitChange,
  takeProfitWarning,
  roe,
  onRoeChange,
  roeWarning,
  hasResult,
  margin,
  net,
  baseline,
}: {
  takeProfit: string;
  onTakeProfitChange: (value: string) => void;
  takeProfitWarning: string | null;
  roe: string;
  onRoeChange: (value: string) => void;
  roeWarning: string | null;
  hasResult: boolean;
  margin: number | null;
  net: number | null;
  baseline: number | null;
}) {
  const roePercent = net !== null && margin !== null ? (net / margin) * 100 : null;
  const netText = formatUsdt(net, { signed: true });
  const baselineText = formatUsdt(baseline, { signed: true });
  const diff = net !== null && baseline !== null ? net - baseline : null;
  // 순수익과 `추가 진입 없이` 값이 모두 양수일 때만 배수를 붙인다(EC-28).
  const multiple =
    net !== null && baseline !== null && net > 0 && baseline > 0 ? net / baseline : null;
  const widths = comparisonWidths(baseline, net);

  return (
    <Panel title="익절" aside={<PanelTag>TAKE PROFIT</PanelTag>}>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <div className="min-w-0">
          <DecimalField
            label="익절가"
            value={takeProfit}
            onChange={onTakeProfitChange}
            warning={takeProfitWarning}
          />
        </div>
        <div className="min-w-0">
          <WithUnit unit="%">
            <SignedDecimalField
              label="목표 수익률"
              value={roe}
              onChange={onRoeChange}
              warning={roeWarning}
            />
          </WithUnit>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm [&>dd:first-of-type]:text-xl [&>dd:first-of-type]:font-semibold">
        <ResultRow label="예상 순수익" value={netText} toned />
        <ResultRow label="ROE" value={formatPercent(roePercent)} toned />
      </dl>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {hasResult ? (
          <>
            <ResultRow label="추가 진입 없이" value={baselineText} toned />
            <dd
              aria-hidden="true"
              className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-chart-2"
                style={{ width: `${widths.baseline}%` }}
              />
            </dd>
            <ResultRow label="피라미딩 적용" value={netText} toned />
            <dd
              aria-hidden="true"
              className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${widths.pyramid}%` }}
              />
            </dd>
          </>
        ) : null}
        <ResultRow
          label="추가 진입 효과"
          value={effectText(formatUsdt(diff, { signed: true }), multiple)}
          toned
        />
      </dl>
    </Panel>
  );
}
