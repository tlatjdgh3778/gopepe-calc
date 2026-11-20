# gopepe-calc

- 제품 문서: docs/product/ (mission, roadmap, tech-stack). 기능 작업은 이 문서와 어긋나지 않게 한다.

## 환경

- 패키지 매니저: bun (`packageManager: bun@1.4.2`). 설치는 `bun install`.
- Node 버전: `.nvmrc` (v24.21.0).

## 명령

- `bun run dev`: 개발 서버 (포트 3200)
- `bun run build`: 프로덕션 빌드
- `bun run start`: 프로덕션 서버 (포트 3201)
- `bun run lint`: oxlint 린트
- `bun run format`: oxfmt 포맷 적용
- `bun run format:check`: oxfmt 포맷 검사 (수정하지 않음)
- `bun run typecheck`: `next typegen` 후 `tsc --noEmit`
- `bun run test`: Vitest 단위 테스트 1회 실행
- `bun run test:watch`: Vitest 감시 모드
- `bun run test:e2e`: Playwright E2E 테스트
- 주의: `bun test`는 Bun 내장 테스트 러너다. 반드시 `bun run test`를 쓴다.
- 단일 파일 실행 예: `bun run test __tests__/page.test.tsx`, `bun run test:e2e e2e/home.spec.ts`

## 포트

- dev: 3200
- E2E: 3201. Playwright `webServer`가 `bun run build && bun run start`로 3201에 앱을 띄운다.
- E2E는 이미 떠 있는 서버를 재사용하지 않는다(`reuseExistingServer: false`). 3201이 사용 중이면 실패한다.

## 테스트 위치·이름 규칙

- 단위: `__tests__/**/*.test.ts(x)`. Vitest는 이 패턴만 수집한다(jsdom 환경).
- E2E: `e2e/*.spec.ts` — `e2e/` 아래 하위 디렉터리의 `*.spec.ts`도 포함한다. Playwright는 `e2e/` 밖의 파일을 수집하지 않는다.
- 수집된 테스트가 0건이면 Vitest는 실패로 끝난다(`passWithNoTests: false`).

## 경로 별칭

- `@/*` → 프로젝트 루트(`./*`). `src/` 디렉터리는 없다.

## Playwright 브라우저 설치

- E2E 첫 실행 전: `bunx playwright install chromium`
- 시스템 라이브러리 오류 시: `bunx playwright install-deps chromium`

## 기타

- `next.config.ts`의 `agentRules: false`로 `next dev`가 AGENTS.md를 만들지 않는다. 이 프로젝트의 에이전트 지침 파일은 CLAUDE.md 하나다.
- oxfmt는 `docs/`를 포맷하지 않는다(`.oxfmtrc.json`의 `ignorePatterns`).
