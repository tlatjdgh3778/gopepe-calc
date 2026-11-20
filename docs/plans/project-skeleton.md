# 계획: F-0 프로젝트 골격

- 상태: 승인
- 스펙: docs/specs/project-skeleton.md
- 기준 코드: 665d234 + 작업 트리(docs/ 변경분)
- 최종 갱신: 2026-11-20

## 1. 구현 전략

- create-next-app은 CLAUDE.md가 있는 루트를 빈 디렉터리로 인정하지 않으므로 레포 밖 빈 임시 디렉터리에서 비대화형 플래그를 모두 명시해 생성한 뒤 루트로 복사한다. 템플릿은 `--empty`(next/font/google 없음, 빌드에 네트워크 불필요), `--use-bun`, `--no-src-dir`, `--import-alias "@/*"`, `--no-linter`, `--no-agents-md`, `--no-agent-feedback`, `--disable-git`, `--skip-install`을 쓴다. 이 기기에 저장된 create-next-app 선호값이 끼어들지 않게 플래그를 생략하지 않는다.
- 의존성은 복사 후 설치하고 템플릿이 고정한 버전(typescript, @types/node, tailwindcss 등)과 테스트·검사 도구를 `bun add -d 패키지@latest`로 최신 안정판에 맞춘 뒤 bun.lock을 만든다. vite는 vitest의 peer이므로 직접 설치한다.
- shadcn은 `bunx --bun shadcn@latest init --defaults --base base --yes --no-monorepo`로 base 계열 스타일만 초기화한다. init이 layout에 next/font/google을 넣으면 제거해 빌드가 네트워크에 의존하지 않게 한다.
- Vitest·Playwright 구성은 설치된 Next 내장 문서(`node_modules/next/dist/docs/` 아래 testing 가이드)를 따른다. 레이아웃이 Next가 생성하는 전역 타입을 쓰므로 typecheck는 `next typegen` 후 `tsc --noEmit`으로 한다.
- 병렬 Task는 저장소 전체 포맷(`bun run format`)을 실행하지 않고 자기 파일만 `bunx oxfmt 경로`로 포맷한다. 테스트는 Bun 내장 러너와 혼동하지 않게 반드시 `bun run test`로 실행한다.

## 2. Task

### T-1 — 앱 골격·도구 설정·홈 페이지

- 사이드: 프론트(골격·설정)
- 상태: 완료
- 목적: 테스트 파일 없이도 빌드·정적 검사·개발 서버가 동작하고 두 러너가 설정된 상태를 만든다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4
- 수정 대상: `package.json` — 명령 10개(dev는 3200, start는 3201 고정), packageManager, 최신 의존성 / `bun.lock` — 생성 / `.nvmrc` — v24.21.0 / `.gitignore` — 템플릿 항목에 Playwright 산출물 디렉터리 추가 / `tsconfig.json` — 템플릿 유지 / `next.config.ts` — 템플릿 설정 유지(cacheComponents 포함) + agentRules 끄기 / `app/layout.tsx` — lang ko, 제목 메타데이터 / `app/page.tsx` — 1단계 제목 하나 / `app/globals.css`, `components.json`, `lib/utils.ts` — shadcn init 결과 / `vitest.config.mts` — jsdom, 수집 범위 한정, passWithNoTests 끔, 경로 별칭·React 플러그인 / `playwright.config.ts` — e2e 디렉터리만 수집, chromium 하나, baseURL 3201, webServer는 build 후 start·재사용 안 함 / `.oxlintrc.json` — 플러그인과 산출물 무시 / `.oxfmtrc.json` — docs 제외
- 따라야 할 패턴: 공식 도구 산출물을 그대로 쓴다 — 근거: create-next-app `--empty` 템플릿, shadcn init, `node_modules/next/dist/docs/01-app/02-guides/testing/`
- 완료 조건: 연결 항목 중 빌드·정적 검사·개발 서버 부분 충족. 추가로 (1) 테스트 파일이 없는 상태에서 `bun run test`가 0이 아닌 코드로 끝나 0건 실패 설정이 동작함을 보인다 (2) `bunx playwright test --list`가 e2e 디렉터리 밖 파일을 수집하지 않는다 (3) components.json이 base 계열이고 개별 컴포넌트가 없다 (4) 개발 서버를 띄운 뒤 AGENTS.md와 README.md가 생기지 않는다 (5) 첫 build 후 Next가 tsconfig.json을 자동 수정했다면 그 결과를 포맷해 포함한다 — 검증: 명령
- 실행 명령: `bun install --frozen-lockfile`, `bun run build`, `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run dev` 후 `curl -s -o /dev/null -w '%{http_code}' http://localhost:3200/`, `bun run test`(실패 기대)
- 수정 금지: CLAUDE.md, docs 디렉터리, .github 디렉터리, 단위 테스트·E2E 테스트 파일. shadcn 개별 컴포넌트를 추가하지 않는다
- 구현 기록: seongho:frontend-dev — T-1 수정 대상 전체 + `vitest.setup.ts`(Testing Library cleanup 등록, 위임 시 허용). 수정 횟수 0/3

