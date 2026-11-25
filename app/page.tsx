import { CalculatorTabs } from "@/components/calculator-tabs";
import { PnlCalculator } from "@/components/pnl-calculator";
import { TargetPriceCalculator } from "@/components/target-price-calculator"; // F-2
// ---
import { LiquidationCalculator } from "@/components/liquidation-calculator"; // F-3
// ---
import { MaxQuantityCalculator } from "@/components/max-quantity-calculator"; // F-4
// ---
// F-5 자리

const items = [
  { value: "pnl", label: "손익", content: <PnlCalculator /> },
  { value: "target", label: "목표가", content: <TargetPriceCalculator /> }, // F-2
  // ---
  { value: "liquidation", label: "청산가", content: <LiquidationCalculator /> }, // F-3
  // ---
  { value: "max-quantity", label: "최대 수량", content: <MaxQuantityCalculator /> }, // F-4
  // ---
  // F-5 자리
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">포지션 계산기</h1>
      <CalculatorTabs items={items} defaultValue="pnl" />
    </main>
  );
}
