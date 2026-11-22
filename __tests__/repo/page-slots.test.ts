// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** 저장소 루트. 이 파일은 `__tests__/repo/` 아래에 있다. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 검사 대상 F-ID와 기대 순서(스펙 4장 탭 순서: 목표가 → 청산가 → 최대 수량 → 평균 진입가). */
const SLOT_IDS = ["F-2", "F-3", "F-4", "F-5"] as const;

/** 인접한 자리 줄 사이에 두는 구분 줄(스펙 4장 "등록"). */
const SEPARATOR = "// ---";

/** 등록 전 자리 줄: 줄 전체가 `// F-N 자리`다. */
const BEFORE_REGISTRATION = /^\s*\/\/ (F-[2-5]) 자리\s*$/;

/** 등록 후 등록 줄: 코드 뒤 줄 끝에 F-ID 꼬리표 `// F-N`이 남아 있다. */
const AFTER_REGISTRATION = /^(?!\s*\/\/).*\S\s*\/\/ (F-[2-5])\s*$/;

function readPageLines(): string[] {
  return readFileSync(join(ROOT, "app/page.tsx"), "utf8").split(/\r?\n/);
}

/** 줄 끝 주석을 지운 코드 부분. */
function codeOf(line: string): string {
  return line.replace(/\/\/.*$/, "").trim();
}

