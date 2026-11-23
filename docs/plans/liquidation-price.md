# 계획: F-3 청산가

- 상태: 승인
- 스펙: docs/specs/liquidation-price.md
- 기준 코드: 2a6cccd + 작업 트리(스펙 신규, 미커밋)
- 최종 갱신: 2026-11-22

## 1. 구현 전략

- `lib/liquidation.ts`는 React·DOM import 없는 순수 TS 모듈로 스펙 4장 계약을 export한다. `roundLiquidation`은 공용 `roundToStep`에 위임하고, null 가드는 `lib/input.ts`의 `isPositive`를 쓴다 — 근거: `lib/pnl.ts`, `lib/format.ts`, `docs/product/tech-stack.md` 구조 원칙.
- `lib/format.ts`의 `cleanup`·`truncFormatter`는 export되지 않고 공용 모듈은 고치지 않으므로, `formatDistance`는 `lib/liquidation.ts` 안의 private 오차 정리와 모듈 상수 `Intl.NumberFormat`(소수 2자리, `roundingMode: "trunc"`, `signDisplay: "never"`, 구분 있음)으로 만든다. 한도 금액 표기는 export된 `formatPrice(riskLimitValue, 0)`을 쓴다 — 근거: `lib/format.ts`.
- `components/liquidation-calculator.tsx`는 `"use client"` 컴포넌트로 입력 원문을 문자열 상태로 들고 렌더할 때 계산한다. 계산 흐름은 toNumber → 담보(격리 `isolatedCollateral`, 교차 잔고) → `liquidationPrice` 원값 → 롱 원값 ≤ 0이면 `청산 없음` 분기 → `roundLiquidation` → 표시·거리·경고 판정 순이다. 잔고 상태는 격리에서도 유지하고 입력란만 조건부로 렌더한다 — 근거: `components/pnl-calculator.tsx` 53~85행.
- 마진 모드는 `components/pnl-calculator.tsx` 118~134행의 인라인 `ToggleGroup` 패턴(`useId` 라벨 span, `aria-labelledby`, `variant="outline"`, 빈 배열 무시)을 따른다. 교차 안내는 `LeverageField`가 children을 받지 않으므로 같은 래퍼 안의 형제 `p.text-sm.text-muted-foreground`로 둔다 — 근거: `components/fields/leverage-field.tsx`, `components/fields/symbol-select.tsx` 48행.
- 수량 경고는 `checkQty`와 `pnl-calculator.tsx` `qtyWarningOf` 코인 분기 문구를 F-3 파일에 복제해 `DecimalField warning`으로 연결한다. 손절 경고도 `DecimalField warning`을 쓴다. `⚠`는 `FieldWarning`만 붙인다 — 근거: `components/fields/decimal-field.tsx`, `components/fields/field-warning.tsx`.
- 결과 경고는 공용 레이아웃을 고치지 않고 `results` 안에서 `추정 청산가` `ResultRow` 바로 뒤에 `col-span-2` 클래스를 준 dd 요소로 감싼 `FieldWarning`을 둔다. HTML `dl` 콘텐츠 모델상 같은 dt 뒤의 dd 추가는 유효하고 div 혼용은 무효다. 경고 dd에는 `aria-labelledby`를 달지 않아 `getByLabelText("추정 청산가")`가 값 하나만 찾는다 — 근거: `components/calculator-layout.tsx`(dl grid 2열, `aria-live`).
- 고지는 루트 `div.flex.flex-col.gap-4` 안에서 `CalculatorLayout` 다음의 `p.text-sm.text-muted-foreground`로 둔다. `ResultRow`의 `toned`는 쓰지 않는다 — 근거: `components/calculator-layout.tsx`.
- `app/page.tsx`는 5행·15행 자리 줄만 한 줄짜리 등록 줄로 바꾼다. 두 줄 모두 oxfmt 기본 폭 100 안이라 꼬리표 위치가 유지된다 — 근거: CLAUDE.md 새 계산기 추가, `__tests__/repo/page-slots.test.ts`.
- 기존 테스트 파일은 고치지 않는다. 비활성 패널이 `hidden`이라 `calculator-tabs.test.tsx`·기존 E2E의 role 조회와 손익 패널 범위 조회는 영향받지 않는다 — 근거: `components/calculator-tabs.tsx`(`keepMounted`), `docs/plans/input-validation.md` 1장.
- 렌더 경로에 `Date`·`Math.random`·`crypto`를 두지 않고 id는 `useId`로 만든다. 병렬 Task는 자기 파일만 `bunx oxfmt`·`bunx oxlint`로 검사하고(골격의 `warn-todo` 때문), 저장소 전체 lint는 T-8에서 돈다. build와 test:e2e는 이 worktree에서 동시에 돌리지 않으며 `E2E_PORT=3221`, `DEV_PORT=3220`을 쓴다 — 근거: CLAUDE.md 병렬 개발, `docs/plans/input-validation.md` 테스트 설계 증거.

