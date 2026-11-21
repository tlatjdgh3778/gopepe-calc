import { PnlCalculator } from "@/components/pnl-calculator";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">포지션 계산기</h1>
      <PnlCalculator />
    </main>
  );
}
