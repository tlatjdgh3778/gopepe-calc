// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** 저장소 루트. 이 파일은 `__tests__/repo/` 아래에 있다. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** `.claude/worktrees/` 아래의 존재하지 않는 경로 표본. */
const WORKTREE_SAMPLES = [
  ".claude/worktrees/t11-probe.txt",
  ".claude/worktrees/t11-probe-worktree/app/deep/t11-probe.ts",
] as const;

/** `.claude/worktrees/` 밖의 `.claude/` 경로 표본. */
const OUTSIDE_SAMPLES = [".claude/settings.json", ".claude/commands/probe.md"] as const;

/** `.gitignore`의 무시 규칙 줄(빈 줄·주석·`!` 부정 제외). */
function ignoreRules(): string[] {
  return readFileSync(join(ROOT, ".gitignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("!"));
}

/** 앞의 `/`·`**\/`를 뗀 규칙. */
function anchorless(rule: string): string {
  return rule.replace(/^\//, "").replace(/^\*\*\//, "");
}

/** 인덱스와 무관하게 .gitignore 규칙만으로 판정한 `git check-ignore` 종료 코드. */
function checkIgnoreStatus(path: string): number | null {
  return spawnSync("git", ["check-ignore", "--no-index", "-q", path], { cwd: ROOT }).status;
}

describe("worktree 위치 — .claude/worktrees/ 아래만 git 추적에서 빠지고 나머지 .claude/는 추적된다", () => {
  describe(".gitignore 규칙", () => {
    /**
     * @spec DoD-28
     * @given 저장소 루트의 .gitignore 원문을 읽는다(파일을 만들거나 고치지 않는다)
     * @when .claude 관련 무시 줄을 확인한다
     * @then .claude/worktrees/를 무시하는 줄이 있다
     * @then .claude/ 전체를 무시하는 줄이 없다
     */
    it("[DoD-28] .gitignore는 .claude/worktrees/만 무시하고 .claude/ 전체를 무시하지 않는다", () => {
      const rules = ignoreRules().map(anchorless);

      expect(
        rules.some((rule) => rule.replace(/(\/\*\*|\/\*|\/)$/, "") === ".claude/worktrees"),
        ".claude/worktrees/를 무시하는 줄이 있다",
      ).toBe(true);
      expect(
        rules.filter((rule) => /^\.claude(\/|\/\*|\/\*\*)?$/.test(rule)),
        ".claude/ 전체를 무시하는 줄",
      ).toEqual([]);
    });
  });

  describe("git 무시 판정", () => {
    /**
     * @spec DoD-28
     * @given .claude/worktrees/ 아래의 존재하지 않는 경로를 표본으로 하나씩 쓴다: 바로 아래 파일, worktree 이름 디렉터리 아래 깊은 경로의 파일(파일을 만들지 않는다). 판정은 인덱스 추적 여부와 무관하게 .gitignore 규칙만으로 한다
     * @when 표본마다 저장소 루트에서 git check-ignore --no-index를 실제로 실행한다
     * @then 표본마다 종료 코드가 0(무시됨)이다
     */
    it("[DoD-28] .claude/worktrees/ 아래 경로는 git check-ignore에서 무시된다", () => {
      for (const path of WORKTREE_SAMPLES) {
        expect(existsSync(join(ROOT, path)), `표본 ${path}는 존재하지 않는다`).toBe(false);
      }

      for (const path of WORKTREE_SAMPLES) {
        expect(checkIgnoreStatus(path), `${path}는 무시된다`).toBe(0);
      }
    });

    /**
     * @spec DoD-28
     * @given .claude/worktrees/ 밖의 .claude/ 경로를 표본으로 하나씩 쓴다: .claude/settings.json, 존재하지 않는 .claude/commands/probe.md(파일을 만들거나 고치지 않는다). 판정은 인덱스 추적 여부와 무관하게 .gitignore 규칙만으로 한다(예: .claude/* + !.claude/settings.json 같은 넓은 무시를 걸러낸다)
     * @when 표본마다 저장소 루트에서 git check-ignore --no-index를 실제로 실행한다
     * @then 표본마다 종료 코드가 1(무시되지 않음)이다
     */
    it("[DoD-28] .claude/worktrees/ 밖의 .claude/ 경로(.claude/settings.json, .claude/commands/probe.md)는 git check-ignore에서 무시되지 않는다", () => {
      expect(
        existsSync(join(ROOT, ".claude/commands/probe.md")),
        "표본 probe.md는 존재하지 않는다",
      ).toBe(false);

      for (const path of OUTSIDE_SAMPLES) {
        expect(checkIgnoreStatus(path), `${path}는 무시되지 않는다`).toBe(1);
      }
    });
  });

  describe("git 추적 상태", () => {
    /**
     * @spec DoD-28
     * @given 저장소의 git 인덱스를 읽는다(파일을 만들거나 고치지 않는다)
     * @when .claude/worktrees/ 아래의 추적 파일 목록을 확인한다
     * @then 추적되는 파일이 하나도 없다
     */
    it("[DoD-28] .claude/worktrees/ 아래에 git이 추적하는 파일이 없다", () => {
      const tracked = execFileSync("git", ["ls-files", "--", ".claude/worktrees"], {
        cwd: ROOT,
        encoding: "utf8",
      });

      expect(tracked.trim()).toBe("");
    });
  });
});
