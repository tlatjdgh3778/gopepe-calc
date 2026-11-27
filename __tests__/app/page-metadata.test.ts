// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { metadata } from "@/app/page";

/** 저장소 루트. 이 파일은 `__tests__/app/` 아래에 있다. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 블록 주석과 줄 주석을 지운다(`https://`처럼 `:` 뒤의 `//`는 남긴다). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("화면 구조 — 문서 제목이 피라미딩 계산기다", () => {
  describe("홈 페이지의 문서 제목", () => {
    /**
     * @spec DoD-31
     * @given 홈 페이지(/) 모듈의 metadata를 읽는다. app/layout.tsx는 import하지 않는다
     * @when 홈 페이지 metadata의 title을 확인한다
     * @then title이 정확히 `피라미딩 계산기`다
     */
    it("[DoD-31] 홈 페이지 metadata의 title은 피라미딩 계산기다", () => {
      expect(metadata.title).toBe("피라미딩 계산기");
    });

    /**
     * @spec DoD-31
     * @given app/layout.tsx 원문을 텍스트로 읽는다(import하지 않고, 파일을 만들거나 고치지 않는다)
     * @when 루트 레이아웃 metadata의 title 설정을 확인한다
     * @then 루트 레이아웃이 페이지 title을 다른 문구로 감싸는 제목 템플릿을 두지 않는다
     */
    it("[DoD-31] 루트 레이아웃이 문서 제목을 피라미딩 계산기 외의 문구로 감싸지 않는다", () => {
      const code = stripComments(readFileSync(join(ROOT, "app/layout.tsx"), "utf8"));

      expect(/\btemplate\s*:/.test(code), "루트 레이아웃에 title.template이 없다").toBe(false);
    });
  });
});
