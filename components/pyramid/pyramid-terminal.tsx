"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import type { Side } from "@/components/fields/side-toggle";
import { formatFillPrice, formatRoeFill } from "@/components/pyramid/display";
import { MarketStrip } from "@/components/pyramid/market-strip";
import { PathPanel } from "@/components/pyramid/path-panel";
import { SetupPanel } from "@/components/pyramid/setup-panel";
import { MAX_STEPS, StepEditor, type StepDraft } from "@/components/pyramid/step-editor";
import { StopLossPanel } from "@/components/pyramid/stop-loss-panel";
import { SummaryPanel } from "@/components/pyramid/summary-panel";
import { TakeProfitPanel } from "@/components/pyramid/take-profit-panel";
import { Button } from "@/components/ui/button";
import { roundToStep } from "@/lib/format";
import { isPositive, toNumber } from "@/lib/input";
import { isStopBeforeLiquidation, roundLiquidation } from "@/lib/liquidation";
import {
  baselinePnl,
  netPnl,
  priceForRoe,
  simulatePyramid,
  type PyramidInput,
  type PyramidResult,
} from "@/lib/pyramid";
import { SYMBOLS, type SymbolInfo } from "@/lib/symbols";

/** 입력 원문. 계산은 렌더 때 한다. */
type Inputs = {
  symbol: SymbolInfo["symbol"];
  side: Side;
  entryPrice: string;
  margin: string;
  leverage: string;
  /** % 원문(0.055 = 0.055%). */
  feeRate: string;
  steps: StepDraft[];
  takeProfit: string;
  stopLoss: string;
};

/** 처음 연 화면과 초기화 값(DoD-8·DoD-16). */
const INITIAL_INPUTS: Inputs = {
  symbol: "ETHUSDT",
  side: "long",
  entryPrice: "1900",
  margin: "1000",
  leverage: "5",
  feeRate: "0.055",
  steps: [
    { id: 0, price: "2100", reinvest: "100" },
    { id: 1, price: "2300", reinvest: "100" },
  ],
  takeProfit: "2500",
  stopLoss: "2000",
};

const ZERO_WARNING = "0보다 커야 합니다.";
const FEE_WARNING = "수수료율은 1% 미만이어야 합니다.";
const NO_ROE_PRICE_WARNING = "이 수익률에 해당하는 가격이 없습니다.";
const TAKE_PROFIT_BEHIND_WARNING =
  "익절가가 마지막 추가 진입가보다 앞에 있습니다. 경로를 확인해 주세요.";
const STOP_PROFIT_SIDE_WARNING = "손절가가 최종 진입가의 수익 방향에 있습니다.";
const STOP_BEFORE_LIQUIDATION_WARNING = "손절 전에 청산될 수 있습니다. 손절가를 확인하세요.";

/** 원문이 숫자로 읽히고 0 이하이면 0 경고(EC-2·EC-21·EC-22). 빈칸·`.`은 경고하지 않는다(EC-1). */
function zeroWarningOf(text: string): string | null {
  const n = toNumber(text);
  return n !== null && n <= 0 ? ZERO_WARNING : null;
}

/** 위치 grid(DoD-37). 1열은 DOM 순서, 721px 이상은 grid 영역 배치다. */
const GRID =
  "grid grid-cols-[minmax(0,1fr)] items-start gap-3 " +
  "min-[721px]:grid-cols-[minmax(235px,0.8fr)_minmax(0,1.7fr)] " +
  "min-[721px]:[grid-template-areas:'setup_summary'_'steps_path'_'exits_exits'] " +
  "min-[1151px]:grid-cols-[minmax(235px,0.85fr)_minmax(0,2fr)_minmax(245px,1fr)] " +
  "min-[1151px]:[grid-template-areas:'setup_summary_exits'_'steps_path_exits']";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 가격을 틱에 맞춘다. 롱은 올림, 숏은 내림(DoD-22·DoD-27). 0 이하이거나 없으면 null. */
function tickPrice(v: number | null, side: Side, tickSize: number): number | null {
  if (v === null || !Number.isFinite(v) || v <= 0) return null;
  const rounded = roundToStep(v, tickSize, side === "long" ? "up" : "down");
  return rounded !== null && rounded > 0 ? rounded : null;
}