## 2. Task

### T-1 — 청산가 계산·표시 순수 모듈

- 사이드: 로직(lib)
- 상태: 완료
- 목적: 청산가·담보·틱 반올림·거리·경고 판정·거리 표시 함수를 화면과 분리해 만든다
- 선행: 없음
- 연결 항목: DoD-8, DoD-9, DoD-10, DoD-11, DoD-15, DoD-17, DoD-18, DoD-23, DoD-25
- 수정 대상: `lib/liquidation.ts` — 신규(계약의 타입·함수, `formatDistance`용 private 오차 정리·버림 포매터)
- 따라야 할 패턴: 별칭 import, 순수 함수, JSDoc 예시 주석 — 근거: `lib/pnl.ts`, `lib/format.ts`
- 완료 조건: 연결 항목과 스펙 4장 계약 충족(T-4 통과). 추가로 (1) React·DOM import가 없다 (2) 기존 `lib/*.ts` diff가 비어 있다 (3) 버림 포매터는 모듈 상수 하나다 (4) 새 의존성이 없다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt lib/liquidation.ts`, `bunx oxlint lib/liquidation.ts`, `bun run typecheck`, `bun run test __tests__/lib/liquidation.test.ts`
- 수정 금지: 기존 lib/ 파일, components/, app/, __tests__/, e2e/, package.json, bun.lock, 설정 파일, docs/
- 구현 기록: seongho:frontend-dev — lib/liquidation.ts. 수정 1/3(7단계 검증 결함 1: roundLiquidation이 유한한 입력에 Infinity를 돌려줌 — 결과 유한성 검사 추가)

### T-2 — 청산가 계산기 화면 컴포넌트

- 사이드: 프론트(UI 청산가)
- 상태: 완료
- 목적: 입력·마진 모드·경고·결과·고지를 가진 `LiquidationCalculator`를 만든다
- 선행: T-1
- 연결 항목: DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-12, DoD-13, DoD-14, DoD-16, DoD-19, DoD-20, DoD-21, DoD-22, DoD-24, DoD-26, DoD-27, DoD-28, DoD-29, DoD-30, DoD-31, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12, EC-13, EC-14, EC-15
- 수정 대상: `components/liquidation-calculator.tsx` — 신규(1장의 상태·계산 흐름, 인라인 마진 모드 토글, 교차 안내, 복제한 수량 경고 문구, 손절 경고, 결과 dl 안 경고 dd, 고지 문단)
- 따라야 할 패턴: 문자열 상태와 렌더 시 계산, 인라인 ToggleGroup, 공용 필드·레이아웃 import만, `cn`은 `@/lib/utils` — 근거: `components/pnl-calculator.tsx`, `components/fields/*.tsx`, `components/calculator-layout.tsx`, CLAUDE.md
- 완료 조건: 연결 항목 충족(T-5·T-6 통과). 추가로 (1) 공용 모듈과 `components/pnl-calculator.tsx` diff가 비어 있다 (2) `⚠`를 JSX 리터럴로 쓰지 않는다 (3) 결과 dl의 직계 자식이 dt/dd뿐이다 (4) 경고 dd에 `aria-labelledby`가 없다 (5) 렌더 경로에 `Date`·`Math.random`·`crypto`가 없다 — 검증: 테스트 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/liquidation-calculator.tsx`, `bunx oxlint components/liquidation-calculator.tsx`, `bun run typecheck`, `bun run test __tests__/components/liquidation-calculator.test.tsx __tests__/components/liquidation-warnings.test.tsx`
- 수정 금지: lib/, components/fields/, components/calculator-layout.tsx, components/calculator-tabs.tsx, components/ui/, components/pnl-calculator.tsx, app/, __tests__/, e2e/, package.json, 설정 파일
- 구현 기록: seongho:frontend-dev(T-1과 같은 에이전트) — components/liquidation-calculator.tsx. 수정 0/3

### T-3 — 탭 등록

- 사이드: 프론트(화면 구조)
- 상태: 완료
- 목적: `/` 탭 목록에 청산가 탭을 등록한다
- 선행: T-2
- 연결 항목: DoD-1, DoD-2, DoD-29, DoD-30
- 수정 대상: `app/page.tsx` — F-3 자리 두 줄만 등록 줄로 교체
- 따라야 할 패턴: 자리 줄 교체 규칙 — 근거: CLAUDE.md 새 계산기 추가, `__tests__/repo/page-slots.test.ts`
- 완료 조건: 연결 항목 충족(page-slots·T-5·T-7 통과). 추가로 (1) `git diff --numstat app/page.tsx`가 `2 2`이다 (2) oxfmt 후에도 두 등록 줄이 각각 한 줄이다 (3) `__tests__/page.test.tsx`·`__tests__/components/calculator-tabs.test.tsx`·`__tests__/repo/page-slots.test.ts`가 수정 없이 통과한다 (4) build 출력에서 `/`가 정적이고 prerender 오류가 없다 — 검증: 테스트 + 명령 + 확인 절차(diff 대조)
- 실행 명령: `bunx oxfmt app/page.tsx`, `bunx oxlint app/page.tsx`, `bun run typecheck`, `bun run test __tests__/repo/page-slots.test.ts __tests__/page.test.tsx __tests__/components/calculator-tabs.test.tsx`, `E2E_PORT=3221 bun run build`(다른 build·E2E가 돌지 않을 때만)
- 수정 금지: app/page.tsx의 F-3 두 줄 외 전부, app/layout.tsx, app/globals.css, components/, lib/, __tests__/, e2e/
- 구현 기록: seongho:frontend-dev(T-1·T-2와 같은 에이전트) — app/page.tsx(F-3 두 줄). 수정 0/3

### T-4 — lib 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 청산가 공식·담보·틱 반올림·거리·판정·거리 표시와 계약의 경계를 손계산 리터럴로 고정한다
- 선행: 없음
- 연결 항목: DoD-8, DoD-9, DoD-10, DoD-11, DoD-15, DoD-17, DoD-18, DoD-23, DoD-25
- 수정 대상: `__tests__/lib/liquidation.test.ts` — 신규(DoD-10을 별도 파일로 뺄지는 테스트 설계에서 정한다)
- 따라야 할 패턴: vitest 명시 import, JSDoc `@spec`·`@given`·`@when`·`@then`, 제목 `[DoD-N]` 접두, `toBeCloseTo`, `—`(U+2014) 정확 비교 — 근거: `__tests__/lib/step-format.test.ts`, `__tests__/lib/pnl-bybit.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기대값은 손계산 리터럴이다 (2) 반올림은 롱·숏 양쪽과 이미 틱 배수인 표본을 둔다 (3) 거리 표시는 버림이 드러나는 표본, 천 단위 구분 표본, `null`·비유한 표본을 둔다 (4) 판정 함수는 경계 같음과 `null`·0 이하 표본을 둔다 (5) 계약의 null·false 규칙(mmr 범위, 0 이하 가격, 무효 입력) 표본을 어느 태그 아래 둘지는 테스트 설계에서 정한다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib/liquidation.test.ts`, `bunx oxfmt --check __tests__/lib`, `bunx oxlint __tests__/lib/liquidation.test.ts`, `bun run typecheck`
- 수정 금지: lib/, 기존 __tests__ 파일, 설정 파일, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/lib/liquidation.test.ts. 수정 1/3(7단계 검증 결함 1에 따른 사용자 승인 테스트 설계 update: DoD-15 무효 입력 case에 비유한 결과 표본 추가)
- 테스트 파일·runner: `__tests__/lib/liquidation.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(순수 함수를 실제로 호출)
- 데이터 격리: 공유 상태가 없고 표본은 테스트마다 상수로 둔다

### T-5 — 컴포넌트 테스트(구성·계산·표시)

- 사이드: 테스트
- 상태: 완료
- 목적: 탭·카드·입력 구성, 초기 상태, 마진 모드, 격리·교차 계산, 결과 표시, 무효 입력, 모드 전환, 고지를 고정한다
- 선행: 없음(본문은 T-2와 병렬 작성, 통과 판정은 T-2·T-3 후)
- 연결 항목: DoD-1, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-12, DoD-13, DoD-14, DoD-16, DoD-19, DoD-20, DoD-28, DoD-31, EC-1, EC-2, EC-4, EC-5, EC-10
- 수정 대상: `__tests__/components/liquidation-calculator.test.tsx` — 신규(DoD-1만 `Page`를 렌더해 탭을 클릭하고 `findByRole("tabpanel")`로 찾으며, 나머지는 `LiquidationCalculator` 단독 렌더)
- 따라야 할 패턴: RTL + user-event 실제 키 입력, role·라벨 조회, `within`, 파일 내 헬퍼 복제 — 근거: `__tests__/components/pnl-validation.test.tsx`, `__tests__/components/calculator-tabs.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 결과는 `getByLabelText`의 textContent를 리터럴과 비교한다 (2) 탭 순서 판정은 목표가 탭이 있든 없든 성립한다 (3) 교차 레버리지 무관 판정은 둘 이상의 값과 빈 값을 쓴다 (4) `청산 없음`은 격리 레버리지 1과 교차 큰 잔고 표본을 모두 둔다 (5) 각 case 화면에 `NaN`·`Infinity`가 없다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components/liquidation-calculator.test.tsx`, `bunx oxfmt --check __tests__/components/liquidation-calculator.test.tsx`, `bunx oxlint __tests__/components/liquidation-calculator.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 기존 테스트 파일, vitest.setup.ts, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/components/liquidation-calculator.test.tsx. 수정 0/3
- 테스트 파일·runner: `__tests__/components/liquidation-calculator.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: jsdom에 없는 브라우저 API의 최소 폴리필(필요 시 보고)과 `console.error` `vi.spyOn`(관찰만)만 허용, `lib/*`·shadcn·Base UI의 `vi.mock` 금지(계획 승인 시 사용자 확정)
- 데이터 격리: 테스트마다 새로 렌더하고 `vitest.setup.ts`의 cleanup으로 DOM을 비운다. 브라우저 저장소를 쓰지 않는다

### T-6 — 컴포넌트 테스트(경고·재판정·안전성)

- 사이드: 테스트
- 상태: 완료
- 목적: 레버리지·수량·손절·한도·즉시 청산 경고와 비차단성, 심볼 전환 재판정, 표시 안전성을 고정한다
- 선행: 없음(본문은 T-2와 병렬 작성, 통과 판정은 T-2 후)
- 연결 항목: DoD-21, DoD-22, DoD-24, DoD-26, DoD-27, EC-3, EC-6, EC-7, EC-8, EC-9, EC-11, EC-12, EC-13, EC-14, EC-15
- 수정 대상: `__tests__/components/liquidation-warnings.test.tsx` — 신규
- 따라야 할 패턴: `aria-describedby` id 목록 판정, `⚠`(U+26A0) 정확 비교, 문서 순서 판정, `console.error` spy — 근거: `__tests__/components/pnl-validation.test.tsx`, `__tests__/components/pnl-calculator.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 입력란 경고는 `aria-describedby` 연결로 판정한다 (2) 결과 경고는 `청산가 결과` region 안에서 `추정 청산가` 값 뒤에 있는지로 판정하고, 두 경고가 함께면 순서도 판정한다 (3) 한도 금액은 BTC와 SOL 표기를 모두 본다 (4) 즉시 청산·한도 동시 표본은 손계산으로 정한다(예: SOLUSDT 롱, 레버리지 400, 진입가 1000, 수량 100) (5) 안정성 표본은 아주 큰 수, `.`, 0, 빠른 모드·심볼 전환을 포함한다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components/liquidation-warnings.test.tsx`, `bunx oxfmt --check __tests__/components/liquidation-warnings.test.tsx`, `bunx oxlint __tests__/components/liquidation-warnings.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 기존 테스트 파일, vitest.setup.ts, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/components/liquidation-warnings.test.tsx. 수정 0/3
- 테스트 파일·runner: `__tests__/components/liquidation-warnings.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: T-5와 같다(계획 승인 시 사용자 확정)
- 데이터 격리: T-5와 같다

### T-7 — 청산가 E2E

- 사이드: E2E
- 상태: 완료
- 목적: 프로덕션 빌드에서 청산가 탭 이동, 격리·교차 계산 흐름, 손절 경고를 확인한다
- 선행: T-2, T-3
- 연결 항목: DoD-1, DoD-24, DoD-29, DoD-30
- 수정 대상: `e2e/liquidation-calculator.spec.ts` — 신규(탭 클릭 후 `tabpanel "청산가"` 범위 locator, 열린 listbox 범위 옵션 선택, `청산가 결과` region 범위 결과 조회, 손절 경고는 접근 가능한 설명으로 판정)
- 따라야 할 패턴: 패널 범위 헬퍼, baseURL만 사용, 모든 조회에 `exact: true` — 근거: `e2e/pnl-calculator.spec.ts`, `e2e/calculator-tabs.spec.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) URL·포트를 하드코딩하지 않는다 (2) 기존 `e2e/*.spec.ts`와 함께 전부 통과한다 — 검증: E2E
- 실행 명령: `E2E_PORT=3221 bun run test:e2e e2e/liquidation-calculator.spec.ts`, `E2E_PORT=3221 bun run test:e2e`(다른 build·E2E가 이 worktree에서 돌지 않을 때만), `bunx oxfmt --check e2e`, `bunx oxlint e2e/liquidation-calculator.spec.ts`
- 수정 금지: playwright.config.ts, 기존 e2e 파일, app/, components/, lib/
- 구현 기록: seongho:e2e-dev(골격 작성 에이전트, 살 모드) — e2e/liquidation-calculator.spec.ts. 수정 0/3
- 테스트 파일·runner: `e2e/liquidation-calculator.spec.ts` — Playwright(chromium)
- mock 허용 경계: 없음(실제 프로덕션 빌드)
- 데이터 격리: 테스트마다 새 브라우저 컨텍스트, 저장 상태 없음
- 실행 환경: `http://localhost:3221`. Playwright webServer가 `bun run build && bun run start`로 `E2E_PORT=3221`에 띄우고 기존 서버를 재사용하지 않는다. 3221이 비어 있어야 한다. 첫 실행 전 `bunx playwright install chromium`이 필요할 수 있다. 로그인·사전 데이터 없음

### T-8 — 전체 정합성 검사

- 사이드: 검사
- 상태: 완료
- 목적: 모든 Task가 끝난 뒤 CI 순서대로 정합성 명령을 통과시킨다
- 선행: T-1, T-2, T-3, T-4, T-5, T-6, T-7
- 연결 항목: DoD-2
- 수정 대상: 없음(실행만)
- 따라야 할 패턴: CI check·e2e 잡 순서 — 근거: `.github/workflows/ci.yml`
- 완료 조건: 연결 항목 충족과 모든 명령 exit 0. 추가로 `git diff --stat`에 공용 모듈·`lib/pnl.ts`·`components/pnl-calculator.tsx`·기존 테스트 파일이 없다. 실패하면 해당 Task로 돌려보낸다 — 검증: 명령
- 실행 명령: `bun install --frozen-lockfile`, `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `E2E_PORT=3221 bun run build`, `E2E_PORT=3221 bun run test:e2e`(순차)
- 수정 금지: 모든 파일
- 구현 기록: 7단계 seongho:test-runner(정합성·단위·컴포넌트)·seongho:e2e-runner(build·E2E)가 실행한다. 수정 0/3

## 3. 항목 coverage

- DoD-1: T-3, T-5, T-7
- DoD-2: T-3, T-8
- DoD-3: T-2, T-5
- DoD-4: T-2, T-5
- DoD-5: T-2, T-5
- DoD-6: T-2, T-5
- DoD-7: T-2, T-5
- DoD-8: T-1, T-4
- DoD-9: T-1, T-4
- DoD-10: T-1, T-4
- DoD-11: T-1, T-4
- DoD-12: T-2, T-5
- DoD-13: T-2, T-5
- DoD-14: T-2, T-5
- DoD-15: T-1, T-4
- DoD-16: T-2, T-5
- DoD-17: T-1, T-4
- DoD-18: T-1, T-4
- DoD-19: T-2, T-5
- DoD-20: T-2, T-5
- DoD-21: T-2, T-6
- DoD-22: T-2, T-6
- DoD-23: T-1, T-4
- DoD-24: T-2, T-6, T-7
- DoD-25: T-1, T-4
- DoD-26: T-2, T-6
- DoD-27: T-2, T-6
- DoD-28: T-2, T-5
- DoD-29: T-2, T-3, T-7
- DoD-30: T-2, T-3, T-7
- DoD-31: T-2, T-5
- EC-1: T-2, T-5
- EC-2: T-2, T-5
- EC-3: T-2, T-6
- EC-4: T-2, T-5
- EC-5: T-2, T-5
- EC-6: T-2, T-6
- EC-7: T-2, T-6
- EC-8: T-2, T-6
- EC-9: T-2, T-6
- EC-10: T-2, T-5
- EC-11: T-2, T-6
- EC-12: T-2, T-6
- EC-13: T-2, T-6
- EC-14: T-2, T-6
- EC-15: T-2, T-6

## 4. 실행 순서

- 0: 테스트 설계에서 T-4·T-5·T-6·T-7 골격을 동결한다.
- 병렬 A: T-1, T-4 (수정 파일 겹침 없음).
- 순차: T-2(T-1 후) → T-3(T-2 후).
- 병렬 B: T-5, T-6 (본문은 T-2와 병렬 작성 가능, 통과 판정은 T-2·T-3 후, 파일 겹침 없음).
- 순차: T-7(T-2·T-3 후) → T-8.
- 공유 자원: 이 worktree의 `.next`와 포트 3221은 T-3 build·T-7·T-8이 함께 쓰므로 한 번에 하나만 돌린다. dev 서버는 `DEV_PORT=3220`. `vitest.setup.ts`는 어느 Task도 고치지 않는다.

## 5. 차단 사항

- 없음. Playwright chromium이 없으면 설치에 네트워크가 필요하다.
- 테스트 설계 확인 항목: `__tests__/repo/shared-modules.test.ts`의 공용 모듈 사용 검사를 F-3 컴포넌트로 넓힐지(넓힌다면 병렬 worktree 충돌을 피해 새 파일로), 계약 경계 표본의 태그, DoD-10 파일 위치.

## 테스트 설계 증거

- 상태: PASS (골격 동결 2026-11-23, 같은 날 7단계 결함 1에 따른 사용자 승인 update로 재동결)
- 기준 스펙: `docs/specs/liquidation-price.md` (상태 확정, 최종 갱신 2026-11-22). 테스트 설계 중 사용자 결정으로 DoD-22(경고 하나·최소 주문 수량 우선), DoD-26·EC-7(경고 위치 "추정 청산가 바로 아래, 청산가까지 거리보다 앞")을 갱신한 뒤의 스펙이다. 이전 digest(324e4eb3f3345e30, e4286290cdf059e4, 1a757fa0fa94fbdc, 7444e3c0b67b2d09)는 무효다.
- 골자 digest: `f923cd557e733066` (case 71, 항목 46 중 연결 45·제외 1)
- 확인 명령: `python3 /root/study/skills/dev-pipeline/skills/test-design/scripts/check-skeleton.py --spec docs/specs/liquidation-price.md --files __tests__/lib/liquidation.test.ts __tests__/components/liquidation-calculator.test.tsx __tests__/components/liquidation-warnings.test.tsx e2e/liquidation-calculator.spec.ts --exempt DoD-2 --frozen f923cd557e733066`
- 골격 파일:
  - `__tests__/lib/liquidation.test.ts` (T-4, 22 case): DoD-8, DoD-9, DoD-10, DoD-11, DoD-15, DoD-17, DoD-18, DoD-23, DoD-25. 스펙 4장 계약의 null·false 경계 표본은 해당 함수의 가장 가까운 DoD 태그 아래 별도 case로 둔다. DoD-10은 같은 파일의 별도 describe다.
  - `__tests__/components/liquidation-calculator.test.tsx` (T-5, 21 case): DoD-1, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-12, DoD-13, DoD-14, DoD-16, DoD-19, DoD-20, DoD-28, DoD-31, EC-1, EC-2, EC-4, EC-5, EC-10
  - `__tests__/components/liquidation-warnings.test.tsx` (T-6, 24 case): DoD-21, DoD-22, DoD-24, DoD-26, DoD-27, EC-3, EC-6, EC-7, EC-8, EC-9, EC-11, EC-12, EC-13, EC-14, EC-15
  - `e2e/liquidation-calculator.spec.ts` (T-7, 4 case): DoD-1, DoD-24, DoD-29, DoD-30
- 기계 검사: 통과(위 확인 명령, `--frozen` 제외).
- reviewer: 새 general-purpose 4회. 1회차 NEEDS-DECISION(중복 3, 빈틈 2, 결정 2) → 2회차 NEEDS-FIX(DoD-15 오차 경계 표본 부재 1, 서술 1) → 3회차 NEEDS-FIX(경고 위치 비교 대상 약화 1, 중복 1) → 자동 한도 3회 도달, 사용자 승인으로 4회차 → PASS(finding 없음). 매 회차 손계산 리터럴을 재계산했고 오류 0건. 매 회차 후 파일 불변(digest 재확인).
- update(2026-11-23): 7단계 검증에서 `roundLiquidation`이 유한한 입력에 Infinity를 돌려주는 계약 위반(결함 1)이 나왔다. 사용자 승인으로 `__tests__/lib/liquidation.test.ts`의 DoD-15 무효 입력 case에 비유한 결과 표본(9.029798334503863e+307, 롱, tickSize 0.1 → null)과 @then 한 줄을 추가했다(스펙 불변). 새 reviewer: NEEDS-FIX(case 제목 문구, digest 무관) → 제목 수정. 변경은 이 case 하나로 국한됨을 reviewer가 이전 digest 재구성으로 확인했다.
- 사람 확정:
  - mock 경계: 단위(T-4)·E2E(T-7)는 mock 없음(E2E는 실제 프로덕션 빌드). 컴포넌트(T-5·T-6)는 jsdom 폴리필(필요 시 보고)과 `console.error` `vi.spyOn` 관찰만, `lib/*`·shadcn·Base UI `vi.mock` 금지(계획 승인 시).
  - 제외: DoD-2 — 기존 `__tests__/repo/page-slots.test.ts`(수정 없이)와 T-3 diff 대조(`git diff --numstat app/page.tsx` = `2 2`)로 확인한다.
  - `__tests__/repo/shared-modules.test.ts`의 공용 모듈 사용 검사를 F-3로 넓히지 않는다. 공용 모듈 미수정은 T-2 완료 조건(파일 대조)과 T-8 diff 확인이 맡는다.
  - 해석: jsdom의 "아래"·"바로 아래"·"두 카드 아래"는 문서 순서로 판정한다. 결과 경고는 `추정 청산가` 값보다 뒤, `청산가까지 거리` 이름(라벨) 요소보다 앞이다.
- 본문 단계 주의:
  - 골격 단계의 `it.todo`·`test.fixme`는 oxlint `vitest(warn-todo)` 오류를 낸다. 본문 작성 중 lint는 `bunx oxlint`에 자기 파일 경로만 넘겨 한정하고, 저장소 전체 lint는 T-8에서 돈다.
  - T-5 완료 조건 (5) "각 case 화면에 NaN·Infinity 없음"은 골자가 아니라 파일 주석에만 있다. 본문에서 공통으로 확인한다.
  - EC-13 첫 case는 400자 표본을 여러 입력란·조합에 키 입력하므로 `testTimeout` 15000을 넘을 수 있다. case별 timeout으로 대응하고 골자는 바꾸지 않는다.
  - 테스트 파일에 명령 출력을 리다이렉트하지 않는다(`vitest list --json` 뒤에 테스트 파일 경로를 주면 그 파일이 출력으로 덮어써진다. 실제로 골격이 덮어쓰인 사고가 있었다).
- 미검증·검증 불가:
  - 알려진 한계(사용자 결정, 스펙 미변경): 숏 원값이 tickSize보다 작아 틱에 맞춘 청산가가 0이 되는 입력(진입가가 틱보다 작음, 예: BTC 진입가 0.05)에서는 추정 청산가 `0.00`, 거리 `—`, 즉시 청산·손절 경고가 표시된다. 실제로 거래되지 않는 범위 밖 입력으로 보고 다루지 않는다.
  - DoD-10의 Bybit 도움말 원문(36,380.25)은 페이지 시간 초과로 직접 읽지 못했다. 검색 결과에 인용된 예시값과 손계산 일치만 확인했다.
  - 실제 화면 배치(2열 grid)는 jsdom에서 검증하지 않는다. 실제 브라우저로 위치를 보는 것은 E2E DoD-24뿐이다.
  - 계약의 탭 `value: "liquidation"`과 `MarginMode` 타입 export는 case가 없고 T-3 diff 대조와 typecheck가 맡는다.
  - jsdom 폴리필 필요 여부와 골격이 runner에서 todo·fixme로 집계되는지는 실행 전이라 확인하지 않았다.

### 검증 기록

- 코드 기준: 2a6cccd + 작업 트리(신규 lib/liquidation.ts, components/liquidation-calculator.tsx, 테스트 4개, 스펙·계획 / 수정 app/page.tsx). 검증 중 `git status` 불변.
- 1회차(2026-11-23): verify 충족 45 / 부분 충족 2(EC-6, 4장 계약), test-runner 180/180 통과, e2e-runner 11/11 통과·`/` 정적.
  - 결함 1(제품, 낮음): `roundLiquidation`이 유한한 입력(9.029798334503863e+307, 롱, 0.1)에 Infinity 반환 → EC-6·계약 위반. T-1 수정 1/3, 테스트 설계 update(T-4 수정 1/3, digest f923cd557e733066).
  - 결함 2(스펙 공백, 낮음): 숏 원값 < tickSize → 틱 청산가 0. 사용자 결정으로 알려진 한계(스펙 미변경).
- 2회차(2026-11-23, 새 에이전트): verify 충족 53(DoD 31·EC 15·계약 7) / 부분·미충족 0, 골자 동결 유지(f923cd557e733066). test-runner: install·format:check·lint·typecheck 통과, `bun run test` 17 files·180 tests 통과(skip·todo 0), 범위 밖 변경 없음(`app/page.tsx` `2 2`). e2e-runner(E2E_PORT=3221): build 통과(`/` ○ 정적, prerender 오류 없음), 청산가 E2E 4/4, 전체 E2E 11/11 통과.
- 종합: DoD-1~31, EC-1~15 모두 충족(코드 대조 충족 + 연결 case assertion 통과). DoD-2는 기존 page-slots 테스트 통과와 diff `2 2`로 확인.
- 알려진 한계(verify 2회차 관찰, 8단계 사용자 결정, 스펙 미변경): 롱 원값이 양수이지만 tickSize×1e-12보다 작으면 `청산 없음`이 아니라 `0.000`·`—`로 표시된다(예: SOLUSDT 교차 롱 진입가 40·수량 1·잔고 39.999999999999993). 결함 2의 롱 쪽 대응인 범위 밖 입력으로 다루지 않는다. 실행 확인은 하지 않았다.
- 8단계(2026-11-23): 사용자 최종 승인.
- 미검증: DoD-10 Bybit 도움말 원문, 2열 grid 실제 배치(E2E DoD-24만 실제 좌표), 탭 `value`·`MarginMode` export는 diff 대조와 typecheck로만 확인.