### T-2 — 홈 페이지 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: jsdom에서 홈 페이지를 렌더해 제목이 있는지 확인하는 단위 테스트 1건을 둔다
- 선행: T-1
- 연결 항목: DoD-2
- 수정 대상: `__tests__/page.test.tsx` — `@/app/page`를 import해 렌더하고 level 1 heading을 role로 찾는다
- 따라야 할 패턴: Next 내장 Vitest 가이드의 예제 형태 — 근거: `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- 완료 조건: DoD-2 충족. 추가로 vitest의 함수를 명시 import하고(globals 미사용), 새 의존성을 추가하지 않으며, 별칭 import로 경로 별칭 동작을 함께 증명한다 — 검증: 명령
- 실행 명령: `bun run test`, `bun run typecheck`, `bun run lint`
- 수정 금지: package.json, bun.lock, 설정 파일, app 디렉터리. 의존성이 필요하면 BLOCKED로 보고한다
- 구현 기록: seongho:test-dev — `__tests__/page.test.tsx`. 수정 횟수 0/3
- 테스트 파일·runner: `__tests__/page.test.tsx` — Vitest(jsdom)
- mock 허용 경계: 없음(실제 페이지 컴포넌트를 렌더)
- 데이터 격리: 상태가 없는 단일 렌더이고, 테스트 후 cleanup으로 DOM을 비운다

### T-3 — 홈 페이지 E2E

- 사이드: E2E
- 상태: 완료
- 목적: 프로덕션 빌드로 띄운 앱의 첫 화면에서 제목이 보이는지 확인하는 E2E 1건을 둔다
- 선행: T-1
- 연결 항목: DoD-3
- 수정 대상: `e2e/home.spec.ts` — baseURL 기준 루트로 이동해 level 1 heading이 보이는지 확인한다
- 따라야 할 패턴: Next 내장 Playwright 가이드 — 근거: `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
- 완료 조건: DoD-3 충족. 추가로 URL·포트를 하드코딩하지 않고 baseURL만 쓴다 — 검증: 명령
- 실행 명령: `bun run test:e2e`
- 수정 금지: package.json, playwright.config.ts, app 디렉터리
- 구현 기록: seongho:e2e-dev — `e2e/home.spec.ts`. 수정 횟수 0/3
- 테스트 파일·runner: `e2e/home.spec.ts` — Playwright(Chromium)
- mock 허용 경계: 없음(실제 프로덕션 빌드)
- 데이터 격리: Playwright 기본값대로 테스트마다 새 브라우저 컨텍스트를 쓴다
- 실행 환경: http://localhost:3201 — playwright webServer가 build 후 start로 띄우고 종료한다. 로그인·사전 데이터 없음. 브라우저가 없으면 `bunx playwright install chromium`

### T-4 — CI 워크플로

- 사이드: CI
- 상태: 완료
- 목적: GitHub Actions에서 정적 검사·단위 테스트·빌드와 브라우저 테스트를 실행하는 워크플로를 둔다
- 선행: T-1
- 연결 항목: DoD-6
- 수정 대상: `.github/workflows/ci.yml` — 트리거·동시 실행 취소·권한, check 잡과 브라우저 잡, 실패 시 산출물 업로드
- 따라야 할 패턴: 각 액션의 공식 사용법(actions/checkout, actions/setup-node의 node-version-file, oven-sh/setup-bun의 bun-version-file, actions/upload-artifact) — 근거: 각 액션 저장소 README
- 완료 조건: DoD-6 충족. 추가로 액션 메이저 버전이 작성 시점 최신이고, 두 잡 모두 frozen lockfile로 설치하며, 파일이 oxfmt로 포맷돼 있다 — 검증: 확인 절차(파일 대조)
- 실행 명령: `bun run format:check`
- 수정 금지: .github 디렉터리 밖 모든 파일
- 구현 기록: general-purpose(CI 전용 에이전트 없음) — `.github/workflows/ci.yml`. 수정 횟수 0/3

