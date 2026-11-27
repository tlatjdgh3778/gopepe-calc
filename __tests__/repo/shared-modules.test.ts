// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** 저장소 루트. 이 파일은 `__tests__/repo/` 아래에 있다. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const INPUT_MODULE = "lib/input.ts";
const FIELDS_DIR = "components/fields";
const PYRAMID_DIR = "components/pyramid";
const RESULT_ROW_MODULE = "components/result-row.tsx";

/** 스펙 DoD-43의 남는 공용 모듈 `lib/input.ts` 이름. */
const INPUT_HELPERS = [
  "toNumber",
  "isPositive",
  "LEVERAGE_PATTERN",
  "DECIMAL_PATTERN",
  "filtered",
] as const;

/** 스펙 DoD-43의 남는 공용 모듈 `components/fields/` 5종. */
const FIELD_COMPONENTS = [
  "SymbolSelect",
  "SideToggle",
  "DecimalField",
  "SignedDecimalField",
  "FieldWarning",
] as const;

/** 피라미딩 화면이 직접 import해야 하는 필드 컴포넌트(FieldWarning은 따로 판정). */
const PYRAMID_FIELD_IMPORTS = [
  "SymbolSelect",
  "SideToggle",
  "DecimalField",
  "SignedDecimalField",
] as const;

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/** 블록 주석과 줄 주석을 지운다(`https://`처럼 `:` 뒤의 `//`는 남긴다). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 값으로 export되는 이름(type·interface export는 제외). */
function exportedNames(source: string): Set<string> {
  const code = stripComments(source);
  const names = new Set<string>();
  for (const match of code.matchAll(
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }
  for (const match of code.matchAll(/\bexport\s+\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const entry = part.trim();
      if (entry === "" || entry.startsWith("type ")) continue;
      const alias = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(entry);
      names.add(alias ? alias[1] : entry);
    }
  }
  return names;
}

type ImportDeclaration = { specifier: string; names: string[] };

/** 값 import 선언 목록. `names`는 가져오는 쪽 모듈의 export 이름이다(type import 제외). */
function importsOf(source: string): ImportDeclaration[] {
  const code = stripComments(source);
  const declarations: ImportDeclaration[] = [];
  for (const match of code.matchAll(
    /\bimport\s+(type\s+)?([^;"'`]*?)\s+from\s+["']([^"']+)["']/g,
  )) {
    if (match[1]) continue;
    const clause = match[2];
    const names: string[] = [];
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const entry = part.trim();
        if (entry === "" || entry.startsWith("type ")) continue;
        names.push(entry.split(/\s+as\s+/)[0].trim());
      }
    }
    declarations.push({ specifier: match[3], names });
  }
  return declarations;
}

/** import 경로를 저장소 루트 기준 모듈 경로(확장자·`/index` 없음)로 바꾼다. 패키지면 null. */
function resolveModule(specifier: string, importer: string): string | null {
  let path: string;
  if (specifier.startsWith("@/")) path = specifier.slice(2);
  else if (specifier.startsWith(".")) path = posix.join(posix.dirname(importer), specifier);
  else return null;
  return path.replace(/\.(tsx?|jsx?)$/, "").replace(/\/index$/, "");
}

function isFieldsModule(target: string | null): boolean {
  return target === FIELDS_DIR || (target?.startsWith(`${FIELDS_DIR}/`) ?? false);
}

/** importer가 matches를 만족하는 모듈에서 가져오는 이름 목록. */
function namesImportedFrom(
  importer: string,
  matches: (target: string | null) => boolean,
): Set<string> {
  const names = new Set<string>();
  for (const declaration of importsOf(read(importer))) {
    if (matches(resolveModule(declaration.specifier, importer))) {
      for (const name of declaration.names) names.add(name);
    }
  }
  return names;
}

/** directory 아래의 소스 파일(저장소 루트 기준 경로, 테스트 파일 제외). */
function sourceFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { recursive: true, encoding: "utf8" })
    .map((entry) => posix.join(directory, entry.split("\\").join("/")))
    .filter((relative) => /\.(tsx?|jsx?)$/.test(relative) && !/\.test\./.test(relative))
    .sort();
}

