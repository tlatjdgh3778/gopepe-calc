// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlaywrightTestConfig } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";

/** 저장소 루트. 이 파일은 `__tests__/repo/` 아래에 있다. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

type Env = Record<string, string | undefined>;

function scriptOf(name: "dev" | "start"): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const script = pkg.scripts?.[name];
  expect(script, `package.json에 ${name} 스크립트가 있다`).toBeTypeOf("string");
  return script as string;
}

/**
 * POSIX 셸의 변수 확장(`$VAR`, `${VAR}`, `${VAR:-기본값}`, `${VAR-기본값}`)만 env로 풀어 쓴다.
 * 실제 셸을 띄우지 않고 스크립트 원문에서 포트 값을 읽기 위한 것이다.
 */
function expandShell(command: string, env: Env): string {
  return command.replace(
    /\$\{([A-Za-z_]\w*)(?:(:?)-([^}]*))?\}|\$([A-Za-z_]\w*)/g,
    (
      _match,
      braced: string | undefined,
      colon: string | undefined,
      fallback: string | undefined,
      bare: string | undefined,
    ) => {
      const value = env[(braced ?? bare) as string];
      if (fallback !== undefined) {
        const missing = colon === ":" ? value === undefined || value === "" : value === undefined;
        return missing ? fallback : (value as string);
      }
      return value ?? "";
    },
  );
}

/** 확장된 명령에서 next가 받을 포트(`-p`·`--port` 인자, 없으면 `PORT=` 접두). */
function portOf(command: string): string | null {
  const unquoted = command.replace(/["']/g, "");
  return (
    /(?:^|\s)(?:-p|--port)(?:\s+|=)(\d+)(?=\s|$)/.exec(unquoted)?.[1] ??
    /(?:^|\s)PORT=(\d+)(?=\s)/.exec(unquoted)?.[1] ??
    null
  );
}

/** E2E_PORT를 stub한 상태에서 playwright.config.ts를 새로 평가해 가져온다. */
async function loadPlaywrightConfig(e2ePort: string | undefined): Promise<PlaywrightTestConfig> {
  vi.stubEnv("E2E_PORT", e2ePort);
  vi.resetModules();
  const loaded = (await import("@/playwright.config")) as { default: PlaywrightTestConfig };
  return loaded.default;
}

function portOfUrl(url: string | undefined): string | null {
  return url === undefined ? null : new URL(url).port;
}

function webServerUrls(config: PlaywrightTestConfig): (string | undefined)[] {
  const servers = config.webServer;
  const list = Array.isArray(servers) ? servers : servers ? [servers] : [];
  expect(list.length, "Playwright 설정에 webServer가 있다").toBeGreaterThan(0);
  return list.map((server) => server.url);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("포트 기본값 — 환경변수를 지정하지 않으면 dev는 3200, start와 Playwright는 3201을 쓴다(스크립트 원문·설정 값만 본다. 실제 기동과 E2E 통과는 계획 T-13 절차에서 확인한다)", () => {
  describe("package.json 스크립트", () => {
    /**
     * @spec DoD-25
     * @given package.json 원문의 dev 스크립트를 읽는다(파일을 만들거나 고치지 않는다). DEV_PORT를 지정하지 않은 경우를 본다
     * @when dev 스크립트가 쓰는 포트를 확인한다
     * @then DEV_PORT를 지정하지 않으면 dev 스크립트의 포트가 3200이다
     */
    it("[DoD-25] DEV_PORT를 지정하지 않으면 dev 스크립트는 포트 3200을 쓴다", () => {
      const expanded = expandShell(scriptOf("dev"), { ...process.env, DEV_PORT: undefined });

      expect(portOf(expanded)).toBe("3200");
    });

    /**
     * @spec DoD-25
     * @given package.json 원문의 start 스크립트를 읽는다(파일을 만들거나 고치지 않는다). E2E_PORT를 지정하지 않은 경우를 본다
     * @when start 스크립트가 쓰는 포트를 확인한다
     * @then E2E_PORT를 지정하지 않으면 start 스크립트의 포트가 3201이다
     */
    it("[DoD-25] E2E_PORT를 지정하지 않으면 start 스크립트는 포트 3201을 쓴다", () => {
      const expanded = expandShell(scriptOf("start"), { ...process.env, E2E_PORT: undefined });

      expect(portOf(expanded)).toBe("3201");
    });
  });

  describe("Playwright 설정", () => {
    /**
     * @spec DoD-25
     * @given vi.stubEnv로 E2E_PORT를 지정하지 않은 상태로 만든다(테스트 후 복원). playwright.config.ts를 다시 import하고, import할 수 없으면 원문을 읽어 판정한다. 설정 값만 보며 실제 기동과 E2E 통과는 계획 T-13 절차에서 확인한다
     * @when Playwright 설정의 baseURL과 webServer.url 포트를 확인한다
     * @then baseURL의 포트가 3201이다
     * @then webServer.url의 포트가 3201이다
     */
    it("[DoD-25] E2E_PORT를 지정하지 않으면 Playwright baseURL과 webServer.url은 포트 3201을 쓴다", async () => {
      const config = await loadPlaywrightConfig(undefined);

      expect(portOfUrl(config.use?.baseURL)).toBe("3201");
      for (const url of webServerUrls(config)) {
        expect(portOfUrl(url)).toBe("3201");
      }
    });

    /**
     * @spec DoD-27
     * @given vi.stubEnv로 E2E_PORT를 3201이 아닌 3299로 지정한다(테스트 후 복원). playwright.config.ts를 다시 import하고, import할 수 없으면 원문을 읽어 판정한다. 설정 값만 보며 실제 기동과 E2E 통과는 계획 T-13 절차에서 확인한다
     * @when Playwright 설정의 baseURL과 webServer.url 포트를 확인한다
     * @then baseURL의 포트가 3299다
     * @then webServer.url의 포트가 3299다
     */
    it("[DoD-27] E2E_PORT를 3299로 지정하면 Playwright baseURL과 webServer.url은 포트 3299를 쓴다", async () => {
      const config = await loadPlaywrightConfig("3299");

      expect(portOfUrl(config.use?.baseURL)).toBe("3299");
      for (const url of webServerUrls(config)) {
        expect(portOfUrl(url)).toBe("3299");
      }
    });
  });
});
