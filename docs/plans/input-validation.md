# 계획: F-7 입력 검증·단위 반올림

- 상태: 승인
- 스펙: docs/specs/input-validation.md
- 기준 코드: 05ddf88 + 작업 트리(스펙 신규, 미커밋)
- 최종 갱신: 2026-11-22

## 1. 구현 전략

- lib 계층은 화면과 분리된 순수 TS 모듈로 둔다. `lib/symbols.ts`는 타입을 넓히고 스펙 표의 값을 넣는다. `lib/format.ts`는 기존 `cleanup`(소수 10자리 정리)·`truncFormatter`·`isFiniteNumber`를 재사용해 `roundToStep`·`formatPrice`를 더하고 `formatCoinQty`의 자릿수를 `qtyStep`에서 얻는다. `roundToStep`은 단위 수(value ÷ step)가 가장 가까운 정수와 스펙 DoD-3의 상대 허용치 안에 있으면 그 정수로, 아니면 floor/ceil한 뒤 step 자릿수로 고정해 `0.3 ÷ 0.1 = 2.999…` 오차와 큰 수량의 ulp 오차를 함께 막는다. `lib/validation.ts`의 배수 판정도 같은 규칙을 쓴다 — 근거: `docs/product/tech-stack.md` 구조 원칙, `lib/format.ts`, F-1 계획 T-2.
- `lib/input.ts`는 `components/pnl-calculator.tsx`의 정규식·`toNumber`·`isPositive`·`filtered`를 옮긴다. onChange 헬퍼는 React import 없이 구조적 타입(`{ target: { value: string } }`)으로 받아 lib에 React·DOM import를 두지 않는다 — 근거: F-1 계획 T-2 완료 조건 (1).
- 공용 UI(`components/fields/`, `components/calculator-layout.tsx`)는 `components/pnl-calculator.tsx`의 기존 마크업·클래스를 그대로 옮긴다. `calculator-layout`은 계산기 이름을 받아 두 region 이름을 만들고 결과 `dl`의 `aria-live="polite"`를 유지한다. `ResultRow`가 `data-tone`·tone 클래스를 맡는다. `cn`은 `@/lib/utils`에서 가져온다. `FieldWarning`은 id가 붙은 문단이고, 입력란은 경고가 있을 때만 그 id를 `aria-describedby`로 건다. 스펙에 알림 방식이 없으므로 `role`·`aria-live`를 붙이지 않는다 — 근거: `node_modules/@base-ui/react/docs/react/handbook/forms.md`.
- 경고 판정은 입력란 원문이 양수일 때만 한다. 코인 모드는 입력 수량, USDT 모드는 `roundToStep(qtyFromValue(금액, 진입가), qtyStep, "down")`으로 판정하고, 배수 경고는 코인 모드에서만 판정한다(스펙 DoD-8·EC-4·EC-5의 관계).
- 탭은 `bunx --bun shadcn@latest add tabs --yes`로 추가한다. Base UI Tabs v1.9.0의 패널 prop은 `keepMounted`이고, 패널은 `role=tabpanel`에 `aria-labelledby`로 탭을 가리켜 탭 글자가 패널 이름이 된다. 비활성 패널은 `hidden`이라 역할 조회에서 빠진다. 탭 id는 등록 후 채워지므로 테스트는 `findByRole`이나 자동 재시도 단언을 쓴다. SSR에서 활성 탭을 정하려면 `defaultValue`를 명시한다 — 근거: `node_modules/@base-ui/react/docs/react/components/tabs.md`, `node_modules/@base-ui/react/tabs/panel/TabsPanel.js`.
- `app/page.tsx`는 동기 서버 컴포넌트로 두고 `CalculatorTabs`에 넘길 항목 배열과 F-ID 자리 주석만 갖는다. `SYMBOLS_AS_OF`는 상수 문자열로 두고 렌더 경로에서 `Date`를 쓰지 않는다 — 근거: F-1 계획 1장(cacheComponents prerender 제약), `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md`.
- 포트는 `package.json` 스크립트를 `next dev -p ${DEV_PORT:-3200}`, `next start -p ${E2E_PORT:-3201}`로 바꾼다. bun 1.4.2의 `bun run`은 Linux에서 기본으로 시스템 셸을 써서 이 확장이 동작함을 실측했다(`--shell=bun`에서는 동작하지 않는다). `playwright.config.ts`는 `process.env.E2E_PORT || "3201"`로 `baseURL`·`webServer.url`을 만들고, webServer는 `process.env`를 물려받아 `bun run start`에 값이 전달된다. `reuseExistingServer: false`는 유지한다 — 근거: `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`.
- worktree 제외는 `.gitignore`에 `.claude/worktrees/`만 추가하고, `.oxlintrc.json` `ignorePatterns`(기존 관례가 gitignore된 산출물도 명시)와 `tsconfig.json` `exclude`에 명시한다. oxfmt는 `.gitignore`를 따르므로 `.oxfmtrc.json`은 실측해 필요할 때만 고친다. Next 16.4.6의 루트 탐색은 git worktree 경계에서 멈추므로 `turbopack.root`는 worktree 빌드가 실패하거나 경고할 때만 넣는다 — 근거: `node_modules/next/dist/esm/lib/find-root.js`, `.oxlintrc.json`, `oxfmt --help`.
- 병렬 Task는 자기 파일만 `bunx oxfmt 경로`로 포맷한다. 테스트는 `bun run test`로만 실행한다. `bun run build`와 `bun run test:e2e`는 `.next`·포트를 공유하므로 한 번에 하나만 돌린다 — 근거: CLAUDE.md, F-1 계획 1장.

## 2. Task

### T-1 — shadcn tabs 추가

