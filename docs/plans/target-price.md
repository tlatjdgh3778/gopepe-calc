# 계획: F-2 목표가

- 상태: 승인
- 스펙: docs/specs/target-price.md
- 기준 코드: 2a6cccd + 작업 트리(스펙 신규, 미커밋)
- 최종 갱신: 2026-11-22

## 1. 구현 전략

- 계산은 화면과 분리된 순수 TS 모듈 `lib/target-price.ts`에 둔다. 입력 검사(유한 양수)와 `null` 규칙은 `lib/pnl.ts`를, 판정 코드를 돌려주고 문구는 컴포넌트가 만드는 방식은 `lib/validation.ts`를 따른다. `lib/pnl.ts`의 `isPositiveFinite`는 export되지 않고 공용 모듈은 수정 금지이므로 같은 작은 헬퍼를 이 파일 안에 둔다 — 근거: `docs/product/tech-stack.md` 구조 원칙, `lib/pnl.ts`, `lib/validation.ts`.
- 틱 맞춤은 공용 `roundToStep` 한 번으로 하고 자체 허용치를 두지 않는다. 실측(bun -e)으로 T1 원값 `67250.3`은 단위 수가 정확히 정수라 up이 튀지 않고, T4 `2345.7/0.01 = 234569.99999999997`은 `roundToStep` 허용치가 흡수해 down이 2345.69로 떨어지지 않는다. T1~T6의 틱 맞춤 값과 표시값은 스펙 표와 모두 일치했다 — 근거: `lib/format.ts`.
- 경고 판정은 lib에 둔다. `lib/target-price.ts`가 계약 함수 `calculateTargetPrice` 외에 경고 판정 함수(`checkTargetRoe`, `"noPrice" | "beyondMargin" | null`)를 export하고, 두 함수는 같은 내부 틱 맞춤 헬퍼를 쓴다. 계약 함수의 `null`만으로는 "입력 없음·비유한·0 이하"를 구별할 수 없어, 컴포넌트에서 판정하면 오버플로 입력(예: 309자리 진입가)에서 가격 없음 경고가 잘못 뜨기 때문이다. 계약 시그니처는 바꾸지 않는다 — 근거: `lib/validation.ts`, 스펙 4장(이름·위치 변경 허용).
- 부호 있는 입력란 `components/fields/signed-decimal-field.tsx`는 `components/fields/decimal-field.tsx`의 마크업(`useId`, `Label htmlFor`, `Input type="text" autoComplete="off"`, 경고가 있을 때만 `aria-describedby`와 `FieldWarning`)과 props를 복제하고, 패턴 상수(`/^-?\d*\.?\d*$/`)는 이 파일에만 둔다. `inputMode`는 두지 않는다. onChange는 공용 `filtered`를 쓰고, 숫자 변환은 계산기가 공용 `toNumber`로 한다(`toNumber("-")`·`toNumber("-.")`는 `null`로 실측) — 근거: `components/fields/decimal-field.tsx`, `lib/input.ts`.
- 계산기 `components/target-price-calculator.tsx`는 `components/pnl-calculator.tsx`처럼 입력 원문 문자열 상태를 들고 렌더할 때 계산한다. 레버리지는 같은 방식(`leverage === "" ? 0 : Number(leverage)`)으로 넘긴다. 공용 `SymbolSelect`·`SideToggle`·`LeverageField`·`DecimalField`·`CalculatorLayout`·`ResultRow`와 새 입력란을 쓰고, 표시 문자열은 `formatPrice`·`formatPercent`로만 만든다. 스펙에 색 규칙이 없으므로 `ResultRow`의 `toned`를 쓰지 않는다. 렌더 경로에 `Date`·`Math.random`·`crypto`를 쓰지 않는다 — 근거: `components/pnl-calculator.tsx`, F-1 계획 1장(cacheComponents prerender 제약).
- 등록은 `app/page.tsx`의 F-2 자리 두 줄만 꼬리표 `// F-2`를 남긴 한 줄 등록으로 바꾼다. 두 줄 모두 100자 미만이라 oxfmt가 나누지 않고, `__tests__/repo/page-slots.test.ts`의 정규식과 대조했다 — 근거: CLAUDE.md "새 계산기 추가", `__tests__/repo/page-slots.test.ts`.
- 결과 라벨 `목표가`는 탭·탭 패널 이름과 겹친다. 새 테스트는 결과를 `목표가 결과` region 범위에서 찾는다. EC-8 문구의 `—`(U+2014)는 빈 결과 기호와 같으므로 "결과가 `—`" 판정은 결과 셀 단위로 한다 — 근거: `e2e/pnl-calculator.spec.ts`(`resultCardOf` 주석).
- 기존 테스트는 코드 대조상 F-2 등록으로 깨지지 않는다. 비활성 패널은 `hidden`(keepMounted)이라 역할 조회에서 빠지고, 기존 locator는 `손익` 패널 범위이거나 정확 일치다. 실행 확인은 T-8에서 한다 — 근거: `components/calculator-tabs.tsx`, `e2e/pnl-calculator.spec.ts`, `__tests__/components/calculator-tabs.test.tsx`.
- 병렬 Task는 자기 파일만 `bunx oxfmt 경로`로 포맷한다. 골격의 `it.todo`·`test.fixme`가 남은 동안 lint는 `bunx oxlint 자기 경로`로 한정하고 저장소 전체 `bun run lint`는 T-8에서 판정한다. 테스트는 `bun run test`로만 실행한다. 병렬 F-3 worktree가 있으므로 E2E는 `E2E_PORT=3211`, dev는 `DEV_PORT=3210`을 쓰고, 이 worktree에서 `bun run build`와 `bun run test:e2e`를 동시에 돌리지 않는다 — 근거: CLAUDE.md, F-7 계획 1장·테스트 설계 증거(lint).
- 로드맵 F-2 상태 갱신은 이 계획 범위가 아니다. main 머지 후 별도 커밋으로 한다 — 근거: 커밋 05ddf88·2a6cccd 관례.

