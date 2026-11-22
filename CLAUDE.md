# gopepe-calc

- 제품 문서: docs/product/ (mission, roadmap, tech-stack). 기능 작업은 이 문서와 어긋나지 않게 한다.

## 환경

- 패키지 매니저: bun (`packageManager: bun@1.4.2`). 설치는 `bun install`.
- Node 버전: `.nvmrc` (v24.21.0).

## 명령

- `bun run dev`: 개발 서버 (포트 `DEV_PORT`, 기본 3200)
- `bun run build`: 프로덕션 빌드
- `bun run start`: 프로덕션 서버 (포트 `E2E_PORT`, 기본 3201)
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

- dev: `DEV_PORT`(기본 3200). `bun run dev`가 쓴다. 예: `DEV_PORT=3210 bun run dev`
- E2E: `E2E_PORT`(기본 3201). `bun run start`와 Playwright `baseURL`·`webServer`가 쓴다. 예: `E2E_PORT=3211 bun run test:e2e`
- Playwright `webServer`가 `bun run build && bun run start`로 `E2E_PORT`에 앱을 띄운다.
- E2E는 이미 떠 있는 서버를 재사용하지 않는다(`reuseExistingServer: false`). `E2E_PORT`의 포트가 사용 중이면 실패한다.

## 병렬 개발(worktree)

- 위치: `.claude/worktrees/{F-ID}`. 이 아래 파일은 git 추적 대상이 아니고, 저장소 루트의 `lint`·`format:check`·`typecheck` 대상이 아니다.
- 규칙:
  1. worktree는 `.claude/worktrees/{F-ID}`에 만들고, 만든 직후 그 안에서 `bun install`을 실행한다.
  2. 동시에 E2E·dev를 돌리는 worktree마다 서로 다른 `E2E_PORT`·`DEV_PORT`를 지정한다.
  3. 같은 worktree 안에서 `bun run build`와 `bun run test:e2e`를 동시에 돌리지 않는다(`.next`·포트를 공유한다).
  4. 작업이 끝나면 `git worktree remove`로 정리한다.

## 새 계산기 추가

- 새 lib·컴포넌트·테스트 파일을 만들고, `app/page.tsx`는 자기 F-ID 자리 두 곳(import 1곳, `CalculatorTabs` 탭 항목 1곳)만 바꾼다.
- 등록 전 자리 줄은 `// F-N 자리`다. 등록할 때 그 줄을 줄 끝에 F-ID 꼬리표 `// F-N`을 남긴 등록 줄(import 줄, 탭 항목 줄)로 바꾼다.
- 인접한 자리 줄 사이의 `// ---` 구분 줄은 그대로 둔다.
- 탭·탭 패널 이름은 계산기 이름이다. 순서: 손익 → 목표가 → 청산가 → 최대 수량 → 평균 진입가.
- 카드 이름은 `{계산기명} 입력`·`{계산기명} 결과`다.
- 공용 모듈:
  - `lib/input.ts`: `toNumber`, `isPositive`, `LEVERAGE_PATTERN`, `DECIMAL_PATTERN`, `filtered(pattern, set)`
  - `lib/symbols.ts`: `SYMBOLS`, `SYMBOLS_AS_OF`, `SymbolInfo`
  - `lib/format.ts`: `roundToStep`, `formatPrice`, `formatCoinQty` 등 표시 형식
  - `components/fields/`: `SymbolSelect`, `SideToggle`, `LeverageField`, `DecimalField`, `FieldWarning`
  - `components/calculator-layout.tsx`: 입력·결과 2단 카드 `CalculatorLayout`, `ResultRow`
  - `components/calculator-tabs.tsx`: `CalculatorTabs`
  - `cn`은 `@/lib/utils`에서 가져온다.

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