/**
 * 피라미딩 터미널 화면. 유일한 상태 소유자이고 입력 원문으로 렌더 때 계산한다.
 * 목표 수익률 입력란은 `roeDraft ?? netPnl 기반 재계산 문자열`이고, 목표 수익률 외의 모든 입력 변경이
 * `roeDraft`를 해제한다(DoD-22·DoD-23).
 */
export function PyramidTerminal() {
  const [inputs, setInputs] = React.useState<Inputs>(INITIAL_INPUTS);
  const [roeDraft, setRoeDraft] = React.useState<string | null>(null);
  const [feeOpen, setFeeOpen] = React.useState(false);

  // 다음 단계 id. 증가는 이벤트 핸들러에서만 한다(updater 안에서 하지 않는다).
  const nextId = React.useRef(INITIAL_INPUTS.steps.length);
  // 단계 id → 가격 입력란을 감싼 요소. 포커스 이동에 쓴다(DoD-29·EC-19).
  const priceWrappers = React.useRef(new Map<number, HTMLElement>());
  const addButton = React.useRef<HTMLButtonElement>(null);
  // 다음 커밋 뒤 포커스할 단계 id 또는 추가 버튼.
  const pendingFocus = React.useRef<number | "add" | null>(null);

  React.useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "add") {
      addButton.current?.focus();
      return;
    }
    priceWrappers.current.get(target)?.querySelector("input")?.focus();
  }, [inputs.steps]);

  const symbolInfo = SYMBOLS.find((s) => s.symbol === inputs.symbol) ?? SYMBOLS[0];
  const { maxLeverage, tickSize, priceScale, maintenanceTier } = symbolInfo;
  const { side } = inputs;
  const s = side === "long" ? 1 : -1;

  const entryPrice = toNumber(inputs.entryPrice);
  const margin = toNumber(inputs.margin);
  const leverageRaw = toNumber(inputs.leverage);
  // 포커스 이탈 전 범위 밖 값도 계산·슬라이더에는 1~maxLeverage로 맞춘 값을 쓴다(EC-33).
  const leverage = leverageRaw === null ? null : clamp(leverageRaw, 1, maxLeverage);
  const feePercent = toNumber(inputs.feeRate);

  const pyramidInput: PyramidInput | null =
    leverage === null || feePercent === null
      ? null
      : {
          side,
          entryPrice,
          margin,
          leverage,
          feeRate: feePercent / 100,
          mmr: maintenanceTier.mmr,
          steps: inputs.steps.map((step) => ({
            price: toNumber(step.price),
            reinvestPercent: toNumber(step.reinvest),
          })),
        };
  const result: PyramidResult | null = pyramidInput === null ? null : simulatePyramid(pyramidInput);
  const calc = pyramidInput !== null && result !== null ? { input: pyramidInput, result } : null;

  // 청산가(DoD-19·EC-8·EC-34).
  const instantLiquidation = calc !== null && (calc.input.margin ?? 0) - calc.result.entryFees <= 0;
  const noLiquidation =
    calc !== null && calc.result.liquidationPrice !== null && calc.result.liquidationPrice <= 0;
  const liquidation =
    calc === null ? null : roundLiquidation(calc.result.liquidationPrice, side, tickSize);

  // 익절(DoD-22~DoD-24).
  const takeProfit = toNumber(inputs.takeProfit);
  const takeProfitNet = calc === null ? null : netPnl(calc.input, calc.result, takeProfit);
  const baseline = calc === null ? null : baselinePnl(calc.input, takeProfit);
  const roeValue =
    roeDraft ??
    (takeProfitNet !== null && margin !== null
      ? formatRoeFill((takeProfitNet / margin) * 100)
      : "");

  /** 목표 수익률 원문의 역산 익절가. 판정할 수 없으면 undefined, 가격이 없으면 null(EC-20·EC-32). */
  function roeTargetPrice(text: string): number | null | undefined {
    const roe = toNumber(text);
    if (roe === null || calc === null) return undefined;
    return tickPrice(priceForRoe(calc.input, calc.result, roe), side, tickSize);
  }

  const roeWarning =
    roeDraft !== null && roeTargetPrice(roeDraft) === null ? NO_ROE_PRICE_WARNING : null;
  const takeProfitWarning =
    zeroWarningOf(inputs.takeProfit) ??
    (calc !== null && isPositive(takeProfit) && s * (takeProfit - calc.result.lastPrice) < 0
      ? TAKE_PROFIT_BEHIND_WARNING
      : null);

  // 손절(DoD-25·EC-24·EC-25).
  const stopLoss = toNumber(inputs.stopLoss);
  const stopPrice = isPositive(stopLoss) ? stopLoss : null;
  const stopNet = calc === null ? null : netPnl(calc.input, calc.result, stopPrice);
  let stopWarning: string | null = null;
  if (calc !== null && stopPrice !== null) {
    if (s * (stopPrice - calc.result.lastPrice) > 0) stopWarning = STOP_PROFIT_SIDE_WARNING;
    else if (liquidation !== null && isStopBeforeLiquidation(side, stopPrice, liquidation)) {
      stopWarning = STOP_BEFORE_LIQUIDATION_WARNING;
    }
  }

  /** 목표 수익률 외의 입력 변경. 목표 수익률 초안을 해제한다(DoD-23). */
  function edit(patch: Partial<Inputs> | ((prev: Inputs) => Partial<Inputs>)) {
    setRoeDraft(null);
    setInputs((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }

  function changeSymbol(symbol: SymbolInfo["symbol"]) {
    const next = SYMBOLS.find((item) => item.symbol === symbol) ?? SYMBOLS[0];
    // 새 심볼의 maxLeverage를 넘으면 경고 없이 maxLeverage로 바꾼다(DoD-13).
    edit((prev) => {
      const current = toNumber(prev.leverage);
      return {
        symbol: next.symbol,
        leverage:
          current !== null && current > next.maxLeverage ? String(next.maxLeverage) : prev.leverage,
      };
    });
  }

  function blurLeverage() {
    if (leverageRaw === null || leverage === null) return; // 빈칸은 그대로(EC-33)
    if (leverageRaw !== leverage) edit({ leverage: String(leverage) }); // EC-7
  }

  function changeRoe(text: string) {
    setRoeDraft(text);
    const price = roeTargetPrice(text);
    if (typeof price === "number") {
      setInputs((prev) => ({ ...prev, takeProfit: formatFillPrice(price) }));
    }
  }

  function changeStep(id: number, field: "price" | "reinvest", value: string) {
    edit((prev) => ({
      steps: prev.steps.map((step) => (step.id === id ? { ...step, [field]: value } : step)),
    }));
  }

  function addStep() {
    if (inputs.steps.length >= MAX_STEPS) return;
    // 마지막 포함 진입가(결과가 없으면 유효한 최초 진입가) × 1.05(롱)·× 0.95(숏)를 틱에 맞춘다(DoD-27·EC-31).
    const base = calc !== null ? calc.result.lastPrice : isPositive(entryPrice) ? entryPrice : null;
    const price =
      base === null ? null : tickPrice(base * (side === "long" ? 1.05 : 0.95), side, tickSize);
    const id = nextId.current;
    nextId.current += 1;
    pendingFocus.current = id;
    edit((prev) => ({
      steps: [...prev.steps, { id, price: formatFillPrice(price), reinvest: "100" }],
    }));
  }

  function removeStep(index: number) {
    const { steps } = inputs;
    const removed = steps[index];
    if (removed === undefined) return;
    // 마지막이 아니면 다음 단계, 마지막이면 이전 단계, 남은 단계가 없으면 추가 버튼(DoD-29·EC-19).
    const target = steps[index + 1] ?? steps[index - 1];
    pendingFocus.current = target === undefined ? "add" : target.id;
    edit((prev) => ({ steps: prev.steps.filter((step) => step.id !== removed.id) }));
  }

  function reset() {
    setRoeDraft(null);
    setInputs(INITIAL_INPUTS);
  }

  function priceWrapperRef(id: number) {
    return (el: HTMLDivElement | null) => {
      if (el === null) return undefined;
      priceWrappers.current.set(id, el);
      return () => {
        priceWrappers.current.delete(id);
      };
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-3 px-4 py-6 break-keep md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">피라미딩 계산기</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            주문 조건을 수정하면서 포지션과 종료 결과를 즉시 확인하세요.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcw aria-hidden="true" />
          초기화
        </Button>
      </header>

      <MarketStrip symbolInfo={symbolInfo} onSymbolChange={changeSymbol} />

      {/*
        DOM 순서는 설정 → 요약 → 추가 진입 → 경로 → 익절·손절(DoD-37, 1열은 이 순서 그대로).
        721px 이상은 grid 영역으로 배치한다: 2열 "설정 요약 / 추가 진입 경로 / 익절·손절(전체 폭)",
        1151px 이상 3열 "설정 요약 익절·손절 / 추가 진입 경로 익절·손절".
      */}
      <div className={GRID}>
        <div className="min-w-0 min-[721px]:[grid-area:setup]">
          <SetupPanel
            side={side}
            onSideChange={(next) => edit({ side: next })}
            entryPrice={inputs.entryPrice}
            onEntryPriceChange={(value) => edit({ entryPrice: value })}
            entryPriceWarning={zeroWarningOf(inputs.entryPrice)}
            margin={inputs.margin}
            onMarginChange={(value) => edit({ margin: value })}
            marginWarning={zeroWarningOf(inputs.margin)}
            leverage={inputs.leverage}
            leverageSliderValue={leverage ?? 1}
            maxLeverage={maxLeverage}
            onLeverageChange={(value) => edit({ leverage: value })}
            onLeverageBlur={blurLeverage}
            feeOpen={feeOpen}
            onFeeOpenChange={setFeeOpen}
            feeRate={inputs.feeRate}
            onFeeRateChange={(value) => edit({ feeRate: value })}
            feeRateWarning={feePercent !== null && feePercent >= 1 ? FEE_WARNING : null}
          />
        </div>
        <div className="min-w-0 min-[721px]:[grid-area:summary]">
          <SummaryPanel
            result={calc?.result ?? null}
            side={side}
            entryPrice={entryPrice}
            margin={margin}
            leverage={leverage}
            symbolInfo={symbolInfo}
            liquidation={liquidation}
            noLiquidation={noLiquidation}
            instantLiquidation={instantLiquidation}
          />
        </div>
        <div className="min-w-0 min-[721px]:[grid-area:steps]">
          <StepEditor
            steps={inputs.steps}
            exclusions={calc === null ? null : calc.result.rows.slice(1).map((row) => row.excluded)}
            onStepChange={changeStep}
            onRemove={removeStep}
            onAdd={addStep}
            priceWrapperRef={priceWrapperRef}
            addButtonRef={addButton}
          />
        </div>
        <div className="min-w-0 min-[721px]:[grid-area:path]">
          <PathPanel
            rows={calc?.result.rows ?? null}
            stepIds={inputs.steps.map((step) => step.id)}
            side={side}
            symbolInfo={symbolInfo}
          />
        </div>
        <div className="grid min-w-0 gap-3 min-[721px]:grid-cols-2 min-[721px]:[grid-area:exits] min-[1151px]:grid-cols-1">
          <TakeProfitPanel
            takeProfit={inputs.takeProfit}
            onTakeProfitChange={(value) => edit({ takeProfit: value })}
            takeProfitWarning={takeProfitWarning}
            roe={roeValue}
            onRoeChange={changeRoe}
            roeWarning={roeWarning}
            hasResult={calc !== null}
            margin={margin}
            net={takeProfitNet}
            baseline={baseline}
          />
          <StopLossPanel
            stopLoss={inputs.stopLoss}
            onStopLossChange={(value) => edit({ stopLoss: value })}
            stopLossWarning={zeroWarningOf(inputs.stopLoss)}
            stopWarning={stopWarning}
            stopPrice={stopPrice}
            side={side}
            priceScale={priceScale}
            margin={margin}
            lastPrice={calc?.result.lastPrice ?? null}
            liquidation={liquidation}
            noLiquidation={noLiquidation}
            stopNet={stopNet}
            takeProfitNet={takeProfitNet}
          />
        </div>
      </div>

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        <p>청산가는 근사치이며 거래소·증거금 방식·펀딩비에 따라 달라집니다.</p>
      </footer>
    </main>
  );
}