## 2. Task

### T-1 — 목표가 계산·경고 판정 모듈

- 사이드: 프론트(lib)
- 상태: 완료
- 목적: 목표가·가격 변동률 계산과 목표 ROE 경고 판정 순수 모듈을 만든다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, EC-2, EC-3, EC-4, EC-6, EC-7, EC-8, EC-9
- 수정 대상: `lib/target-price.ts` — 신규(`calculateTargetPrice`, 경고 판정 함수, 내부 틱 맞춤·유한 양수 헬퍼)
- 따라야 할 패턴: 순수 모듈과 `@/` 별칭 import, `null` 규칙, 판정 코드 반환 — 근거: `lib/pnl.ts`, `lib/validation.ts`
- 완료 조건: 연결 항목 충족(T-5 통과). 추가로 (1) React·DOM import가 없다 (2) 틱 반올림은 `roundToStep`만 쓰고 자체 허용치가 없다 (3) 경고 판정과 계산이 같은 틱 맞춤 헬퍼를 쓴다 (4) `git diff lib/`의 기존 파일 변경이 비어 있다 (5) 새 의존성이 없다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt lib/target-price.ts`, `bunx oxlint lib/target-price.ts`, `bun run typecheck`, `bun run test __tests__/lib`
- 수정 금지: lib/의 기존 파일, components/, app/, __tests__/, e2e/, package.json, bun.lock
- 구현 기록: seongho:frontend-dev — lib/target-price.ts. 수정 2/3(구현 중 오케스트레이터 지시: 입력이 유효하고 목표 ROE ≤ −100인데 틱 맞춤 결과가 비유한인 경우 EC-8 문구대로 beyondMargin을 돌려주도록 경고 판정 수정) / 2회차(7단계 verify D-1, 사용자 결정): 틱 맞춤 결과가 −∞이면 0 이하로 보아 noPrice(EC-6·EC-7·EC-9). 1회차 지시가 −∞까지 EC-6에서 뺀 오케스트레이터 오류가 원인

### T-2 — 부호 있는 숫자 입력란

- 사이드: 프론트(UI 입력란)
- 상태: 완료
- 목적: 맨 앞 `-` 하나를 받는 숫자 입력란 컴포넌트를 새 파일로 만든다
- 선행: 없음
- 연결 항목: DoD-12, DoD-13, EC-1, EC-7, EC-8
- 수정 대상: `components/fields/signed-decimal-field.tsx` — 신규
- 따라야 할 패턴: DecimalField 마크업·props 복제, 공용 `filtered`·`FieldWarning` — 근거: `components/fields/decimal-field.tsx`, `components/fields/field-warning.tsx`
- 완료 조건: 연결 항목 충족(T-6 통과). 추가로 (1) 경고가 없으면 `aria-describedby`가 없다 (2) `filtered`는 `@/lib/input`에서 가져오고 패턴은 이 파일에만 있다 (3) `inputMode` 속성이 없다 (4) `cn`을 쓰면 `@/lib/utils`에서 가져온다 (5) 기존 `__tests__/repo/shared-modules.test.ts`가 수정 없이 통과한다 — 검증: 테스트 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/fields/signed-decimal-field.tsx`, `bunx oxlint components/fields/signed-decimal-field.tsx`, `bun run typecheck`, `bun run test __tests__/repo`
- 수정 금지: components/fields/의 기존 파일, components/ui/, lib/, app/, __tests__/, e2e/
- 구현 기록: seongho:frontend-dev — components/fields/signed-decimal-field.tsx. 수정 0/3