- 사이드: 프론트(기반)
- 상태: 완료
- 목적: 탭 화면이 쓸 shadcn Tabs 컴포넌트를 추가한다
- 선행: 없음
- 연결 항목: DoD-18
- 수정 대상: `components/ui/tabs.tsx` — shadcn add 생성 결과(포맷만)
- 따라야 할 패턴: 공식 도구 산출물을 그대로 쓴다 — 근거: `docs/plans/pnl-calculation.md` T-1, `components.json`
- 완료 조건: (1) 생성 파일이 `components/ui/tabs.tsx` 하나다 (2) `components.json`·`app/globals.css`·`package.json`·`bun.lock`이 바뀌지 않았고, 바뀌면 중단하고 보고한다 (3) 패널 래퍼가 나머지 props를 Base UI 패널에 넘겨 `keepMounted`가 전달된다(파일 대조) — 검증: 명령 + 확인 절차(파일 대조)
- 실행 명령: `bunx --bun shadcn@latest add tabs --yes`, `bunx oxfmt components/ui/tabs.tsx`, `bun run lint`, `bun run typecheck`
- 수정 금지: 기존 components/ui 파일, app/, lib/, __tests__/, e2e/, 설정 파일, docs/, CLAUDE.md
- 구현 기록: seongho:frontend-dev — components/ui/tabs.tsx. 수정 0/3

### T-2 — 심볼·반올림·표시·판정·입력 헬퍼 모듈

