// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** 저장소 루트. 이 파일은 `__tests__/repo/` 아래에 있다. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const PYRAMID_DIR = "components/pyramid";
const POPUP_FILES = ["components/ui/dialog.tsx", "components/ui/select.tsx"] as const;
const TRANSITION_FILES = ["components/ui/button.tsx", "components/ui/toggle.tsx"] as const;
const GLOBALS_CSS = "app/globals.css";
const SUMMARY_PANEL = "components/pyramid/summary-panel.tsx";

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/** 블록 주석과 줄 주석을 지운다(`https://`처럼 `:` 뒤의 `//`는 남긴다). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** CSS 블록 주석을 지운다. */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 코드 안 문자열 리터럴(`"…"`, `'…'`, `` `…` ``)의 내용. */
function stringLiterals(code: string): string[] {
  return [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

/** 문자열 리터럴을 공백으로 나눈 클래스 토큰. */
function classTokens(relative: string): string[] {
  return stringLiterals(stripComments(read(relative)))
    .flatMap((literal) => literal.split(/\s+/))
    .filter((token) => token !== "");
}

type ParsedClass = { token: string; variants: string[]; utility: string };

/** 클래스 토큰을 변형 접두사 사슬과 유틸리티로 나눈다(대괄호 안의 `:`는 나누지 않는다). */
function parseClass(token: string): ParsedClass {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of token) {
    if (char === "[" || char === "(") depth += 1;
    if (char === "]" || char === ")") depth -= 1;
    if (char === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  return { token, variants: parts, utility: current };
}

function parsedClasses(relative: string): ParsedClass[] {
  return classTokens(relative).map(parseClass);
}

/** `components/pyramid/` 아래의 소스 파일(저장소 루트 기준 경로). */
function pyramidFiles(): string[] {
  return readdirSync(join(ROOT, PYRAMID_DIR), { recursive: true, encoding: "utf8" })
    .map((entry) => posix.join(PYRAMID_DIR, entry.split("\\").join("/")))
    .filter((relative) => /\.(tsx?|jsx?)$/.test(relative) && !/\.test\./.test(relative))
    .sort();
}

/** lucide-react에서 값으로 import한 이름. */
function lucideImports(code: string): string[] {
  const names: string[] = [];
  for (const match of code.matchAll(
    /\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s+["']lucide-react["']/g,
  )) {
    if (match[1]) continue;
    for (const part of match[2].split(",")) {
      const entry = part.trim();
      if (entry === "" || entry.startsWith("type ")) continue;
      const alias = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(entry);
      names.push(alias ? alias[1] : entry.split(/\s+/)[0]);
    }
  }
  return names;
}

/** 글리프 하나와 그 우회 표기(`\u` escape, HTML 엔티티)를 찾는 정규식 원문. */
function glyphPattern(glyph: string): string {
  const codePoint = glyph.codePointAt(0) as number;
  const hex = codePoint.toString(16);
  const hex4 = hex.padStart(4, "0");
  const literal = glyph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `(?:${literal}|\\\\u${hex4}|\\\\u\\{0*${hex}\\}|&#x0*${hex};|&#0*${codePoint};)`;
}

/** 다른 텍스트와 붙어 있어도 아이콘 용도로 보는 글리프. */
const STRICT_GLYPHS = ["↻", "⌃", "⌄", "＋", "ⓘ", "✕"] as const;
const TIMES = "×";

/**
 * opening이 가리키는 `<Tag`부터 opening 태그 끝까지 걷는다.
 * `{…}` 안(예: `render={<Button … />}`)의 `>`는 태그 끝으로 보지 않는다.
 */
function openingTagEnd(code: string, opening: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = opening + 1; i < code.length; i += 1) {
    const char = code[i];
    if (quote) {
      if (char === quote && code[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (depth === 0 && char === ">") {
      return { end: i + 1, selfClosing: code[i - 1] === "/" };
    }
  }
  return { end: code.length, selfClosing: true };
}

/** opening에서 시작하는 요소의 끝(닫는 태그 뒤) 위치. */
function elementEnd(code: string, opening: number, tag: string): number {
  const first = openingTagEnd(code, opening);
  if (first.selfClosing) return first.end;
  const pattern = new RegExp(`<${tag}\\b|</${tag}\\s*>`, "g");
  pattern.lastIndex = first.end;
  let depth = 1;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return match.index + match[0].length;
    } else {
      const nested = openingTagEnd(code, match.index);
      if (!nested.selfClosing) depth += 1;
      pattern.lastIndex = nested.end;
    }
  }
  return code.length;
}

/** anchor 위치를 감싸는 가장 안쪽 tags 요소의 원문. 없으면 null. */
function enclosingElement(code: string, anchor: number, tags: readonly string[]): string | null {
  const pattern = new RegExp(`<(${tags.join("|")})\\b`, "g");
  const openings = [...code.matchAll(pattern)].filter((match) => match.index <= anchor).reverse();
  for (const match of openings) {
    const end = elementEnd(code, match.index, match[1]);
    if (end > anchor) return code.slice(match.index, end);
  }
  return null;
}

type IconPlace = { name: string; file: string; anchor: RegExp; tags: readonly string[] };

/** 글리프를 쓰던 자리. anchor는 그 자리를 가리키는 원문, tags는 자리를 이루는 요소다. */
const ICON_PLACES: readonly IconPlace[] = [
  {
    name: "초기화 버튼",
    file: "components/pyramid/pyramid-terminal.tsx",
    anchor: />\s*(초기화)\s*</,
    tags: ["Button", "button"],
  },
  {
    name: "수수료 설정 펼침 버튼",
    file: "components/pyramid/setup-panel.tsx",
    anchor: />\s*(수수료 설정)/,
    tags: ["Button", "button"],
  },
  {
    name: "단계 삭제 버튼",
    file: "components/pyramid/step-editor.tsx",
    anchor: /(stepRemoveLabel)\(/,
    tags: ["Button", "button"],
  },
  {
    name: "단계 추가 버튼",
    file: "components/pyramid/step-editor.tsx",
    anchor: />\s*(추가 진입 단계)\s*</,
    tags: ["Button", "button"],
  },
  {
    name: "계산 기준 버튼",
    file: "components/pyramid/method-dialog.tsx",
    anchor: /(<DialogTrigger)\b/,
    tags: ["DialogTrigger"],
  },
  {
    name: "다이얼로그 닫기 버튼",
    file: "components/pyramid/method-dialog.tsx",
    anchor: /(<DialogClose)\b/,
    tags: ["DialogClose"],
  },
  {
    name: "손절 안내",
    file: "components/pyramid/stop-loss-panel.tsx",
    anchor: /(\{STOP_NOTE\})/,
    tags: ["p", "div", "span"],
  },
];

/** 변형 사슬에 motion-safe가 있는지. */
function isMotionSafe(parsed: ParsedClass): boolean {
  return parsed.variants.includes("motion-safe");
}

/** 애니메이션을 끄는 유틸리티. */
const DISABLING_UTILITY =
  /^(?:animate-none|transition-none|duration-0|\[animation:\s*none\]|\[animation-name:\s*none\])$/;

/** all을 대상으로 하는 transition 표기. */
const TRANSITION_ALL =
  /^(?:transition-all|transition-\[\s*all\b.*|\[transition:\s*all\b.*|\[transition-property:\s*all\b.*)$/;

/** 속성을 지정한 transition 유틸리티. */
const TRANSITION_PROPERTIES =
  /^(?:transition-(?:colors|opacity|shadow|transform)|transition-\[(?!\s*all\b)[^\]]+\])$/;

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
/** Tailwind 기본 팔레트 색 유틸리티(예: amber-500, red-400/20). */
const PALETTE_UTILITY = new RegExp(`(?:^|-)(?:${PALETTE})-\\d{2,3}(?:\\/\\d+)?$`);
/** 색 값을 담은 임의 값 클래스(예: bg-[#…], text-[rgb(…)]). */
const ARBITRARY_COLOR = /-\[(?:#|(?:rgba?|hsla?|oklch|oklab)\(|color:)/;
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab)\(/;
/** warning 계열 토큰 이름의 색 유틸리티. 1번은 접두사, 2번은 토큰 이름이다. */
const WARNING_UTILITY = /^(bg|border|text)-(warning(?:-[a-z]+)*)(?:\/\d+)?$/;

describe("화면 다듬기 — 움직임·아이콘·전환·경고 색이 일관된 규칙을 따른다", () => {
  describe("동작 줄이기 설정에서 팝업이 확대·축소하지 않는다", () => {
    /**
     * @spec DoD-49
     * @given components/ui/dialog.tsx와 components/ui/select.tsx 원문을 하나씩 읽는다(파일을 만들거나 고치지 않는다). 확대·축소 클래스는 zoom-in·zoom-out 계열(예: zoom-in-95, zoom-out-95) 유틸리티이고, 페이드가 아닌 진입·퇴장 움직임 클래스는 slide-in·slide-out 계열(예: slide-in-from-top-2, data-[side=bottom]:slide-in-from-top-2) 유틸리티다. 변형 접두사 사슬(예: data-open:, data-closed:)과 함께 붙어 있어도 하나의 클래스로 본다. 실제 애니메이션은 animate-in·animate-out이 걸고 fade-in-0 등은 값만 정한다. 모션 줄이기와 무관한 기존 data-[align-trigger=true]:animate-none은 허용한다
     * @when 각 파일의 클래스 문자열에서 zoom 클래스, slide 클래스, fade 클래스, animate-in·animate-out 클래스, 애니메이션을 끄는 클래스를 확인한다
     * @then 두 파일의 모든 zoom-in·zoom-out 클래스는 변형 접두사 사슬에 motion-safe:가 들어 있다
     * @then motion-safe: 없이 붙은 zoom-in·zoom-out 클래스가 없다
     * @then slide-in·slide-out 계열(페이드가 아닌 진입·퇴장 움직임) 클래스도 motion-safe: 아래에만 있다
     * @then 두 파일의 팝업에 fade-in·fade-out 클래스가 motion-safe: 없이도 남아 있어 prefers-reduced-motion: reduce에서 페이드는 한다
     * @then 두 파일의 팝업에 animate-in·animate-out 클래스가 motion-safe: 없이 남아 있다
     * @then motion-reduce: 변형이 붙은 animate-none 등 애니메이션을 끄는 클래스가 없다
     */
    it("[DoD-49] 다이얼로그와 Select 팝업의 확대·축소·슬라이드 클래스는 motion-safe: 아래에만 있고 페이드는 남는다", () => {
      for (const file of POPUP_FILES) {
        const classes = parsedClasses(file);

        const unsafeZoom = classes.filter(
          (parsed) => /^zoom-(?:in|out)\b/.test(parsed.utility) && !isMotionSafe(parsed),
        );
        expect(
          unsafeZoom.map((parsed) => parsed.token),
          `${file}: motion-safe: 없이 붙은 zoom 클래스`,
        ).toEqual([]);

        const unsafeSlide = classes.filter(
          (parsed) => /^slide-(?:in|out)\b/.test(parsed.utility) && !isMotionSafe(parsed),
        );
        expect(
          unsafeSlide.map((parsed) => parsed.token),
          `${file}: motion-safe: 없이 붙은 slide 클래스`,
        ).toEqual([]);

        for (const utility of ["fade-in", "fade-out"]) {
          expect(
            classes.some(
              (parsed) =>
                (parsed.utility === utility || parsed.utility.startsWith(`${utility}-`)) &&
                !isMotionSafe(parsed),
            ),
            `${file}: ${utility} 클래스가 motion-safe: 없이 있다`,
          ).toBe(true);
        }

        for (const utility of ["animate-in", "animate-out"]) {
          expect(
            classes.some((parsed) => parsed.utility === utility && !isMotionSafe(parsed)),
            `${file}: ${utility} 클래스가 motion-safe: 없이 있다`,
          ).toBe(true);
        }

        const reduceDisabling = classes.filter(
          (parsed) =>
            parsed.variants.includes("motion-reduce") && DISABLING_UTILITY.test(parsed.utility),
        );
        expect(
          reduceDisabling.map((parsed) => parsed.token),
          `${file}: motion-reduce:로 애니메이션을 끄는 클래스`,
        ).toEqual([]);
      }
    });
  });

  describe("아이콘을 lucide-react로 그린다", () => {
    /**
     * @spec DoD-51
     * @given components/pyramid/ 아래 소스 파일 원문을 하나씩 읽고 주석을 지운다(파일을 만들거나 고치지 않는다). 표본 글리프는 ↻ ⌃ ⌄ × ＋ ⓘ ✕(U+2715)다. ↻ ⌃ ⌄ ＋ ⓘ ✕는 주석 밖 어디에 나와도(다른 텍스트와 붙어 있어도, 예: "↻ 초기화", "ⓘ 안내") 아이콘 용도로 판정한다. 우회 표기도 같은 글리프로 보고 위반으로 판정한다: 문자열의 \u escape(예: "\u21bb"), JSX 문자열 리터럴(예: {"↻"}), HTML 엔티티(예: &#x21bb;, &#8635;). ✕의 "\u2715"·{"✕"}·&#x2715;·&#10005;도 같다. ×만 홀로 쓰인 경우를 아이콘 용도로 판정한다: JSX 텍스트 노드나 문자열 리터럴(삼항 분기 포함)의 내용이 공백을 빼면 × 하나뿐인 경우다. 숫자·단어와 붙어 문장·수식·표시값을 이루는 곱셈 기호 ×(예: 계산 기준 다이얼로그의 "재투입 비율 × 최초 레버리지", 실효 레버리지 표시 `12.81×`, 템플릿 문자열 `${n}×`)는 아이콘 용도가 아니다. 입력란 단위 표시(`WithUnit`의 unit 값으로 전달되는 `×`·`%`, 예: unit="×")도 아이콘이 아니다. 그 밖의 자리에 홀로 쓰인 ×, 예를 들어 leverage-control.tsx에서 입력란 밖에 단독으로 남은 `<span>×</span>`는 아이콘 용도로 판정한다
     * @when 각 파일에서 아이콘 용도의 표본 글리프와 lucide-react import를 확인한다
     * @then components/pyramid/ 어느 파일에도 주석 밖에 ↻ ⌃ ⌄ ＋ ⓘ ✕가 없다(다른 텍스트와 붙은 형태 포함)
     * @then components/pyramid/ 어느 파일에도 아이콘 용도로 홀로 쓰인 ×가 없다
     * @then components/pyramid/ 아래 파일 중 하나 이상이 lucide-react에서 아이콘을 import한다
     * @then 글리프를 쓰던 자리마다 lucide-react 아이콘 컴포넌트가 있다: pyramid-terminal.tsx의 초기화 버튼, setup-panel.tsx의 수수료 설정 펼침 버튼, step-editor.tsx의 단계 삭제 버튼과 단계 추가 버튼, method-dialog.tsx의 계산 기준 버튼과 다이얼로그 닫기 버튼, stop-loss-panel.tsx의 손절 안내
     * @then 레버리지 입력란의 단위 `×`는 수수료율·목표 수익률의 `%`처럼 입력란 안 오른쪽 단위(`WithUnit`의 unit 값)로 전달된다
     */
    it("[DoD-51] 피라미딩 화면은 아이콘을 lucide-react로 그리고 아이콘 용도의 유니코드 글리프를 쓰지 않는다", () => {
      const files = pyramidFiles();
      expect(files.length, `${PYRAMID_DIR}/ 아래 소스 파일이 있다`).toBeGreaterThan(0);

      const strictPattern = new RegExp(STRICT_GLYPHS.map(glyphPattern).join("|"), "gi");
      const timesForms = new RegExp(glyphPattern(TIMES), "gi");

      const strictHits: string[] = [];
      const timesHits: string[] = [];
      for (const file of files) {
        const code = stripComments(read(file));

        for (const match of code.matchAll(strictPattern)) {
          strictHits.push(`${file}: ${match[0]}`);
        }

        const normalized = code
          .replace(timesForms, TIMES)
          .replace(
            /(<WithUnit\b[^>]*?)\bunit=(?:"\s*[×%]\s*"|'\s*[×%]\s*'|\{\s*(["'`])\s*[×%]\s*\2\s*\})/g,
            "$1",
          );
        for (const match of normalized.matchAll(/>\s*×\s*<|(["'`])\s*×\s*\1/g)) {
          timesHits.push(`${file}: ${match[0]}`);
        }
      }
      expect(strictHits, "주석 밖의 ↻ ⌃ ⌄ ＋ ⓘ ✕(우회 표기 포함)").toEqual([]);
      expect(timesHits, "아이콘 용도로 홀로 쓰인 ×").toEqual([]);

      expect(
        files.some((file) => lucideImports(stripComments(read(file))).length > 0),
        `${PYRAMID_DIR}/ 아래 파일이 lucide-react에서 아이콘을 import한다`,
      ).toBe(true);

      for (const place of ICON_PLACES) {
        const code = stripComments(read(place.file));
        const anchor = place.anchor.exec(code);
        expect(anchor, `${place.file}에서 ${place.name}을 찾는다`).not.toBeNull();
        const index =
          (anchor as RegExpExecArray).index +
          (anchor as RegExpExecArray)[0].indexOf((anchor as RegExpExecArray)[1]);
        const element = enclosingElement(code, index, place.tags);
        expect(element, `${place.file}의 ${place.name} 요소`).not.toBeNull();

        const icons = lucideImports(code);
        expect(
          icons.some((icon) => new RegExp(`<${icon}\\b`).test(element as string)),
          `${place.file}의 ${place.name}에 lucide-react 아이콘 컴포넌트가 있다`,
        ).toBe(true);
      }

      const leverage = stripComments(read("components/pyramid/leverage-control.tsx"));
      const unitMatch =
        /<WithUnit\b[^>]*?\bunit=(?:"\s*×\s*"|'\s*×\s*'|\{\s*(["'`])\s*×\s*\1\s*\})/.exec(leverage);
      expect(unitMatch, "레버리지 단위 ×를 WithUnit의 unit 값으로 전달한다").not.toBeNull();
      const unitElement = enclosingElement(leverage, (unitMatch as RegExpExecArray).index, [
        "WithUnit",
      ]);
      expect(
        /<(?:Input|input)\b/.test(unitElement ?? ""),
        "레버리지 단위를 담은 WithUnit이 레버리지 입력란을 감싼다",
      ).toBe(true);
    });
  });

  describe("버튼·토글이 바뀌는 속성만 전환한다", () => {
    /**
     * @spec DoD-53
     * @given components/ui/button.tsx와 components/ui/toggle.tsx 원문을 하나씩 읽고 주석을 지운다(파일을 만들거나 고치지 않는다)
     * @when 각 파일의 클래스 문자열에서 transition 유틸리티를 확인한다
     * @then 두 파일 어디에도 all을 대상으로 하는 transition 표기(transition-all, transition-[all…], [transition:all…], [transition-property:all])가 없다(변형 접두사가 붙은 형태 포함)
     * @then 각 파일에 속성을 지정한 transition 유틸리티(예: transition-[color,…], transition-colors)가 하나 이상 있다
     */
    it("[DoD-53] 버튼과 토글은 transition-all을 쓰지 않는다", () => {
      for (const file of TRANSITION_FILES) {
        const classes = parsedClasses(file);

        const allTransitions = classes.filter((parsed) => TRANSITION_ALL.test(parsed.utility));
        expect(
          allTransitions.map((parsed) => parsed.token),
          `${file}: all을 대상으로 하는 transition 표기`,
        ).toEqual([]);

        expect(
          classes.some((parsed) => TRANSITION_PROPERTIES.test(parsed.utility)),
          `${file}: 속성을 지정한 transition 유틸리티가 있다`,
        ).toBe(true);
      }
    });
  });

  describe("위험 상자 색은 경고 토큰으로 정의한다", () => {
    /**
     * @spec DoD-56
     * @given app/globals.css 원문을 읽는다(파일을 만들거나 고치지 않는다)
     * @when 정의된 CSS 사용자 속성을 확인한다
     * @then --warning 계열 경고 토큰(--warning으로 시작하는 사용자 속성)이 하나 이상 값과 함께 정의된다
     */
    it("[DoD-56] globals.css에 --warning 계열 경고 토큰이 정의된다", () => {
      const css = stripCssComments(read(GLOBALS_CSS));
      const definitions = [
        ...css.matchAll(/(?<![\w-])(--warning[\w-]*)\s*:\s*([^;]*?)\s*;/g),
      ].filter((match) => match[2] !== "");

      expect(
        definitions.map((match) => match[1]),
        `${GLOBALS_CSS}에 값과 함께 정의된 --warning 계열 토큰`,
      ).not.toEqual([]);
    });

    /**
     * @spec DoD-56
     * @given components/pyramid/summary-panel.tsx 원문을 읽고 주석을 지운다. app/globals.css 원문도 읽는다(두 파일 모두 만들거나 고치지 않는다). 직접 쓴 색 값 표본은 16진 색(#rgb·#rrggbb 등), rgb()·rgba()·hsl()·hsla()·oklch()·oklab() 함수, Tailwind 기본 팔레트 색 유틸리티(예: amber-500, red-400/20), 색을 담은 임의 값 클래스(예: bg-[#…], text-[rgb(…)])다
     * @when 위험 상자를 그리는 클래스와 스타일의 색 지정을 확인한다
     * @then 표본의 어느 색 값도 summary-panel.tsx에 없다
     * @then 위험 상자의 색 지정은 warning 계열 토큰 이름의 유틸리티(예: bg-warning…, border-warning…, text-warning…)를 쓴다
     * @then summary-panel이 쓰는 warning 계열 유틸리티마다 globals.css의 @theme inline에 대응하는 --color-warning… 정의가 있다
     */
    it("[DoD-56] 포지션 요약의 위험 상자는 색 값을 직접 쓰지 않고 경고 토큰을 쓴다", () => {
      const code = stripComments(read(SUMMARY_PANEL));
      expect(HEX_COLOR.test(code), `${SUMMARY_PANEL}에 16진 색이 없다`).toBe(false);
      expect(COLOR_FUNCTION.test(code), `${SUMMARY_PANEL}에 색 함수가 없다`).toBe(false);

      const classes = parsedClasses(SUMMARY_PANEL);
      const directColors = classes.filter(
        (parsed) => PALETTE_UTILITY.test(parsed.utility) || ARBITRARY_COLOR.test(parsed.utility),
      );
      expect(
        directColors.map((parsed) => parsed.token),
        `${SUMMARY_PANEL}의 팔레트 색·임의 값 색 클래스`,
      ).toEqual([]);

      const warningUtilities = classes
        .map((parsed) => WARNING_UTILITY.exec(parsed.utility))
        .filter((match): match is RegExpExecArray => match !== null);
      expect(
        warningUtilities.some((match) => match[1] === "bg"),
        "위험 상자 배경이 bg-warning… 유틸리티다",
      ).toBe(true);
      expect(
        warningUtilities.some((match) => match[1] === "text"),
        "위험 상자 글자색이 text-warning… 유틸리티다",
      ).toBe(true);

      const css = stripCssComments(read(GLOBALS_CSS));
      const theme = /@theme\s+inline\s*\{([\s\S]*?)\n\}/.exec(css);
      expect(theme, `${GLOBALS_CSS}에 @theme inline 블록이 있다`).not.toBeNull();
      const themeBody = (theme as RegExpExecArray)[1];
      for (const name of new Set(warningUtilities.map((match) => match[2]))) {
        expect(
          new RegExp(`(?<![\\w-])--color-${name}\\s*:\\s*[^;\\s][^;]*;`).test(themeBody),
          `@theme inline에 --color-${name} 정의가 있다`,
        ).toBe(true);
      }
    });
  });
});