### T-3 — 목표가 계산기 컴포넌트

- 사이드: 프론트(UI 계산기)
- 상태: 완료
- 목적: 목표가 입력·결과 카드를 가진 계산기 컴포넌트를 만든다
- 선행: T-1, T-2
- 연결 항목: DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12
- 수정 대상: `components/target-price-calculator.tsx` — 신규
- 따라야 할 패턴: 입력 원문 문자열 상태와 렌더 시 계산, `CalculatorLayout`·`ResultRow`, 공용 필드, 판정 코드를 문구로 바꾸는 방식(`qtyWarningOf`) — 근거: `components/pnl-calculator.tsx`
- 완료 조건: 연결 항목 충족(T-6 통과). 추가로 (1) 표시 문자열은 `formatPrice`·`formatPercent`로만 만든다 (2) 경고 요소를 직접 정의하지 않고 입력란의 `warning`으로 넘긴다 (3) `"use client"`는 필요한 곳에만 있다 (4) 렌더 경로에 `Date`·`Math.random`·`crypto`가 없다 (5) `PnlCalculator`와 상태를 공유하지 않는다 — 검증: 테스트 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/target-price-calculator.tsx`, `bunx oxlint components/target-price-calculator.tsx`, `bun run typecheck`, `bun run test __tests__/components`
- 수정 금지: components/pnl-calculator.tsx, components/fields/의 기존 파일, components/calculator-layout.tsx, components/calculator-tabs.tsx, components/ui/, lib/, app/, __tests__/, e2e/
- 구현 기록: seongho:frontend-dev — components/target-price-calculator.tsx. 수정 0/3

### T-4 — 화면 등록

- 사이드: 프론트(화면 등록)
- 상태: 완료
- 목적: 목표가 계산기를 `/` 화면의 손익 다음 탭으로 등록한다
- 선행: T-3
- 연결 항목: DoD-14, DoD-15
- 수정 대상: `app/page.tsx` — F-2 자리 두 줄(import 1곳, 탭 항목 1곳)만
- 따라야 할 패턴: 자리 줄을 꼬리표 등록 줄로 바꾸는 규칙 — 근거: CLAUDE.md "새 계산기 추가", `__tests__/repo/page-slots.test.ts`
- 완료 조건: 연결 항목 충족(기존 `page-slots.test.ts`와 T-6 통과). 추가로 (1) `git diff app/page.tsx`가 정확히 두 줄 교체다 (2) oxfmt 후에도 꼬리표가 같은 줄에 남는다 (3) `defaultValue="pnl"`이 그대로다 (4) build 출력에서 `/`가 정적이고 prerender 오류가 없다 — 검증: 테스트 + 명령 + 확인 절차(diff 대조)
- 실행 명령: `bunx oxfmt app/page.tsx`, `bun run test __tests__/repo/page-slots.test.ts __tests__/page.test.tsx __tests__/components/calculator-tabs.test.tsx`, `bun run typecheck`, `bun run build`(다른 build·E2E가 돌지 않을 때만)
- 수정 금지: app/page.tsx의 다른 줄, 그 외 모든 파일
- 구현 기록: seongho:frontend-dev — app/page.tsx(F-2 자리 두 줄). 수정 0/3. build: `/` 정적(○), prerender 오류 없음

### T-5 — lib 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 목표가 계산·경고 판정 모듈을 단위 테스트로 고정한다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, EC-2, EC-3, EC-4, EC-6
- 수정 대상: `__tests__/lib/target-price.test.ts` — 신규
- 따라야 할 패턴: vitest 함수 명시 import, JSDoc `@spec`·`@given`·`@when`·`@then`, 제목 `[DoD-N]`·`[EC-N]` 접두, 표 순회는 `it.each` — 근거: `__tests__/lib/step-format.test.ts`, `__tests__/lib/pnl-bybit.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기대값은 손계산 리터럴이며 구현 함수로 만들지 않는다 (2) DoD-1·DoD-2의 원값은 충분히 작은 `tickSize`(예: 1e-8)를 넘겨 관찰한다 (3) DoD-3·DoD-4는 목표 ROE 양수·음수·0 모두에서 방향을 보고, 허용치 경계 표본으로 T4를 둔다 (4) DoD-5는 반올림 여부를 T2로, `targetPrice` 기준 여부를 T3로 구별한다 (5) DoD-7은 실제 `calculatePnl`에 둘 이상의 수량을 넣는다 (6) EC-6은 원값이 정확히 0·음수·틱 미만 양수(숏)인 표본을 둔다 (7) 기존 테스트 파일은 손대지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib/target-price.test.ts`, `bunx oxfmt --check __tests__/lib/target-price.test.ts`, `bunx oxlint __tests__/lib/target-price.test.ts`, `bun run typecheck`
- 수정 금지: lib/, 기존 __tests__ 파일, 설정 파일, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/lib/target-price.test.ts. 수정 0/3
- 테스트 파일·runner: `__tests__/lib/target-price.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(`lib/target-price`·`lib/format`·`lib/pnl`을 실제로 호출)
- 데이터 격리: 공유 상태가 없고 표본은 테스트마다 상수로 둔다