- 사이드: 로직(lib)
- 상태: 완료
- 목적: 확장된 심볼 데이터와 반올림·표시·경고 판정·입력 헬퍼 순수 모듈을 만든다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-8, DoD-14, DoD-22, EC-6, EC-7
- 수정 대상: `lib/symbols.ts` — 타입 확장, 스펙 표의 값, `SYMBOLS_AS_OF` / `lib/format.ts` — `roundToStep`, `formatPrice` 추가, `formatCoinQty` 시그니처 변경 / `lib/validation.ts` — 신규 / `lib/input.ts` — 신규 / `components/pnl-calculator.tsx` — `formatCoinQty` 호출부 한 줄만(typecheck 유지용)
- 따라야 할 패턴: 순수 TS 모듈과 별칭 import, 표시 문자열은 `lib/format.ts`에서만 만든다 — 근거: `lib/format.ts`, `docs/product/tech-stack.md`
- 완료 조건: 연결 항목 충족(T-8 통과). 추가로 (1) React·DOM import가 없다 (2) `git diff lib/pnl.ts lib/utils.ts`가 비어 있다 (3) 기존 `__tests__/lib`가 수정 없이 통과한다 (4) 표시용 오차 정리는 기존 `cleanup` 하나만 쓰고, 배수·내림 판정의 허용치는 DoD-3 정의 한 곳에만 있다 (5) 새 의존성이 없다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt lib components/pnl-calculator.tsx`, `bun run lint`, `bun run typecheck`, `bun run test __tests__/lib`
- 수정 금지: lib/pnl.ts, lib/utils.ts, package.json, bun.lock, __tests__/, e2e/, app/, components/(위 한 줄 제외)
- 구현 기록: seongho:frontend-dev — lib/symbols.ts, lib/format.ts, lib/validation.ts, lib/input.ts, components/pnl-calculator.tsx(한 줄). 수정 1/3(7단계 검증: 큰 수량 배수 오판정 — 소수 10자리 절대 정리를 DoD-3 상대 허용치로 교체). 스펙에 없는 방어 동작: roundToStep은 step이 유한하지 않거나 0 이하이면 null(계약 시그니처 불변, 8단계 보고 대상)

### T-3 — 공용 입력 컴포넌트와 2단 카드

- 사이드: 프론트(UI 공용)
- 상태: 완료
- 목적: 계산기들이 공유할 입력 필드·경고·2단 카드·결과 행 컴포넌트를 만든다
- 선행: T-2
- 연결 항목: DoD-9, DoD-11, DoD-12, DoD-17, DoD-19, DoD-22, DoD-23
- 수정 대상: `components/fields/symbol-select.tsx`, `components/fields/side-toggle.tsx`, `components/fields/leverage-field.tsx`, `components/fields/decimal-field.tsx`, `components/fields/field-warning.tsx` — 신규 / `components/calculator-layout.tsx` — 신규(2단 카드, `ResultRow`)
- 따라야 할 패턴: `components/pnl-calculator.tsx`의 마크업·클래스, Base UI 라벨 전략, `useId` 기반 id — 근거: `components/pnl-calculator.tsx`, `node_modules/@base-ui/react/docs/react/handbook/forms.md`
- 완료 조건: 연결 항목 충족(T-9 통과). 추가로 (1) 경고가 없으면 `aria-describedby`가 없다 (2) 결과 영역의 `aria-live`·`data-tone`과 기존 결과 셀 클래스가 유지된다 (3) 렌더 경로에 `Date`·`Math.random`·`crypto`가 없다 — 검증: 테스트 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/fields components/calculator-layout.tsx`, `bun run lint`, `bun run typecheck`
- 수정 금지: components/pnl-calculator.tsx, components/ui/, lib/, app/, __tests__/, e2e/
- 구현 기록: seongho:frontend-dev — components/fields/*.tsx, components/calculator-layout.tsx. 수정 0/3

### T-4 — 손익 계산기 전환과 F-7 동작

- 사이드: 프론트(UI 손익)
- 상태: 완료
- 목적: 손익 계산기를 공용 모듈로 바꾸고 경고·환산 수량 내림·전환 채움·기준일·카드 이름을 넣는다
- 선행: T-2, T-3
- 연결 항목: DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-19, DoD-22, DoD-23, EC-1, EC-2, EC-3, EC-4, EC-5, EC-9
- 수정 대상: `components/pnl-calculator.tsx` — 공용 모듈 사용, 로컬 헬퍼 삭제, `cn` import 변경, 경고 판정, USDT 환산 수량 내림, USDT → 코인 전환 채움, 카드 이름 `손익`
- 따라야 할 패턴: 입력 원문 문자열 상태와 렌더 시 계산 — 근거: `components/pnl-calculator.tsx`, F-1 계획 T-3
- 완료 조건: 연결 항목 충족(T-9·T-10 통과). 추가로 (1) 코인 → USDT 채움과 진입가가 없을 때 입력란을 비우는 기존 동작이 그대로다 (2) 직접 작성한 파일 중 `"use client"`가 필요한 곳에만 있다 (3) build 출력에서 `/`가 정적이고 prerender 오류가 없다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt components/pnl-calculator.tsx`, `bun run lint`, `bun run typecheck`, `bun run test __tests__/components __tests__/lib`, `bun run build`(다른 build·E2E가 돌지 않을 때만)
- 수정 금지: lib/, components/fields/, components/calculator-layout.tsx, components/ui/, app/, __tests__/, e2e/
- 구현 기록: seongho:frontend-dev — components/pnl-calculator.tsx. 수정 0/3

### T-5 — 탭 화면 구조와 자리 주석

- 사이드: 프론트(화면 구조)
- 상태: 완료
- 목적: `CalculatorTabs`와 손익 탭 하나를 가진 `/` 화면, F-2~F-5 등록 자리를 만든다
- 선행: T-1
- 연결 항목: DoD-18, DoD-20, DoD-21, DoD-22
- 수정 대상: `components/calculator-tabs.tsx` — 신규(항목 배열을 받아 탭과 unmount하지 않는 패널을 그림) / `app/page.tsx` — h1 아래 `CalculatorTabs`, 항목 배열, import 영역과 항목 영역의 F-2~F-5 자리 주석과 구분 줄
- 따라야 할 패턴: 동기 서버 컴포넌트 page, shadcn 래퍼 사용 — 근거: `app/page.tsx`, `components/ui/tabs.tsx`(T-1 산출물)
- 완료 조건: 연결 항목 충족(T-9·T-11·T-12 통과). 추가로 (1) `useSearchParams`·해시를 쓰지 않는다 (2) oxfmt 후에도 자리 주석과 구분 줄이 남는다 (3) build 출력에서 `/`가 정적이다 (4) `__tests__/page.test.tsx`와 `e2e/home.spec.ts`가 수정 없이 통과한다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt app/page.tsx components/calculator-tabs.tsx`, `bun run lint`, `bun run typecheck`, `bun run test __tests__/page.test.tsx`, `bun run build`(다른 build·E2E가 돌지 않을 때만)
- 수정 금지: components/pnl-calculator.tsx, components/ui/, lib/, app/layout.tsx, app/globals.css, __tests__/, e2e/
- 구현 기록: seongho:frontend-dev — components/calculator-tabs.tsx, app/page.tsx. 수정 0/3

### T-6 — 포트 환경변수와 worktree 제외 설정

- 사이드: 설정/환경
- 상태: 완료
- 목적: 포트를 환경변수로 바꿀 수 있게 하고 `.claude/worktrees/`를 git·lint·format·typecheck 대상에서 뺀다
- 선행: T-1
- 연결 항목: DoD-25, DoD-26, DoD-27, DoD-28, DoD-29, DoD-30, EC-8
- 수정 대상: `package.json` — `dev`·`start` 스크립트만 / `playwright.config.ts` — 포트 / `.gitignore` / `.oxlintrc.json` / `tsconfig.json` — exclude / `.oxfmtrc.json` — 실측 후 필요할 때만 / `next.config.ts` — worktree 빌드가 실패·경고할 때만 `turbopack.root` / `vitest.config.mts` — `testTimeout: 15000`(8단계 사용자 결정: 부하 중 컴포넌트 테스트 5초 기본 타임아웃 간헐 실패 대응, 기대값 불변)
- 따라야 할 패턴: 기존 `ignorePatterns` 관례, Next CLI 포트 옵션 — 근거: `.oxlintrc.json`, `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`
- 완료 조건: 연결 항목 충족(T-11 통과, T-13 절차 통과). 추가로 (1) `dependencies`·`devDependencies`가 바뀌지 않는다 (2) `bun install --frozen-lockfile`이 성공한다 (3) `.oxfmtrc.json`·`next.config.ts`를 고쳤다면 실측 근거를 보고한다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt package.json playwright.config.ts tsconfig.json`, `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun run typecheck`
- 수정 금지: app/, components/, lib/, __tests__/, e2e/, docs/, CLAUDE.md, .github/
- 구현 기록: seongho:frontend-dev — package.json(scripts), playwright.config.ts, .gitignore, .oxlintrc.json, tsconfig.json, (조건부) .oxfmtrc.json·next.config.ts. 수정 0/3. 실측: oxlint·oxfmt·tsc 모두 점 디렉터리라 원래도 제외됐고 명시 패턴을 추가함. .oxfmtrc.json·next.config.ts 무변경. 수정 1/3(8단계 사용자 결정: vitest testTimeout 15000)

### T-7 — 대체·이관 표기와 운용 문서

- 사이드: 문서
- 상태: 완료
- 목적: 이 스펙이 바꾼 기존 문서 계약과 병렬 개발 운용 규칙을 문서에 반영한다
- 선행: 없음
- 연결 항목: DoD-31, DoD-32, DoD-33, DoD-34, DoD-35
- 수정 대상: `docs/specs/pnl-calculation.md` — 대체·이관 표기 / `docs/specs/project-skeleton.md` — 포트 문장과 해당 DoD / `docs/product/tech-stack.md` — 26행과 심볼 출처 / `docs/product/roadmap.md` — F-7 요청 한 줄 / `CLAUDE.md` — 포트 절, worktree 절, 새 계산기 추가 절차
- 따라야 할 패턴: 원문을 지우지 않고 표기를 덧붙인다, 문장 끝 출처 태그 — 근거: `docs/specs/pnl-calculation.md`, `docs/product/roadmap.md`
- 완료 조건: 연결 항목 충족. 추가로 (1) `docs/specs/input-validation.md`를 고치지 않는다 (2) 로드맵의 상태 열은 바꾸지 않는다(완료 반영은 커밋 단계) — 검증: 스펙 대조(verify)
- 실행 명령: `bun run format:check`
- 수정 금지: docs/specs/input-validation.md, docs/plans/, 코드 전체
- 구현 기록: general-purpose(문서 전용 에이전트 없음) — docs/specs/pnl-calculation.md, docs/specs/project-skeleton.md, docs/product/tech-stack.md, docs/product/roadmap.md, CLAUDE.md. 수정 1/3(7단계 검증 결함 2: F-1 스펙 11행·로드맵 13행 반올림 문장에 F-7 범위 표기 추가, 사용자 결정)

### T-8 — lib 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 심볼 데이터·반올림·표시·판정 모듈을 단위 테스트로 고정한다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-8, EC-6, EC-7
- 수정 대상: `__tests__/lib/symbols.test.ts`, `__tests__/lib/step-format.test.ts`, `__tests__/lib/validation.test.ts` — 신규
- 따라야 할 패턴: vitest 함수 명시 import, JSDoc `@spec`·`@given`·`@when`·`@then`, 제목 `[DoD-N]`·`[EC-N]` 접두 — 근거: `__tests__/lib/format.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기대값은 손계산 리터럴이다 (2) `up`·`down` 양쪽과 음수 value를 다룬다 (3) 오차 경계 표본(SOL 0.3, ETH 0.07, BTC 0.003은 배수, BTC 0.0015는 배수 아님, `minOrderQty`와 같은 값은 `null`)과 DoD-3 허용치 경계 표본(큰 배수 BTC 262.441·512.003·SOL 30000.3·26214.6 — 단위 수가 정수보다 조금 작은 쪽과 큰 쪽 모두, 진짜 작은 차이 0.00199999999999·0.00100000000001)을 둔다 (4) `−`(U+2212)·`—`(U+2014)를 정확히 비교한다 (5) 기존 F-1 테스트 파일은 손대지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib`, `bunx oxfmt --check __tests__/lib`, `bun run lint`, `bun run typecheck`
- 수정 금지: lib/, 기존 __tests__ 파일, 설정 파일, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/lib/symbols.test.ts, step-format.test.ts, validation.test.ts. 수정 1/3(스펙 DoD-3·DoD-8 변경에 따른 골격 update 표본을 본문에 반영, DoD-2 본문 허용치를 DoD-3 정의로)
- 테스트 파일·runner: `__tests__/lib/symbols.test.ts`, `__tests__/lib/step-format.test.ts`, `__tests__/lib/validation.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(순수 함수를 실제로 호출)
- 데이터 격리: 공유 상태가 없고 표본은 테스트마다 상수로 둔다

### T-9 — F-7 컴포넌트 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 경고·환산 수량·전환 채움·기준일·탭·카드 이름을 컴포넌트 테스트로 고정한다
- 선행: T-4, T-5
- 연결 항목: DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-18, DoD-19, DoD-20, EC-1, EC-2, EC-3, EC-4, EC-5, EC-9
- 수정 대상: `__tests__/components/pnl-validation.test.tsx` — 신규 / `__tests__/components/calculator-tabs.test.tsx` — 신규(DoD-18은 page 렌더, DoD-20은 파일 안 더미 계산기 2개) / `vitest.setup.ts` — jsdom 폴리필이 필요할 때만
- 따라야 할 패턴: RTL + user-event, `screen`·`within`, 제목 ID 접두 — 근거: `__tests__/components/pnl-calculator.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 경고는 입력란의 `aria-describedby` id 목록이 경고 요소를 가리키는지로 판정한다 (2) 경고 문구의 `⚠`는 U+26A0으로 정확히 비교한다 (3) DoD-15는 원값 계산과 구별되는 표본(1 USDT, 진입가 3 → 0.333 BTC로 계산)을 쓴다 (4) 탭 패널은 `findByRole`로 찾는다 (5) 화면에 `NaN`·`Infinity`가 없다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components`, `bunx oxfmt --check __tests__/components`, `bun run lint`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, package.json, 기존 F-1 테스트 파일
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/components/pnl-validation.test.tsx, calculator-tabs.test.tsx, (필요 시) vitest.setup.ts. 수정 0/3
- 테스트 파일·runner: `__tests__/components/pnl-validation.test.tsx`, `__tests__/components/calculator-tabs.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: jsdom에 없는 브라우저 API의 최소 폴리필(필요하면 `vitest.setup.ts`, 추가 시 보고)과 `console.error` spy(관찰만). lib 모듈·shadcn·Base UI는 `vi.mock`으로 대체하지 않는다. DoD-20의 더미 계산기는 mock이 아니라 테스트 픽스처다
- 데이터 격리: 테스트마다 새로 렌더하고 `vitest.setup.ts`의 `cleanup`으로 DOM을 비운다

### T-10 — F-1 컴포넌트 테스트 갱신

- 사이드: 테스트
- 상태: 완료
- 목적: 이 스펙이 대체한 F-1 테스트 case를 지우거나 고치고 나머지는 그대로 둔다
- 선행: 없음
- 연결 항목: DoD-10, DoD-14, DoD-15, DoD-16, DoD-23
- 수정 대상: `__tests__/components/pnl-calculator.test.tsx` — F-1 EC-4 case와 그 전용 헬퍼 삭제(대체 case는 T-9), F-1 DoD-13의 USDT → 코인 case와 F-1 DoD-14 case 삭제(대체 case는 T-9), F-1 EC-10의 참고 수량 리터럴 갱신
- 따라야 할 패턴: 기존 파일 구조 유지 — 근거: `__tests__/components/pnl-calculator.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 위 대상 외 case는 바꾸지 않는다(diff 대조) (2) F-1 골격 digest가 무효가 됨을 테스트 설계 증거에 기록한다 — 검증: 테스트 + 확인 절차(diff 대조)
- 실행 명령: `bun run test __tests__/components/pnl-calculator.test.tsx`, `bunx oxfmt --check __tests__/components/pnl-calculator.test.tsx`
- 수정 금지: components/, lib/, app/, 다른 테스트 파일
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/components/pnl-calculator.test.tsx. 수정 0/3
- 테스트 파일·runner: `__tests__/components/pnl-calculator.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: F-1 T-6과 같다(`console.error` spy 관찰만, 그 외 없음)
- 데이터 격리: 테스트마다 새로 렌더한다

### T-11 — 저장소 정적·설정 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 자리 주석·공용 모듈 존재·포트 기본값·gitignore 범위를 파일 검사 테스트로 고정한다
- 선행: 없음
- 연결 항목: DoD-21, DoD-22, DoD-25, DoD-27, DoD-28
- 수정 대상: `__tests__/repo/page-slots.test.ts`, `__tests__/repo/shared-modules.test.ts`, `__tests__/repo/ports.test.ts`, `__tests__/repo/gitignore.test.ts` — 신규
- 따라야 할 패턴: Vitest, 파일 첫 줄 `// @vitest-environment node`, 제목 ID 접두 — 근거: `vitest.config.mts`(수집 패턴 `__tests__/**`)
- 완료 조건: 연결 항목 충족. 추가로 (1) DoD-21은 `app/page.tsx` 원문에서 F-2~F-5 표식이 import 영역과 항목 영역에 순서대로 하나씩 있고 인접 표식 사이에 다른 줄이 있는지 본다(표식 형식은 테스트 설계에서 확정) (2) DoD-22는 모듈 파일과 export, `components/pnl-calculator.tsx`의 import와 로컬 헬퍼 부재, `from "cn"` 부재를 본다 (3) DoD-25·DoD-27은 `vi.stubEnv`로 `playwright.config.ts`를 다시 import해 포트를 보고, import가 안 되면 원문 검사로 대체하며, `package.json` 스크립트의 기본값을 본다 (4) DoD-28은 `.gitignore` 줄과 `git check-ignore` 종료 코드(`.claude/worktrees/` 아래는 무시, `.claude/settings.json`은 무시 안 함)를 본다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/repo`, `bunx oxfmt --check __tests__/repo`, `bun run lint`, `bun run typecheck`
- 수정 금지: 제품 코드, 설정 파일, 기존 테스트 파일
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/repo/*.test.ts. 수정 0/3
- 테스트 파일·runner: `__tests__/repo/page-slots.test.ts`, `__tests__/repo/shared-modules.test.ts`, `__tests__/repo/ports.test.ts`, `__tests__/repo/gitignore.test.ts` — Vitest(node 환경)
- mock 허용 경계: `vi.stubEnv`만(테스트 후 복원). 파일 읽기와 `git check-ignore`는 실제로 실행한다
- 데이터 격리: 파일을 만들지 않고 읽기만 한다. `git check-ignore`는 존재하지 않는 경로로 판정한다

### T-12 — E2E 범위 좁히기와 탭 E2E

- 사이드: E2E
- 상태: 완료
- 목적: F-1 E2E를 손익 탭 패널 범위로 좁히고 기본 탭·카드 이름 E2E를 더한다
- 선행: T-4, T-5, T-6
- 연결 항목: DoD-18, DoD-19, DoD-24
- 수정 대상: `e2e/pnl-calculator.spec.ts` — 모든 locator를 손익 탭 패널 범위로, 심볼 옵션은 열린 listbox 범위로, region 이름 갱신, 결과 `손익` 라벨은 결과 region 범위로(탭 이름과 충돌 방지) / `e2e/calculator-tabs.spec.ts` — 신규
- 따라야 할 패턴: 기존 헬퍼 구조와 `baseURL`만 쓰는 이동 — 근거: `e2e/pnl-calculator.spec.ts`, F-1 계획 T-7
- 완료 조건: 연결 항목 충족. 추가로 (1) 기존 case의 기대값과 판정 방식을 바꾸지 않는다 (2) URL·포트를 하드코딩하지 않는다 (3) `e2e/home.spec.ts`와 함께 전부 통과한다 — 검증: E2E
- 실행 명령: `bun run test:e2e`(다른 build·E2E가 돌지 않을 때만), `bunx oxfmt --check e2e`
- 수정 금지: playwright.config.ts, e2e/home.spec.ts, app/, components/, lib/
- 구현 기록: seongho:e2e-dev(골격 작성 에이전트, 살 모드) — e2e/pnl-calculator.spec.ts, e2e/calculator-tabs.spec.ts. 수정 0/3
- 테스트 파일·runner: `e2e/pnl-calculator.spec.ts`, `e2e/calculator-tabs.spec.ts` — Playwright(chromium)
- mock 허용 경계: 없음(프로덕션 빌드를 실제 브라우저로)
- 데이터 격리: 테스트마다 새 페이지를 열고 저장 상태가 없다
- 실행 환경: `http://localhost` + `E2E_PORT`(기본 3201). Playwright webServer가 `bun run build && bun run start`로 띄우고 기존 서버를 재사용하지 않는다. 로그인·사전 데이터 없음

### T-13 — 포트·worktree 환경 검증 절차

- 사이드: 검증(실행 절차, 7단계에서 실행)
- 상태: 완료
- 목적: 실제 포트·프로세스·worktree가 필요한 항목을 명령 절차로 확인한다
- 선행: T-4, T-5, T-6, T-12
- 연결 항목: DoD-25, DoD-26, DoD-27, DoD-29, DoD-30, EC-8
- 수정 대상: 없음(명령 실행만, 임시 worktree와 위반 파일은 끝나면 지운다)
- 따라야 할 패턴: CI 순서 — 근거: `.github/workflows/ci.yml`
- 완료 조건: 연결 항목 충족. 절차는 (1) 변수 없이 dev가 3200, build 후 start가 3201에서 200 응답 (2) `DEV_PORT=3210`이면 3210에서 200 (3) `E2E_PORT=3299 bun run test:e2e` 성공 (4) 3299와 3201을 다른 프로세스가 점유하면 `test:e2e`가 실패 (5) `.claude/worktrees/` 아래 일부러 위반 파일을 둬도 루트 `lint`·`format:check`·`typecheck`가 통과하고 tsc 파일 목록에 `.claude`가 없음 (6) `.claude/worktrees/verify-f7` worktree에 현재 diff와 미추적 파일을 적용하고 `bun install --frozen-lockfile`·`bun run build` 성공 후 worktree 삭제 — 검증: 명령
- 실행 명령: `bun run dev`, `bun run build`, `bun run start`, `curl`, `bun run test:e2e`, `bun run lint`, `bun run format:check`, `bun run typecheck`, `git worktree add`, `git worktree remove`
- 수정 금지: 저장소의 모든 추적 파일
- 구현 기록: seongho:e2e-runner(7단계) — 절차 B1~B9 실행, 전부 기대대로(E2E_PORT=3299 7/7, 포트 점유 시 실패, start 3201 200, worktree 안 lint·format·typecheck 제외·build 성공·DEV_PORT=3210 200, 변수 없는 dev는 3200 EADDRINUSE). 사용자 dev 서버(3200)는 건드리지 않음. 임시 worktree·프로세스 정리 완료. 수정 대상 없음

## 3. 항목 coverage

- DoD-1: T-2, T-8
- DoD-2: T-2, T-8
- DoD-3: T-2, T-8
- DoD-4: T-2, T-8
- DoD-5: T-2, T-8
- DoD-6: T-2, T-8
- DoD-7: T-2, T-8
- DoD-8: T-2, T-8
- DoD-9: T-3, T-4, T-9
- DoD-10: T-4, T-9, T-10
- DoD-11: T-3, T-4, T-9
- DoD-12: T-3, T-4, T-9
- DoD-13: T-4, T-9
- DoD-14: T-2, T-4, T-9, T-10
- DoD-15: T-4, T-9, T-10
- DoD-16: T-4, T-9, T-10
- DoD-17: T-3, T-4, T-9
- DoD-18: T-1, T-5, T-9, T-12
- DoD-19: T-3, T-4, T-9, T-12
- DoD-20: T-5, T-9
- DoD-21: T-5, T-11
- DoD-22: T-2, T-3, T-4, T-5, T-11
- DoD-23: T-3, T-4, T-10
- DoD-24: T-12
- DoD-25: T-6, T-11, T-13
- DoD-26: T-6, T-13
- DoD-27: T-6, T-11, T-13
- DoD-28: T-6, T-11
- DoD-29: T-6, T-13
- DoD-30: T-6, T-13
- DoD-31: T-7
- DoD-32: T-7
- DoD-33: T-7
- DoD-34: T-7
- DoD-35: T-7
- EC-1: T-4, T-9
- EC-2: T-4, T-9
- EC-3: T-4, T-9
- EC-4: T-4, T-9
- EC-5: T-4, T-9
- EC-6: T-2, T-8
- EC-7: T-2, T-8
- EC-8: T-6, T-13
- EC-9: T-4, T-9

## 4. 실행 순서

- 0단계: 테스트 설계로 T-8~T-12 골격을 동결한다(F-1 컴포넌트 테스트 골격 재동결 포함).
- 병렬 A: T-1, T-2, T-7, T-8, T-10, T-11 — 수정 파일이 겹치지 않는다.
- 병렬 B: T-3(T-2 후), T-5(T-1 후), T-6(T-1 후) — 수정 파일이 겹치지 않는다.
- 순차: T-4(T-2·T-3 후) → T-9(T-4·T-5 후) → T-12(T-4·T-5·T-6 후).
- 순차(공유 자원): `bun run build`와 `bun run test:e2e`를 쓰는 단계(T-4·T-5의 build, T-12, T-13)는 한 번에 하나만 돌린다.
- T-13은 7단계 검증에서 실행한다. DoD-31~35는 7단계 스펙 대조(verify)로 확인한다.

## 5. 차단 사항

- T-1의 shadcn add는 shadcn 레지스트리 네트워크 접근이 필요하다. T-13의 worktree `bun install`도 캐시에 없는 패키지가 있으면 네트워크가 필요하다.

## 테스트 설계 증거

- 상태: PASS (4회차 reviewer의 낮음 finding 1건을 반영하고 사람이 확인해 동결. 3회 자동 반복 한도 초과는 사용자가 승인했다)
- 기준 스펙: `docs/specs/input-validation.md` (상태 확정, 최종 갱신 2026-11-22, 테스트 설계 중 4장 보충 반영: `checkLeverage`·`checkQty`의 `null` 입력, `filtered`·`CalculatorLayout` 이름, page.tsx 자리 형식). 보충 전 digest `e3184045368273d9`는 무효다.
- 골자 digest:
  - F-7: `612d000241732be0` (case 61, 항목 44 중 연결 33·제외 11). 2026-11-22 update: 7단계 검증에서 큰 수량 배수 오판정 결함이 나와 스펙 DoD-3·DoD-8에 상대 허용치 정의를 추가했고(사용자 결정), T-8 DoD-3 case 3개·DoD-8 case 2개의 태그 표본을 보충했다. 이전 digest `372dba7b8dc278d2`는 무효다.
  - F-1 재동결: `dd6d3314307fa0e5` (case 52). 이전 `37070968c7a9c1dd`(case 55)는 F-7이 F-1 EC-4·DoD-13(USDT → 코인)·DoD-14를 대체하고 DoD-21·22 카드 제목을 바꿔 무효다. 확인 명령: `check-skeleton.py --spec docs/specs/pnl-calculation.md --files __tests__/lib/pnl.test.ts __tests__/lib/format.test.ts __tests__/lib/pnl-bybit.test.ts __tests__/components/pnl-calculator.test.tsx e2e/pnl-calculator.spec.ts --exempt DoD-17,EC-4,DoD-14 --frozen dd6d3314307fa0e5`
- 골격 파일(F-7, `--exempt DoD-23,DoD-24,DoD-26,DoD-29,DoD-30,DoD-31,DoD-32,DoD-33,DoD-34,DoD-35,EC-8`):
  - `__tests__/lib/symbols.test.ts`, `__tests__/lib/step-format.test.ts`, `__tests__/lib/validation.test.ts` (T-8, 19 case): DoD-1~8, EC-6, EC-7
  - `__tests__/components/pnl-validation.test.tsx`, `__tests__/components/calculator-tabs.test.tsx` (T-9, 25 case): DoD-9~20, EC-1~5, EC-9
  - `__tests__/repo/page-slots.test.ts`, `__tests__/repo/shared-modules.test.ts`, `__tests__/repo/ports.test.ts`, `__tests__/repo/gitignore.test.ts` (T-11, 16 case): DoD-21, 22, 25, 27, 28
  - `e2e/calculator-tabs.spec.ts` (T-12, 1 case): DoD-18·19
  - F-1 파일 변경: `__tests__/components/pnl-calculator.test.tsx` (T-10, case 3개와 helper `screenTextWithout` 삭제), `e2e/pnl-calculator.spec.ts` (T-12, DoD-21·22 태그의 카드 제목만 `손익 입력`·`손익 결과`로)
- 기계 검사: F-7 통과(위반 0). F-1은 `--frozen` 일치. F-1 일반 검사의 위반 279건은 모두 본문이 채워진 기존 case의 미구현 표기 없음·assertion 표시다(정상).
- reviewer: 새 general-purpose 에이전트 4회. 매회 검토 전후 체크섬으로 파일 무변경을 확인했다.
  - 1회차 NEEDS-FIX 10건: `aria-describedby` 약화, 환산 수량 부동소수점 경계·천 단위 표본 부재, DoD-11·EC-1 중복, DoD-2·4 중복, DoD-22 판정 느슨함, 포트 정적 검사 한계 미표기, DoD-18 E2E 문구 — 반영
  - 2회차 NEEDS-DECISION 1건 + NEEDS-FIX 6건: FieldWarning 판정(사람 결정), DoD-18·19 E2E 병합, DoD-2 문구, gitignore `--no-index`·표본, 구분 줄 문구, DoD-15 계산 경로 경계 표본 — 반영. 표본만 다른 case 분할 4곳은 사람이 현행 유지로 결정
  - 3회차 NEEDS-FIX 2건: USDT 모드 심볼 전환 재판정(EC-2), 0 표기 표본(EC-4) — 반영(한도 초과 4회차를 사용자가 승인)
  - 4회차 NEEDS-FIX 1건(낮음): DoD-20 더미 계산기 상태 위치 — 반영 후 사람 확인으로 동결
  - update 1회차 NEEDS-FIX 1건(중간): 큰 배수 표본이 단위 수가 정수보다 작은 쪽만 있어 up 방향 결함을 못 잡음 — 512.003·26214.6 추가로 반영
  - update 2회차 PASS(finding 0). 관찰: `max(1,|u|)`의 abs 누락 구현·계수 경계는 표본으로 고정하지 않음(사람이 위험 낮음으로 수용), 30000.3은 단위 수가 정확한 정수라 허용치 경계를 시험하지 않음. 바뀐 5개 case 밖 태그의 바이트 동일성은 미추적 파일이라 diff로 확인하지 못했고 case 수·연결 검사로만 확인했다. 사람 확인 후 재동결
- 사람 확정:
  - mock 경계: T-8·T-12는 mock 없음(T-12는 실제 프로덕션 빌드). T-9는 jsdom 최소 폴리필(필요 시 `vitest.setup.ts`, 추가 시 보고)과 `console.error` spy(관찰만)만 허용하고 lib·shadcn·Base UI의 `vi.mock`은 금지. DoD-20 더미 계산기는 픽스처. T-10은 F-1 T-6과 같음. T-11은 `vi.stubEnv`만 허용하고 파일 읽기와 `git check-ignore`는 실제 실행.
  - 제외: DoD-23(7단계 F-1 테스트 통과), DoD-24(7단계 F-1 E2E 실행 + verify locator 대조), DoD-26·29·30·EC-8(T-13 명령 절차, DoD-25·27의 실제 기동 포함), DoD-31~35(문서, verify 대조).
  - 해석: `checkQty(0)`은 `belowMin`이나 화면은 입력 원문이 양수일 때만 판정한다. 최대 레버리지 이하면 경고가 없다. 환산 수량 0이면 `≈ 0.000 BTC`다. 제목이 `입력`·`결과`만인 카드는 없다(컴포넌트 층). `SYMBOLS` 순서·`baseCoin`은 F-7에서 검사하지 않는다. DoD-22는 나열된 필드·레이아웃 부품과 `lib/input` 헬퍼를 import하고, `FieldWarning`은 직접 import하거나 사용하는 필드 안에서 쓰며, PnlCalculator 안에서 경고 요소를 직접 정의하지 않는다. DoD-27 정적 case와 DoD-28 인덱스 추적 case를 T-11에 둔다.
  - lint: 골격의 `it.todo`·`test.fixme`는 oxlint `vitest(warn-todo)`에 걸리므로 구현 중에는 `bunx oxlint 자기 경로`로 한정하고, 저장소 전체 `bun run lint`는 본문이 모두 채워진 뒤 7단계에서 판정한다. 설정은 바꾸지 않는다.
- 본문 단계 주의:
  - T-10: F-1 EC-10 본문 리터럴 `≈ 0.2000 BTC`·`≈ 0.2500 BTC`를 `≈ 0.200 BTC`·`≈ 0.250 BTC`로 갱신한다(결과값은 그대로).
  - T-12: `e2e/pnl-calculator.spec.ts`의 locator를 `손익` 탭 패널 범위로, 심볼 옵션은 열린 listbox 범위로, region 헬퍼는 `손익 입력`·`손익 결과`로, 결과 `손익` 라벨은 결과 region 범위로 좁힌다.
  - T-9: 탭 패널 이름은 자동 재시도 조회로 찾는다. DoD-20 더미는 상태를 자기 안에만 둔다.
  - T-11: `git check-ignore --no-index`를 쓰고 존재하지 않는 경로로 판정한다. playwright 설정 재import가 안 되면 원문 검사로 대체한다.
- 미검증·검증 불가:
  - 포트 환경변수의 실제 적용(DoD-25·27의 기동, DoD-26)은 T-13에서만 확인된다. 정적 테스트는 하드코딩 구현도 통과시킨다.
  - jsdom에서 Base UI Tabs 렌더와 탭 id 지연 등록은 구현 단계에서 확인된다.
  - DoD-20은 더미 계산기로만 검증한다. 실제 계산기 간 탭 전환은 F-2 이후 처음 검증된다.
  - 코인 모드 W2 경고 중 결과 표시 유지는 F-7 골격이 아니라 F-1 EC-9 테스트에 기댄다.
  - `git check-ignore --no-index`는 `.git/info/exclude`·전역 `core.excludesFile`을 따른다. 현재 환경에는 규칙이 없다.

### 검증 기록 (7단계, 코드 기준 05ddf88 + 작업 트리, 2026-11-22)

- 1회차: verify(스펙 대조) 충족 34·부분 충족 2(DoD-3·DoD-8)·검증 불가 8, test-runner 정합성 8종 전부 0·테스트 113/113, e2e-runner E2E 7/7·T-13 절차(B1~B9) 전부 기대대로. 오케스트레이터 실행 확인에서 큰 수량 배수 오판정(배수 15만 표본 중 20,572건)을 재현 → 스펙 결함(허용 오차 미정의)으로 분류, 사용자 결정으로 DoD-3·DoD-8에 상대 허용치 정의 추가, T-8 골격 update·재동결, T-2 수정 1/3, T-8 본문 수정 1/3. 문서 불일치(F-1 스펙 11행·로드맵 13행)는 사용자 결정으로 T-7 수정 1/3.
- 2회차(변경 범위): verify 중점 11항목 전부 충족, digest F-7 `612d000241732be0`·F-1 `dd6d3314307fa0e5` 유지, assertion 약화 없음. test-runner 정합성 8종 통과(테스트 113/113, lib 49/49, build `/` 정적). 단, 외부 부하(다른 프로젝트 vitest, 부하 평균 15~17/12코어)에서 F-1 `[DoD-20]` 컴포넌트 case가 5000ms 기본 타임아웃에 걸려 실패하고 다음 case `[EC-3]`이 연쇄 실패하는 현상이 재현됨(재실행 시 통과, 무부하 실행 4회 모두 통과). 테스트 타이밍 결함으로 분류, 8단계 사용자 결정 대상.
- 항목별 종합: DoD-1~22·24~35, EC-1~9 충족(코드 대조 + 실행 확인 또는 문서 대조). DoD-23 충족(F-1 테스트 22/22 통과)이나 `aria-live`는 검사 테스트가 없어 코드 대조로만 확인.
- 미검증·남은 위험: `aria-live` 테스트 부재(F-1부터), 코인 모드 W2 경고 중 결과 유지는 F-1 EC-9 테스트에 기댐, DoD-20은 더미 계산기로만 검증, 음수 큰 배수·허용치 계수 경계 표본 없음(사람 수용), `roundToStep`의 step ≤ 0·비유한 → null 방어 동작(스펙 밖, 화면 도달 불가).
- 최종 확인(8단계 결정 반영 후): `vitest.config.mts` `testTimeout: 15000` 추가(T-6 수정 1/3). test-runner가 format:check·lint·typecheck·build 통과, `bun run test` 3회 연속 113/113 통과(부하 평균 3.9~5.5/12코어; 고부하 조건에서의 재확인은 아님). 작업 트리 실행 전후 동일.