/** 파일 안에 name의 로컬 선언(function·const·let·var·class)이 있는지 본다. */
function definesLocally(source: string, name: string): boolean {
  return new RegExp(`\\b(?:function\\*?|const|let|var|class)\\s+${name}\\b`).test(
    stripComments(source),
  );
}

/** JSX 텍스트로 ⚠ 문구를 직접 담은 요소(`>⚠ …`, `>{"⚠ …"}` 등). */
const WARNING_ELEMENT = />\s*(?:\{\s*["'`])?\s*(?:⚠|\\u26[aA]0|&#9888;|&#x26[aA]0;)/;

describe("공용 모듈 — 피라미딩 화면이 남는 입력 부품을 가져다 쓴다", () => {
  describe("남는 공용 모듈이 있다", () => {
    /**
     * @spec DoD-43
     * @given 저장소의 lib/input.ts 원문을 읽는다(파일을 만들거나 고치지 않는다). 표본은 toNumber, isPositive, LEVERAGE_PATTERN, DECIMAL_PATTERN, 정규식에 맞을 때만 값을 받는 onChange 헬퍼 filtered(pattern, set)다
     * @when lib/input.ts의 export를 확인한다
     * @then lib/input.ts 파일이 있다
     * @then 표본의 각 이름이 lib/input.ts에서 export된다
     */
    it("[DoD-43] lib/input.ts가 있고 입력 변환·판정 헬퍼, 정규식, filtered를 export한다", () => {
      expect(existsSync(join(ROOT, INPUT_MODULE)), `${INPUT_MODULE} 파일이 있다`).toBe(true);

      const exported = exportedNames(read(INPUT_MODULE));
      for (const name of INPUT_HELPERS) {
        expect(exported.has(name), `${INPUT_MODULE}가 ${name}을 export한다`).toBe(true);
      }
    });

    /**
     * @spec DoD-43
     * @given 저장소의 components/fields/ 원문을 읽는다(파일을 만들거나 고치지 않는다). 표본은 남는 필드 5종 SymbolSelect, SideToggle, DecimalField, SignedDecimalField, FieldWarning이다
     * @when components/fields/의 export를 확인한다
     * @then components/fields/ 디렉터리가 있다
     * @then 표본의 각 컴포넌트가 components/fields/에서 export된다
     */
    it("[DoD-43] components/fields/가 있고 SymbolSelect·SideToggle·DecimalField·SignedDecimalField·FieldWarning을 export한다", () => {
      const directory = join(ROOT, FIELDS_DIR);
      expect(
        existsSync(directory) && statSync(directory).isDirectory(),
        `${FIELDS_DIR}/ 디렉터리가 있다`,
      ).toBe(true);

      const exported = new Set(
        sourceFiles(FIELDS_DIR).flatMap((file) => [...exportedNames(read(file))]),
      );
      for (const name of FIELD_COMPONENTS) {
        expect(exported.has(name), `${FIELDS_DIR}/가 ${name}을 export한다`).toBe(true);
      }
    });
  });

  describe("피라미딩 화면이 공용 모듈을 쓴다", () => {
    /**
     * @spec DoD-43
     * @given components/pyramid/ 아래 소스 파일 원문을 읽는다(파일을 만들거나 고치지 않는다)
     * @when components/pyramid/ 파일들의 import와 로컬 정의를 확인한다
     * @then components/pyramid/가 SymbolSelect·SideToggle·DecimalField·SignedDecimalField를 components/fields/에서 import한다(FieldWarning은 components/pyramid/가 직접 import하거나, components/pyramid/가 쓰는 필드 컴포넌트 안에서 FieldWarning을 쓰면 된다)
     * @then components/pyramid/가 lib/input.ts의 헬퍼를 import한다
     * @then lib/input.ts의 헬퍼(toNumber, isPositive, LEVERAGE_PATTERN, DECIMAL_PATTERN, filtered)를 components/pyramid/ 파일 안에서 직접 정의하지 않는다
     * @then components/pyramid/ 파일 안에서 FieldWarning이나 경고 문구 요소(⚠ 문구를 담은 요소)를 직접 정의하지 않는다
     */
    it("[DoD-43] 피라미딩 화면이 components/fields/와 lib/input.ts를 import하고 공용 헬퍼·경고 요소를 직접 정의하지 않는다", () => {
      const pyramidFiles = sourceFiles(PYRAMID_DIR);
      expect(pyramidFiles.length, `${PYRAMID_DIR}/ 아래 소스 파일이 있다`).toBeGreaterThan(0);

      const fromFields = new Set(
        pyramidFiles.flatMap((file) => [...namesImportedFrom(file, isFieldsModule)]),
      );
      for (const name of PYRAMID_FIELD_IMPORTS) {
        expect(
          fromFields.has(name),
          `${PYRAMID_DIR}/가 ${name}을 ${FIELDS_DIR}/에서 import한다`,
        ).toBe(true);
      }

      const usedFields = new Set<string>(
        PYRAMID_FIELD_IMPORTS.filter((name) => fromFields.has(name)),
      );
      const fieldWarningInUsedField = sourceFiles(FIELDS_DIR).some((file) => {
        const fieldSource = read(file);
        const definesUsedField = [...exportedNames(fieldSource)].some((name) =>
          usedFields.has(name),
        );
        return definesUsedField && /<FieldWarning\b/.test(stripComments(fieldSource));
      });
      expect(
        fromFields.has("FieldWarning") || fieldWarningInUsedField,
        `FieldWarning을 ${PYRAMID_DIR}/가 직접 import하거나, ${PYRAMID_DIR}/가 쓰는 필드 컴포넌트 안에서 쓴다`,
      ).toBe(true);

      const fromInput = new Set(
        pyramidFiles.flatMap((file) => [
          ...namesImportedFrom(file, (target) => target === "lib/input"),
        ]),
      );
      expect(
        INPUT_HELPERS.some((name) => fromInput.has(name)),
        `${PYRAMID_DIR}/가 ${INPUT_MODULE}의 헬퍼를 import한다`,
      ).toBe(true);

      for (const file of pyramidFiles) {
        const source = read(file);
        for (const name of INPUT_HELPERS) {
          expect(definesLocally(source, name), `${file}가 ${name}을 직접 정의하지 않는다`).toBe(
            false,
          );
        }
        expect(
          definesLocally(source, "FieldWarning"),
          `${file}가 FieldWarning을 직접 정의하지 않는다`,
        ).toBe(false);
        expect(
          WARNING_ELEMENT.test(stripComments(source)),
          `${file}가 ⚠ 문구를 담은 요소를 직접 정의하지 않는다`,
        ).toBe(false);
      }
    });
  });

  describe("cn을 @/lib/utils에서 가져온다", () => {
    /**
     * @spec DoD-43
     * @given components/pyramid/ 아래 파일, components/fields/ 아래 파일, components/result-row.tsx 원문을 하나씩 읽는다(파일을 만들거나 고치지 않는다)
     * @when 각 파일의 cn import를 확인한다
     * @then cn을 쓰는 파일은 cn을 "@/lib/utils"에서 import한다
     * @then 어느 파일에도 from "cn" import가 없다
     */
    it('[DoD-43] 피라미딩 화면과 공용 모듈은 cn을 @/lib/utils에서 가져오고 "cn" 패키지를 직접 import하지 않는다', () => {
      const pyramidFiles = sourceFiles(PYRAMID_DIR);
      const fields = sourceFiles(FIELDS_DIR);
      expect(pyramidFiles.length, `${PYRAMID_DIR}/ 아래 소스 파일이 있다`).toBeGreaterThan(0);
      expect(fields.length, `${FIELDS_DIR}/ 아래 소스 파일이 있다`).toBeGreaterThan(0);
      expect(existsSync(join(ROOT, RESULT_ROW_MODULE)), `${RESULT_ROW_MODULE} 파일이 있다`).toBe(
        true,
      );

      const files = [...pyramidFiles, ...fields, RESULT_ROW_MODULE];
      const usesCnWithoutUtils = files.filter(
        (file) =>
          /\bcn\s*\(/.test(stripComments(read(file))) &&
          !namesImportedFrom(file, (target) => target === "lib/utils").has("cn"),
      );
      const importsCnPackage = files.filter((file) =>
        /\bfrom\s+["']cn["']/.test(stripComments(read(file))),
      );

      expect(usesCnWithoutUtils, "cn을 쓰면서 @/lib/utils에서 가져오지 않는 파일").toEqual([]);
      expect(importsCnPackage, 'from "cn"이 있는 파일').toEqual([]);
    });
  });
});