### T-6 — 컴포넌트 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 목표가 계산기의 입력·결과·경고·상태 전환과 탭 등록을 컴포넌트 테스트로 고정한다
- 선행: T-3, T-4
- 연결 항목: DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12
- 수정 대상: `__tests__/components/target-price-calculator.test.tsx` — 신규(계산기 단독 렌더) / `__tests__/components/target-price-tabs.test.tsx` — 신규(DoD-14, `Page` 렌더)
- 따라야 할 패턴: RTL + user-event, `screen`·`within`, 경고 판정 헬퍼(`aria-describedby` id 목록)는 새 파일 안에 복제하고 기존 테스트 파일을 import하지 않는다 — 근거: `__tests__/components/pnl-validation.test.tsx`, `__tests__/components/calculator-tabs.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 입력은 실제 키 입력이고 EC-1에 붙여넣기 표본(`1-2`, `--5`, `+5`, `1e5`, `1.2.3`, U+2212 `−20`)을 둔다 (2) 경고는 입력란의 `aria-describedby`가 가리키는 요소로 판정하고 `⚠`(U+26A0)·`—`(U+2014)·`−`(U+2212)를 정확히 비교한다 (3) 페이지 렌더에서 결과는 `목표가 결과` region 범위에서 찾고 탭 패널은 `findByRole`로 찾는다 (4) EC-9 표본은 롱 10x 목표 ROE -1000이고 EC-8 문구가 없음도 본다 (5) EC-4는 틱 배수 진입가를 쓴다 (6) EC-10은 틱 차이가 결과를 바꾸는 표본, EC-11은 반올림 방향이 결과를 바꾸는 표본을 쓴다 (7) 각 EC 테스트에서 화면에 `NaN`·`Infinity`가 없고 `console.error`가 호출되지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components`, `bunx oxfmt --check __tests__/components`, `bunx oxlint __tests__/components/target-price-calculator.test.tsx __tests__/components/target-price-tabs.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 기존 __tests__ 파일, vitest.setup.ts, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/components/target-price-calculator.test.tsx, __tests__/components/target-price-tabs.test.tsx. 수정 0/3
- 테스트 파일·runner: `__tests__/components/target-price-calculator.test.tsx`, `__tests__/components/target-price-tabs.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: `console.error`의 `vi.spyOn`(관찰만)만 허용한다(사용자 확정). lib 모듈·shadcn·Base UI의 `vi.mock`은 금지한다. jsdom 폴리필은 F-7 컴포넌트 테스트가 없이 통과했으므로 두지 않고, `vitest.setup.ts` 변경이 필요하면 BLOCKED로 보고한다
- 데이터 격리: 테스트마다 새로 렌더하고 `vitest.setup.ts`의 `cleanup`으로 DOM을 비운다