/** import 영역의 끝(배타 인덱스). 주석·빈 줄·지시문은 영역 안으로 본다. */
function importAreaEnd(lines: string[]): number {
  let insideImport = false;
  for (let index = 0; index < lines.length; index++) {
    const code = codeOf(lines[index]);
    if (insideImport) {
      if (code.endsWith(";")) insideImport = false;
      continue;
    }
    if (code === "" || code.startsWith("/*") || code.startsWith("*")) continue;
    if (/^["']use (client|server)["'];?$/.test(code)) continue;
    if (/^import\b/.test(code)) {
      if (!code.endsWith(";")) insideImport = true;
      continue;
    }
    return index;
  }
  return lines.length;
}

/** import 영역 뒤에서 처음 여는 배열 리터럴(CalculatorTabs 항목 배열)의 안쪽 줄. 없으면 null. */
function itemsArea(lines: string[], from: number): string[] | null {
  const open = lines.findIndex((line, index) => index >= from && codeOf(line).endsWith("["));
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < lines.length; index++) {
    for (const char of codeOf(lines[index])) {
      if (char === "[") depth++;
      if (char === "]") depth--;
    }
    if (depth === 0) return lines.slice(open + 1, index);
  }
  return null;
}

function slotIdOf(line: string): string | null {
  return BEFORE_REGISTRATION.exec(line)?.[1] ?? AFTER_REGISTRATION.exec(line)?.[1] ?? null;
}

type SlotReport = {
  /** F-ID별 F-ID 줄 개수. */
  counts: Record<string, number>;
  /** 영역 안에서 나타난 F-ID 줄의 순서. */
  order: string[];
  /** 인접한 두 F-ID 줄 사이마다 `// ---` 구분 줄의 개수. */
  separators: Record<string, number>;
};

/** 영역 안의 F-ID 줄과 그 사이 구분 줄을 센다. */
function slotReport(area: string[]): SlotReport {
  const slots = area
    .map((line, index) => ({ id: slotIdOf(line), index }))
    .filter((slot): slot is { id: string; index: number } => slot.id !== null);

  const counts = Object.fromEntries(
    SLOT_IDS.map((id) => [id, slots.filter((slot) => slot.id === id).length]),
  );

  const separators: Record<string, number> = {};
  for (let k = 0; k < slots.length - 1; k++) {
    const between = area.slice(slots[k].index + 1, slots[k + 1].index);
    separators[`${slots[k].id}~${slots[k + 1].id}`] = between.filter(
      (line) => line.trim() === SEPARATOR,
    ).length;
  }

  return { counts, order: slots.map((slot) => slot.id), separators };
}

/** 모든 F-ID 줄이 하나씩 순서대로 있을 때 기대하는 보고. */
const EXPECTED_REPORT: SlotReport = {
  counts: { "F-2": 1, "F-3": 1, "F-4": 1, "F-5": 1 },
  order: [...SLOT_IDS],
  separators: { "F-2~F-3": 1, "F-3~F-4": 1, "F-4~F-5": 1 },
};

describe("계산기 등록 자리 — F-2~F-5가 app/page.tsx의 자기 자리만 바꿔 충돌 없이 등록한다", () => {
  describe("import 영역", () => {
    /**
     * @spec DoD-21
     * @given app/page.tsx 원문의 import 영역을 읽는다(파일을 만들거나 고치지 않는다). F-ID 줄로 인정하는 표본은 F-2·F-3·F-4·F-5 각각의 등록 전 자리 줄 `// F-N 자리`와 등록 후 줄 끝에 꼬리표 `// F-N`을 남긴 import 줄이며, 어느 F-ID가 등록된 뒤에도 같은 판정이 유지된다. 손익 항목과 F-2 사이는 검사하지 않는다
     * @when import 영역에서 F-2·F-3·F-4·F-5의 F-ID 줄과 그 사이 줄을 찾는다
     * @then F-2·F-3·F-4·F-5 각각의 F-ID 줄(등록 전 `// F-N 자리` 또는 등록 후 줄 끝 `// F-N`)이 정확히 하나씩 있다
     * @then F-ID 줄이 F-2 → F-3 → F-4 → F-5 순서로 놓여 있다
     * @then 인접한 두 F-ID 줄 사이의 줄들 가운데 `// ---` 구분 줄이 정확히 하나 있다(등록 줄이 여러 줄로 포맷돼도 된다)
     */
    it("[DoD-21] import 영역에 F-2~F-5 F-ID 줄이 순서대로 하나씩 있고 인접한 줄 사이에 `// ---` 구분 줄이 있다", () => {
      const lines = readPageLines();
      const report = slotReport(lines.slice(0, importAreaEnd(lines)));

      expect(report.counts, "F-ID별 F-ID 줄 개수").toEqual(EXPECTED_REPORT.counts);
      expect(report.order, "F-ID 줄 순서").toEqual(EXPECTED_REPORT.order);
      expect(report.separators, "인접한 F-ID 줄 사이의 구분 줄 개수").toEqual(
        EXPECTED_REPORT.separators,
      );
    });
  });

  describe("탭 항목 영역", () => {
    /**
     * @spec DoD-21
     * @given app/page.tsx 원문의 탭 항목 영역(CalculatorTabs에 넘길 항목 배열)을 읽는다(파일을 만들거나 고치지 않는다). F-ID 줄로 인정하는 표본은 F-2·F-3·F-4·F-5 각각의 등록 전 자리 줄 `// F-N 자리`와 등록 후 줄 끝에 꼬리표 `// F-N`을 남긴 탭 항목 줄이며, 어느 F-ID가 등록된 뒤에도 같은 판정이 유지된다. 손익 항목과 F-2 사이는 검사하지 않는다
     * @when 탭 항목 영역에서 F-2·F-3·F-4·F-5의 F-ID 줄과 그 사이 줄을 찾는다
     * @then F-2·F-3·F-4·F-5 각각의 F-ID 줄(등록 전 `// F-N 자리` 또는 등록 후 줄 끝 `// F-N`)이 정확히 하나씩 있다
     * @then F-ID 줄이 F-2 → F-3 → F-4 → F-5 순서로 놓여 있다
     * @then 인접한 두 F-ID 줄 사이의 줄들 가운데 `// ---` 구분 줄이 정확히 하나 있다(등록 줄이 여러 줄로 포맷돼도 된다)
     */
    it("[DoD-21] 탭 항목 영역에 F-2~F-5 F-ID 줄이 순서대로 하나씩 있고 인접한 줄 사이에 `// ---` 구분 줄이 있다", () => {
      const lines = readPageLines();
      const items = itemsArea(lines, importAreaEnd(lines));
      expect(items, "import 영역 뒤에 탭 항목 배열이 있다").not.toBeNull();

      const report = slotReport(items ?? []);

      expect(report.counts, "F-ID별 F-ID 줄 개수").toEqual(EXPECTED_REPORT.counts);
      expect(report.order, "F-ID 줄 순서").toEqual(EXPECTED_REPORT.order);
      expect(report.separators, "인접한 F-ID 줄 사이의 구분 줄 개수").toEqual(
        EXPECTED_REPORT.separators,
      );
    });
  });
});
