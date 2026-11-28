"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { EMPTY, type PathChartPoint } from "@/components/pyramid/display";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatPrice } from "@/lib/format";

const CHART_CONFIG = {
  price: { label: "진입가", color: "var(--chart-1)" },
  avgPrice: { label: "누적 평단", color: "var(--chart-2)" },
  liquidation: { label: "청산가", color: "var(--chart-3)" },
} satisfies ChartConfig;

function seriesLabel(name: unknown): string {
  if (name === "price" || name === "avgPrice" || name === "liquidation") {
    return CHART_CONFIG[name].label;
  }
  return String(name);
}

/**
 * 경로 차트(DoD-21): 진입가·누적 평단·청산가 선 3개와 범례·툴팁. 데이터는 `pathChartPoints` 결과만 받는다.
 * 청산가가 null인 점(EC-8)은 비운다.
 */
export function PathChart({
  points,
  priceScale,
}: {
  points: readonly PathChartPoint[];
  priceScale: number;
}) {
  return (
    <figure aria-label="진입가, 누적 평균 진입가, 청산가의 단계별 변화" className="m-0 min-w-0">
      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[240px] w-full">
        <LineChart data={[...points]} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            domain={["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => formatPrice(v, 0)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name, item) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: item.color }}
                      />
                      {seriesLabel(name)}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {typeof value === "number" ? formatPrice(value, priceScale) : EMPTY}
                    </span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            dataKey="price"
            type="linear"
            stroke="var(--color-price)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="avgPrice"
            type="linear"
            stroke="var(--color-avgPrice)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="liquidation"
            type="linear"
            stroke="var(--color-liquidation)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </figure>
  );
}