### T-7 — E2E

- 사이드: E2E
- 상태: 완료
- 목적: 프로덕션 빌드에서 목표가 사용자 흐름과 손익↔목표가 탭 전환 유지를 E2E로 고정한다
- 선행: T-4
- 연결 항목: DoD-16, DoD-17, DoD-18
- 수정 대상: `e2e/target-price-calculator.spec.ts` — 신규
- 따라야 할 패턴: 탭 패널 범위 locator, 심볼 옵션은 열린 listbox 범위, 결과는 결과 region 범위의 `exact: true` 조회, 너비마다 `browser.newContext({ viewport })`와 `try/finally` — 근거: `e2e/pnl-calculator.spec.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 롱 표본은 T1, 숏 표본은 T2(음수 ROE 키 입력 포함)를 쓴다 (2) DoD-18은 손익 탭에 F-1 C1, 목표가 탭에 T2(두 탭의 방향·레버리지·진입가가 서로 달라 상태 공유를 구별한다, 사용자 결정)를 넣고 탭을 두 번 오간 뒤 양쪽 입력값과 결과를 비교한다 (3) URL·포트를 하드코딩하지 않는다 (4) 기존 `e2e/*.spec.ts`와 함께 전부 통과한다 — 검증: E2E
- 실행 명령: `E2E_PORT=3211 bun run test:e2e`(이 worktree에서 다른 build·E2E가 돌지 않을 때만), `bunx oxfmt --check e2e`
- 수정 금지: 기존 e2e 파일, playwright.config.ts, app/, components/, lib/
- 구현 기록: seongho:e2e-dev(골격 작성 에이전트, 살 모드) — e2e/target-price-calculator.spec.ts. 수정 0/3
- 테스트 파일·runner: `e2e/target-price-calculator.spec.ts` — Playwright(chromium)
- mock 허용 경계: 없음(프로덕션 빌드를 실제 브라우저로)
- 데이터 격리: 테스트마다 새 페이지 또는 새 브라우저 컨텍스트를 쓰고 저장 상태가 없다
- 실행 환경: `http://localhost` + `E2E_PORT=3211`. Playwright webServer가 `bun run build && bun run start`로 띄우고 기존 서버를 재사용하지 않는다(3211이 비어 있어야 한다). 로그인·사전 데이터 없음

### T-8 — 전체 정합성 검사

- 사이드: 검사
- 상태: 완료
- 목적: 기존 테스트를 포함한 저장소 전체 정합성 명령이 통과하는지 확인한다
- 선행: T-1, T-2, T-3, T-4, T-5, T-6, T-7
- 연결 항목: DoD-15, DoD-19
- 수정 대상: 없음(실행만)
- 따라야 할 패턴: CI 명령 순서 — 근거: `.github/workflows/ci.yml`, F-1 계획 실행 명령
- 완료 조건: 연결 항목 충족. 추가로 (1) 기존 단위·컴포넌트·저장소·E2E 테스트가 수정 없이 통과한다 (2) `git diff --stat`의 수정 파일은 `app/page.tsx` 하나이고 나머지는 신규 파일이다 (3) 실패하면 원인 Task로 돌려보낸다 — 검증: 명령
- 실행 명령: `bun install --frozen-lockfile`, `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, `E2E_PORT=3211 bun run test:e2e`(순차)
- 수정 금지: 모든 파일
- 구현 기록: 7단계 독립 검증의 seongho:test-runner(정합성 명령)·seongho:e2e-runner(E2E)가 실행한다(수정 없음)

## 3. 항목 coverage

- DoD-1: T-1, T-5
- DoD-2: T-1, T-5
- DoD-3: T-1, T-5
- DoD-4: T-1, T-5
- DoD-5: T-1, T-5
- DoD-6: T-1, T-5
- DoD-7: T-1, T-5
- DoD-8: T-3, T-6
- DoD-9: T-3, T-6
- DoD-10: T-3, T-6
- DoD-11: T-3, T-6
- DoD-12: T-2, T-3, T-6
- DoD-13: T-2, T-3, T-6
- DoD-14: T-3, T-4, T-6
- DoD-15: T-4, T-8
- DoD-16: T-7
- DoD-17: T-7
- DoD-18: T-7
- DoD-19: T-8
- EC-1: T-2, T-6
- EC-2: T-1, T-3, T-5, T-6
- EC-3: T-1, T-3, T-5, T-6
- EC-4: T-1, T-3, T-5, T-6
- EC-5: T-3, T-6
- EC-6: T-1, T-3, T-5, T-6
- EC-7: T-1, T-2, T-3, T-6
- EC-8: T-1, T-2, T-3, T-6
- EC-9: T-1, T-3, T-6
- EC-10: T-3, T-6
- EC-11: T-3, T-6
- EC-12: T-3, T-6

## 4. 실행 순서

- 0: 테스트 설계 단계에서 T-5·T-6·T-7의 골격을 동결한다.
- 병렬 A: T-1, T-2, T-5(본문) — 수정 파일이 겹치지 않는다.
- 순차: T-3(T-1·T-2 후) → T-4(T-3 후).
- 병렬 B: T-6, T-7(본문 작성, T-4 후) — 수정 파일이 겹치지 않는다. T-4의 `bun run build`, T-7의 `bun run test:e2e`, T-8은 `.next`·포트를 공유하므로 한 번에 하나만 실행한다.
- 마지막: T-8.

## 5. 차단 사항

- 없음

## 테스트 설계 증거

- 상태: PASS (4회차 reviewer의 중간 finding 1건(EC-1 붙여넣기 행동 미고정)을 반영하고 사람이 확인해 동결. 3회차에서 자동 반복 한도에 도달해 REVIEW-BLOCKED였고 사용자 결정으로 4회차를 실행했다)
- 기준 스펙: `docs/specs/target-price.md` (상태 확정, 최종 갱신 2026-11-22, 계획 단계에서 EC-4·EC-8·EC-9·4장 입력란 `inputMode` 갱신 반영)
- 골자 digest: `26029a058a3586ef` (case 34, 항목 31 중 연결 29·제외 2). 확인 명령: `python3 /root/study/skills/dev-pipeline/skills/test-design/scripts/check-skeleton.py --spec docs/specs/target-price.md --files __tests__/lib/target-price.test.ts __tests__/components/target-price-calculator.test.tsx __tests__/components/target-price-tabs.test.tsx e2e/target-price-calculator.spec.ts --exempt DoD-15,DoD-19 --frozen 26029a058a3586ef`
- 골격 파일:
  - `__tests__/lib/target-price.test.ts` (T-5, 11 case): DoD-1~7, EC-2, EC-3, EC-4, EC-6
  - `__tests__/components/target-price-calculator.test.tsx` (T-6, 18 case): DoD-8~13, EC-1~12
  - `__tests__/components/target-price-tabs.test.tsx` (T-6, 2 case): DoD-14
  - `e2e/target-price-calculator.spec.ts` (T-7, 3 case): DoD-16, DoD-17, DoD-18
- 기계 검사: 통과(위반 0). 최초 실행에서 DoD-15·DoD-19 미연결 2건 → 사람 확정 제외로 `--exempt`.
- reviewer: 새 general-purpose 에이전트 4회. 매회 검토 전후 체크섬으로 파일 무변경을 확인했다. 기대값 오류는 4회 모두 없었다(실제 `lib/format`·`lib/pnl`과 Decimal로 재계산).
  - 1회차 NEEDS-FIX 8건(중복 F1~F6, `@given` 모순 F7, 허용 오차 미정의 F8) — 반영
  - 2회차 NEEDS-FIX 4건(오버플로 입력의 가격 없음 경고 오판을 잡는 표본 누락 TD-F001, 중복 TD-F002~F004) — 반영
  - 3회차 NEEDS-FIX 3건 → REVIEW-BLOCKED. 사용자 결정: DoD-7 서술(TD-F001)·숏/롱 양수 ROE nearest 반올림 표본(TD-F002) 반영, 단위 층 안의 DoD-6 표 행 공유(TD-F003)는 의도된 표본 공유로 확정
  - 4회차 NEEDS-FIX 1건(EC-1 붙여넣기를 값 전체 치환으로 고정) — 반영 후 사람 확인으로 동결(사용자 결정)
- 사람 확정:
  - mock 경계: T-5·T-7은 mock 없음. T-6은 `console.error`의 `vi.spyOn`(관찰만)만 허용하고 `vi.mock`·jsdom 폴리필은 금지한다. 이 경계는 jsdom 결과만 증명하며 실제 브라우저 렌더·포털·레이아웃은 T-7 E2E가 맡는다.
  - 제외: DoD-15는 기존 `__tests__/repo/page-slots.test.ts`, DoD-19는 T-8과 7단계 test-runner의 명령 실행으로 검증한다.
  - 해석: EC-4 뒷문장(진입가가 틱 배수가 아닌 경우)은 단위 테스트로만 덮는다. DoD-18 표본은 손익 C1 + 목표가 T2(방향·레버리지·진입가가 서로 다름)다. 단위 층의 DoD-3·DoD-4·EC-4 case가 DoD-6 표 행을 공유하는 것은 의도된 표본 공유다.
  - lint: 골격의 `it.todo`·`test.fixme`는 oxlint `vitest(warn-todo)`에 걸리므로 구현 중에는 `bunx oxlint 자기 경로`로 한정하고, 저장소 전체 `bun run lint`는 본문이 모두 채워진 뒤 T-8·7단계에서 판정한다. 설정은 바꾸지 않는다.
- 본문 단계 주의:
  - T-5: DoD-7은 허용 오차 없는 `>=`다(T1 34.62000000000005, T4 30.86000000000004로 성립). 허용 오차를 넣지 않는다. DoD-1·DoD-2는 `===`, DoD-5는 상대 오차 1e-12 이내다.
  - T-6: 탭 패널은 자동 재시도 조회로 찾고, 페이지 렌더의 결과는 `목표가 결과` region 범위에서 찾는다. EC-1 붙여넣기는 입력란 값 전체를 선택한 뒤 바꾼다. 결과 `—`(U+2014) 판정은 결과 셀 단위로 한다(EC-8 문구에도 같은 문자가 있다).
  - T-7: URL·포트 하드코딩 금지, `E2E_PORT=3211`.
- 미검증·검증 불가:
  - 계약 4장 "결과가 유한하지 않으면 두 필드 모두 `null`": `roundToStep`이 거대한 유한 입력(예: 1e308, ROE 0)에서 `Infinity`를 돌려줄 수 있다. 연결 DoD/EC가 없어 골격에 없으며 7단계 verify가 구현 코드로 대조한다.
  - 목표 ROE 입력란 `inputMode` 없음(모바일 키패드의 `-`)은 테스트로 검증하지 않는다. T-2 완료 조건 (3)의 파일 대조로 확인한다.
  - E2E는 Chromium 한 종과 768px·1280px 너비만 확인한다.

### 검증 기록

- 코드 기준: 2a6cccd + 미커밋 작업 트리(신규 `lib/target-price.ts`·`components/fields/signed-decimal-field.tsx`·`components/target-price-calculator.tsx`·테스트 4파일, `app/page.tsx` 두 줄 수정). 매 검증 전후 체크섬으로 대상 파일 무변경을 확인했다.
- 1차 검증(새 general-purpose + `seongho:verify`, `seongho:test-runner`, `seongho:e2e-runner`): 정합성 명령·테스트 173건·E2E 10건 통과. verify가 D-1(틱 맞춤 −∞에서 EC-7 누락·EC-9 위반, 제품 결함 — 1회차 오케스트레이터 지시 오류가 원인)과 D-2(`roundToStep` 허용치와 §1 "목표 이상" 충돌, 스펙 결함)를 보고했다. 사용자 결정: D-1은 T-1 수정(2/3), D-2는 스펙 §1에 한계 명시.
- 2차 검증(새 인스턴스 3종, D-1 수정 후 코드 기준): `bun install --frozen-lockfile`·`format:check`·`lint`·`typecheck`·`test`(17파일 173건, todo·skip 0)·`build`(`/` 정적 ○, prerender 오류 없음) 모두 종료 코드 0. `E2E_PORT=3211 bun run test:e2e` 10건 통과(신규 3, 회귀 7). verify: 골자 digest `26029a058a3586ef` 유지, 충족 37·부분 충족 2(§1·EC-4, 극단 입력)·미충족 0. 극단 입력(약 1e300 이상) 결함 P-1(레버리지 오버플로)·S-1(거대 진입가에서 `roundToStep` +∞)·S-2(거대 레버리지에서 허용치 문구) 보고 → 사용자 결정: 스펙 §2 비목표로 명시(코드 변경 없음).

| 스펙 항목 | 코드 대조 (`verify`) | 실행 확인 (`test-runner`·`e2e-runner`) | 종합 |
|---|---|---|---|
| DoD-1~DoD-7 | 충족 | 확인됨 — `__tests__/lib/target-price.test.ts` 40건 | 충족 |
| DoD-8~DoD-13 | 충족 | 확인됨 — `__tests__/components/target-price-calculator.test.tsx` 18건 | 충족 |
| DoD-14 | 충족 | 확인됨 — `__tests__/components/target-price-tabs.test.tsx` 2건 | 충족 |
| DoD-15 | 충족 | 확인됨 — 기존 `__tests__/repo/page-slots.test.ts` 2건 | 충족 |
| DoD-16·DoD-17·DoD-18 | 충족(코드 대조) | 확인됨 — `e2e/target-price-calculator.spec.ts` 3건(768px·1280px) | 충족 |
| DoD-19 | 실행 항목 | 확인됨 — 명령 6종·E2E 모두 종료 코드 0 | 충족 |
| EC-1~EC-3, EC-5~EC-12 | 충족 | 확인됨 — 컴포넌트·단위 case | 충족 |
| EC-4 | 충족(정상 범위, 극단 입력은 §2 비목표) | 확인됨 — 단위·컴포넌트 case | 충족 |

- 미검증·한계: 모바일 실기기 키패드(`inputMode` 없음은 파일 대조만), Chromium 외 브라우저, 극단 입력(§2 비목표). `checkTargetRoe`의 −∞·+∞ 분기를 직접 고정하는 테스트는 없다(verify 코드 대조로만 확인).