### T-5 — CLAUDE.md 개발 안내

- 사이드: 문서
- 상태: 완료
- 목적: 이후 기능 작업자와 실행 에이전트가 읽을 명령·포트·테스트 규칙을 기록한다
- 선행: T-1
- 연결 항목: DoD-5
- 수정 대상: `CLAUDE.md` — 기존 두 줄을 유지하고 명령, 포트, 테스트 위치·이름 규칙, 경로 별칭, 브라우저 설치 안내 절을 추가한다
- 따라야 할 패턴: 기존 CLAUDE.md의 한국어 목록 문체 — 근거: `CLAUDE.md`
- 완료 조건: DoD-5 충족. 추가로 기록한 명령 이름이 T-1의 package.json 스크립트와 정확히 같고, `bun test`가 아니라 `bun run test`라는 주의를 적으며, 파일이 oxfmt로 포맷돼 있다 — 검증: 확인 절차(문서 대조)
- 실행 명령: `bun run format:check`
- 수정 금지: CLAUDE.md 외 모든 파일, 특히 docs 디렉터리
- 구현 기록: general-purpose(문서 전용 에이전트 없음) — `CLAUDE.md`. 수정 횟수 1/3 — 원인: E2E 수집 범위 문구가 하위 디렉터리 수집을 반영하지 않음(검증 지적, 34행 수정)

## 3. 항목 coverage

- DoD-1: T-1
- DoD-2: T-1, T-2
- DoD-3: T-1, T-3
- DoD-4: T-1
- DoD-5: T-5
- DoD-6: T-4

## 4. 실행 순서

- 순차: T-1
- 병렬: T-2, T-3, T-4, T-5 — 모두 T-1만 선행으로 두고 수정 파일이 겹치지 않는다
- 7단계 검증에서 E2E 실행과 개발 서버 확인은 포트를 쓰므로 순차로 돌린다

## 5. 차단 사항

- 네트워크 필요: create-next-app, 패키지 설치, shadcn init(레지스트리), Playwright 브라우저 다운로드
- Playwright 최신판(1.65.x)용 Chromium이 로컬에 없어 새로 받아야 한다(수백 MB). 시스템 라이브러리가 없으면 install-deps가 필요하다
- 최신 TypeScript가 7.x다. Next 타입 생성·빌드가 실패하면 6.x로 내리는 것은 스펙의 최신 안정판 결정에서 벗어나므로 사용자 승인 후에만 한다

## 테스트 설계 증거

건너뜀 — 사유: F-0의 단위 테스트·E2E는 러너 동작을 증명하는 산출물 자체이며 동결할 기능 동작이 없다. 먼저 실패하는 상태는 T-1의 테스트 0건 실패 확인으로 대신한다. 사용자 동의 2026-11-20.

### 검증 기록 (2026-11-20, 기준: 665d234 + 작업 트리)

| 스펙 항목 | 코드 대조 (verify) | 실행 확인 (test-runner·e2e-runner) | 종합 |
|---|---|---|---|
| DoD-1 | 설정·스크립트 일치(종료 코드는 실행 몫) | 확인됨 — install·build·lint·format:check·typecheck 모두 0 | 충족 |
| DoD-2 | 충족 — role 기반 assertion, 별칭 import | 확인됨 — 1 파일 1건 통과 | 충족 |
| DoD-3 | 충족 — baseURL만 사용, role 가시성 | 확인됨 — 1건 통과, 종료 코드 0 | 충족 |
| DoD-4 | 충족 — dev 3200 | 확인됨 — HTTP 200 | 충족 |
| DoD-5 | 충족 — 명령 10개 일치 | 해당 없음(문서 확인) | 충족 |
| DoD-6 | 충족 — 트리거·권한·두 잡·버전 출처·아티팩트 | 액션 태그 존재 확인(gh api, 오케스트레이터). CI 실제 실행은 비목표 | 충족 |

- 저심각도 지적 3건: CLAUDE.md의 E2E 수집 범위 문구(하위 디렉터리도 수집됨), 스펙의 cacheComponents 기본값 표현 모호, 단위 테스트의 중복 assertion(toBeDefined). 사용자 결정: CLAUDE.md 문구 수정(T-5 재위임), 스펙 cacheComponents 표현 명확화, 중복 assertion은 유지.
- 검증 전후 작업 트리 변경 없음.
