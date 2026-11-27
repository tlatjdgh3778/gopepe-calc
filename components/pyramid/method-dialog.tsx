"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** 계산 기준 4단락(DoD-35). 4단락 첫 문장만 스펙 문구이고 나머지는 시안 원문이다. */
const METHOD_PARAGRAPHS = [
  "USDT 선형 무기한 계약의 단순화된 공유 담보 모델입니다. 실시간 시세와 연결되어 있지 않습니다.",
  "추가 수량 = 가용 미실현 수익 × 재투입 비율 × 최초 레버리지 ÷ 추가 진입가. 이전 단계에서 증거금으로 배정한 수익은 가용 수익에서 제외합니다.",
  "미실현 수익은 현금 담보에 중복 합산하지 않습니다. 총 자산은 원금 + 미실현 손익 − 진입 수수료입니다. 실효 레버리지는 최종 진입 시점의 포지션 가치 ÷ 최초 원금입니다.",
  "청산은 총 자산이 심볼 첫 단계 유지증거금률 기준 유지증거금과 예상 청산 수수료에 도달하는 가격의 근사치입니다. 거래소 위험 한도·펀딩·슬리피지·다른 포지션은 반영하지 않습니다. 격리에서 수익을 증거금으로 옮기려면 일부 실현이 필요하므로 실제 결과와 다릅니다.",
] as const;

/** `계산 기준` 버튼과 계산 기준 다이얼로그(DoD-35). */
export function MethodDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-primary" />}>
        계산 기준
        <span aria-hidden="true">ⓘ</span>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <div className="flex items-center justify-between gap-2">
          <DialogTitle>계산 기준</DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="닫기" />}>
            <span aria-hidden="true">✕</span>
          </DialogClose>
        </div>
        {METHOD_PARAGRAPHS.map((text) => (
          <p key={text} className="leading-relaxed text-muted-foreground">
            {text}
          </p>
        ))}
      </DialogContent>
    </Dialog>
  );
}
