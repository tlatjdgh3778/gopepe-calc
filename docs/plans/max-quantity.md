# 계획: F-4 최대 진입 수량

- 상태: 승인
- 스펙: docs/specs/max-quantity.md
- 기준 코드: c8220f6 + 작업 트리(스펙 신규, 미커밋)
- 최종 갱신: 2026-11-25

## 1. 구현 전략

- 계산은 화면과 분리된 순수 TS 모듈 `lib/max-quantity.ts`에 두고 계약 함수 `maxQuantity`만 export한다. 공용 `isPositive`(lib/input), `qtyFromValue`(lib/pnl), `roundToStep`(lib/format)을 조합하고 자체 허용치·`Math.floor`를 두지 않는다. 실측(bun -e)으로 M1~M5·EC-5·EC-7 표본의 수량·표시·한도 판정이 스펙 표와 일치했고, 무작위 30만 건·배수 경계 20만 건을 BigInt 정확 내림과 대조해 불일치 0건이었다 — 근거: `lib/pnl.ts`, `lib/format.ts`, `docs/product/tech-stack.md` 구조 원칙.
- `roundToStep`은 유한한 입력에도 `Infinity`를 돌려줄 수 있다(실측: 잔고 1e306·레버리지 10·진입가 1·step 0.001). 내린 수량과 포지션 가치 모두 유한성 검사를 둔다. 세 입력은 곱하기 전에 각각 양수 검사를 한다 — 근거: `lib/liquidation.ts`의 `roundLiquidation`·`finiteOrNull`.
- 최소 수량 판정은 `qty < minOrderQty` 직접 비교다. `roundToStep` 결과와 `minOrderQty`는 같은 자릿수의 10진 표기에서 온 double이라 같은 값이면 같다. 세 심볼 모두 `qtyStep === minOrderQty`라 실데이터의 미달은 0뿐이므로, "0보다 크지만 미만" 분기는 단위 테스트의 합성 인자로 덮는다 — 근거: `lib/validation.ts`의 `checkQty`, `lib/symbols.ts`.
- 계산기 `components/max-quantity-calculator.tsx`는 `components/liquidation-calculator.tsx`처럼 입력 원문 문자열 상태를 들고 렌더할 때 계산한다. 공용 `SymbolSelect`·`LeverageField`·`DecimalField`·`CalculatorLayout`·`ResultRow`만 쓰고 `SideToggle`·`toned`는 쓰지 않는다. 한도 판정은 `lib/liquidation.ts`의 `exceedsFirstTier`를 import한다. 경고·고지 문구 함수와 상수는 이 파일 안에 둔다(F-3의 `tierWarningOf`는 비공개이고 문구가 다르다). 렌더 경로에 `Date`·`Math.random`·`crypto`를 쓰지 않는다 — 근거: `components/liquidation-calculator.tsx`, `components/pnl-calculator.tsx`.
- 결과 경고는 F-3처럼 결과 `dl` 안의 `col-span-2` 경고 `dd` 안의 `FieldWarning`로 두고, "최대 수량" 행 바로 아래에 배치한다. 위치는 스펙에 고정하지 않으며 테스트는 `최대 수량 결과` region 안에 있는지만 판정한다(사용자 결정). 고지는 `CalculatorLayout` 다음의 `p.text-sm.text-muted-foreground`다 — 근거: `components/liquidation-calculator.tsx`.
- 결과 라벨 `최대 수량`은 탭·탭 패널 이름과 겹친다(Base UI `TabsPanel`의 `aria-labelledby`). 새 테스트는 결과를 `최대 수량 결과` region 범위에서 찾고 `—`(U+2014)는 결과 셀 단위로 비교한다 — 근거: `__tests__/components/target-price-calculator.test.tsx`, `e2e/target-price-calculator.spec.ts`.
- 등록은 `app/page.tsx`의 F-4 자리 두 줄만 꼬리표 `// F-4`를 남긴 한 줄 등록(import 84자, 탭 항목 87자, oxfmt 폭 100 이내)으로 바꾼다 — 근거: CLAUDE.md "새 계산기 추가", `__tests__/repo/page-slots.test.ts`.
- 기존 테스트는 코드 대조상 F-4 등록으로 깨지지 않는다(탭 개수를 단정하는 테스트 없음, 기존 조회는 패널·region 범위). 새 탭 순서 테스트는 "청산가 바로 다음"만 판정하고 탭 개수·마지막 위치를 판정하지 않는다(병렬 F-5 병합 대비) — 근거: `__tests__/components/calculator-tabs.test.tsx`, `__tests__/components/target-price-tabs.test.tsx`, `e2e/calculator-tabs.spec.ts`.
- 병렬 Task는 자기 파일만 `bunx oxfmt`·`bunx oxlint 경로`로 검사하고 저장소 전체 lint는 T-7에서 판정한다. 테스트는 `bun run test`로만 실행한다. 이 worktree 포트는 `DEV_PORT=3230`·`E2E_PORT=3231`이고 build와 test:e2e를 동시에 돌리지 않는다. 테스트 파일에 명령 출력을 리다이렉트하지 않는다 — 근거: CLAUDE.md, F-3 계획.
- 로드맵 F-4 상태 갱신은 이 계획 범위가 아니다. main 머지 후 별도 커밋으로 한다 — 근거: 커밋 cf39aa9·482f937 관례.

## 2. Task

### T-1 — 최대 수량 계산 모듈

- 사이드: 프론트(lib)
- 상태: 완료
- 목적: 최대 수량·포지션 가치·최소 수량 미달 판정 순수 모듈을 만든다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, EC-2, EC-3, EC-5
- 수정 대상: `lib/max-quantity.ts` — 신규(`maxQuantity`, 결과 타입)
- 따라야 할 패턴: 순수 함수, `@/` 별칭 import, JSDoc 예시 주석, `null` 규칙과 유한성 검사 — 근거: `lib/pnl.ts`, `lib/liquidation.ts`, `lib/format.ts`
- 완료 조건: 연결 항목 충족(T-4 통과). 추가로 (1) React·DOM import가 없다 (2) 내림은 `roundToStep(…, "down")` 한 번이고 자체 허용치·`Math.floor`가 없다 (3) 유한한 입력 `(1e306, 10, 1, 0.001, 0.001)`에서 `qty`가 `null`이다 (4) 기존 `lib/*.ts`의 `git diff`가 비어 있다 (5) 새 의존성이 없다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt lib/max-quantity.ts`, `bunx oxlint lib/max-quantity.ts`, `bun run typecheck`, `bun run test __tests__/lib/max-quantity.test.ts`
- 수정 금지: lib/의 기존 파일, components/, app/, __tests__/, e2e/, package.json, bun.lock, 설정 파일, docs/
- 구현 기록: seongho:frontend-dev — lib/max-quantity.ts. 수정 0/3

### T-2 — 최대 수량 계산기 컴포넌트

- 사이드: 프론트(UI 계산기)
- 상태: 완료
- 목적: 최대 수량 입력·결과 카드와 경고·고지를 가진 계산기 컴포넌트를 만든다
- 선행: T-1
- 연결 항목: DoD-5, DoD-6, DoD-7, DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, DoD-14, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9
- 수정 대상: `components/max-quantity-calculator.tsx` — 신규
- 따라야 할 패턴: 문자열 상태와 렌더 시 계산, 공용 필드·레이아웃, 결과 dl 안의 `col-span-2` 경고 dd, 레이아웃 뒤 고지 문단, `cn`은 `@/lib/utils` — 근거: `components/liquidation-calculator.tsx`, `components/pnl-calculator.tsx`, CLAUDE.md
- 완료 조건: 연결 항목 충족(T-5 통과). 추가로 (1) 공용 모듈과 다른 계산기 파일의 diff가 비어 있다 (2) `⚠`를 JSX 리터럴로 쓰지 않는다 (3) 결과 dl의 직계 자식은 dt·dd뿐이고 경고 dd에 `aria-labelledby`가 없다 (4) 한도 판정은 import한 `exceedsFirstTier`로 하고 비교를 복제하지 않는다 (5) 표시 문자열은 `formatCoinQty`·`formatUsdt`·`formatPrice`로만 만들고 수량이 없으면 단위를 붙이지 않는다 (6) 렌더 경로에 `Date`·`Math.random`·`crypto`가 없다 (7) 다른 계산기와 상태를 공유하지 않는다 — 검증: 테스트 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/max-quantity-calculator.tsx`, `bunx oxlint components/max-quantity-calculator.tsx`, `bun run typecheck`, `bun run test __tests__/components/max-quantity-calculator.test.tsx`
- 수정 금지: lib/, components/fields/, components/calculator-layout.tsx, components/calculator-tabs.tsx, components/ui/, 다른 계산기 컴포넌트, app/, __tests__/, e2e/, package.json
- 구현 기록: seongho:frontend-dev(T-1과 같은 에이전트) — components/max-quantity-calculator.tsx. 수정 0/3

### T-3 — 화면 등록

- 사이드: 프론트(화면 등록)
- 상태: 완료
- 목적: 최대 수량 계산기를 `/` 화면의 청산가 다음 탭으로 등록한다
- 선행: T-2
- 연결 항목: DoD-12, DoD-13, DoD-14, DoD-15
- 수정 대상: `app/page.tsx` — F-4 자리 두 줄(import 1곳, 탭 항목 1곳)만
- 따라야 할 패턴: 자리 줄을 꼬리표 등록 줄로 바꾸는 규칙 — 근거: CLAUDE.md "새 계산기 추가", `__tests__/repo/page-slots.test.ts`
- 완료 조건: 연결 항목 충족(page-slots와 T-5의 Page 렌더 통과). 추가로 (1) `git diff --numstat app/page.tsx`가 `2 2`다 (2) oxfmt 후에도 두 등록 줄이 각각 한 줄이고 꼬리표가 줄 끝에 있다 (3) `// ---`·F-5 자리·`defaultValue="pnl"`이 그대로다 (4) 기존 `page.test.tsx`·`calculator-tabs.test.tsx`·`target-price-tabs.test.tsx`·`liquidation-calculator.test.tsx`가 수정 없이 통과한다 (5) build 출력에서 `/`가 정적(○)이고 prerender 오류가 없다 — 검증: 테스트 + 명령 + 확인 절차(diff 대조)
- 실행 명령: `bunx oxfmt app/page.tsx`, `bunx oxlint app/page.tsx`, `bun run typecheck`, `bun run test __tests__/repo/page-slots.test.ts __tests__/page.test.tsx __tests__/components/calculator-tabs.test.tsx __tests__/components/target-price-tabs.test.tsx __tests__/components/liquidation-calculator.test.tsx`, `bun run build`(이 worktree에서 다른 build·E2E가 돌지 않을 때만)
- 수정 금지: app/page.tsx의 F-4 두 줄 외 전부, 그 밖의 모든 파일
- 구현 기록: seongho:frontend-dev(T-1·T-2와 같은 에이전트) — app/page.tsx(F-4 자리 두 줄). 수정 0/3. build: `/` 정적(○), prerender 오류 없음

### T-4 — lib 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 최대 수량 계산 모듈을 단위 테스트로 고정한다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, EC-2, EC-3, EC-5
- 수정 대상: `__tests__/lib/max-quantity.test.ts` — 신규
- 따라야 할 패턴: vitest 함수 명시 import, JSDoc `@spec`·`@given`·`@when`·`@then`, 제목 `[DoD-N]`·`[EC-N]` 접두, 표 순회는 `it.each`, 기준 사례 표 주석 — 근거: `__tests__/lib/target-price.test.ts`, `__tests__/lib/liquidation.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기대값은 손계산 리터럴이며 구현 함수로 만들지 않는다 (2) DoD-1은 이미 배수인 표본(M5)과 내림이 일어나는 표본을 둔다 (3) DoD-2는 소수 2자리로 자르지 않은 값임이 드러나는 표본(M2)을 두고, DoD-4는 오차가 있는 M3을 `toBeCloseTo`로 비교한다 (4) EC-2는 각 입력의 `null`·0·음수 표본에서 `belowMin`이 `false`인지 본다 (5) EC-3은 곱 넘침과 `roundToStep` 넘침 표본을 둔다 (6) EC-5는 SOL 표본, 정확히 `minOrderQty`인 경계(미달 아님), 합성 `qtyStep ≠ minOrderQty` 표본을 둔다 (7) 기존 테스트 파일은 손대지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib/max-quantity.test.ts`, `bunx oxfmt --check __tests__/lib/max-quantity.test.ts`, `bunx oxlint __tests__/lib/max-quantity.test.ts`, `bun run typecheck`
- 수정 금지: lib/, 기존 __tests__ 파일, 설정 파일, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/lib/max-quantity.test.ts. 수정 0/3
- 테스트 파일·runner: `__tests__/lib/max-quantity.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(`lib/max-quantity`·`lib/format`·`lib/pnl`을 실제로 호출)
- 데이터 격리: 공유 상태가 없고 표본은 테스트마다 상수로 둔다

### T-5 — 컴포넌트 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 최대 수량 계산기의 입력·결과·경고·상태 전환과 탭 등록을 컴포넌트 테스트로 고정한다
- 선행: T-2, T-3
- 연결 항목: DoD-5, DoD-6, DoD-7, DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9
- 수정 대상: `__tests__/components/max-quantity-calculator.test.tsx` — 신규(계산기 단독 렌더) / `__tests__/components/max-quantity-tabs.test.tsx` — 신규(DoD-12, `Page` 렌더)
- 따라야 할 패턴: RTL + user-event 실제 키 입력, region·`within` 범위 조회, 패널은 `findByRole`, 헬퍼는 새 파일 안에 복제하고 기존 테스트 파일을 import하지 않는다 — 근거: `__tests__/components/target-price-calculator.test.tsx`, `__tests__/components/target-price-tabs.test.tsx`, `__tests__/components/liquidation-warnings.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 결과·경고는 리터럴과 정확히 비교하고 `⚠`(U+26A0)·`—`(U+2014)를 정확히 본다 (2) 탭 순서는 "청산가 바로 다음"만 판정한다 (3) DoD-9는 BTC 한도 문구(M2)와 SOL 한도 문구를 모두 본다 (4) EC-8은 경고가 켜지는 전환과 꺼지는 전환을 모두 둔다 (5) EC-3은 화면 입력 가능한 넘침 표본(긴 숫자 키 입력)을 쓰고 필요하면 case별 timeout을 둔다 (6) 경고 위치(행 순서)는 판정하지 않는다 (7) 각 case에서 화면에 `NaN`·`Infinity`가 없고 `console.error`가 호출되지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components/max-quantity-calculator.test.tsx __tests__/components/max-quantity-tabs.test.tsx`, `bunx oxfmt --check __tests__/components/max-quantity-calculator.test.tsx __tests__/components/max-quantity-tabs.test.tsx`, `bunx oxlint __tests__/components/max-quantity-calculator.test.tsx __tests__/components/max-quantity-tabs.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 기존 __tests__ 파일, vitest.setup.ts, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/components/max-quantity-calculator.test.tsx, __tests__/components/max-quantity-tabs.test.tsx. 수정 0/3
- 테스트 파일·runner: `__tests__/components/max-quantity-calculator.test.tsx`, `__tests__/components/max-quantity-tabs.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: `console.error`의 `vi.spyOn`(관찰만)만 허용한다. lib 모듈·shadcn·Base UI의 `vi.mock`과 jsdom 폴리필은 금지하고, `vitest.setup.ts` 변경이 필요하면 BLOCKED로 보고한다 (사용자 확인 필요)
- 데이터 격리: 테스트마다 새로 렌더하고 `vitest.setup.ts`의 `cleanup`으로 DOM을 비운다

### T-6 — E2E

- 사이드: E2E
- 상태: 완료
- 목적: 프로덕션 빌드에서 최대 수량 사용자 흐름과 손익↔최대 수량 탭 전환 유지를 E2E로 고정한다
- 선행: T-3
- 연결 항목: DoD-14, DoD-15
- 수정 대상: `e2e/max-quantity-calculator.spec.ts` — 신규
- 따라야 할 패턴: 탭 패널·결과 region 범위 locator와 `exact: true`, 심볼 옵션은 열린 listbox 범위, 너비마다 `browser.newContext({ viewport })`와 `try/finally`, baseURL만 사용 — 근거: `e2e/target-price-calculator.spec.ts`, `e2e/liquidation-calculator.spec.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) DoD-14는 768px·1280px 각각에서 M1을 본다 (2) DoD-15는 손익 탭에 F-1 C1, 최대 수량 탭에 C1과 값이 겹치지 않는 M3을 넣고 탭을 두 번 오간 뒤 양쪽 입력값과 결과를 비교한다 (3) 결과는 `최대 수량 결과` region 범위에서 찾는다 (4) URL·포트를 하드코딩하지 않는다 (5) 기존 `e2e/*.spec.ts`와 함께 전부 통과한다 — 검증: E2E
- 실행 명령: `E2E_PORT=3231 bun run test:e2e e2e/max-quantity-calculator.spec.ts`(이 worktree에서 다른 build·E2E가 돌지 않을 때만), `bunx oxfmt --check e2e/max-quantity-calculator.spec.ts`, `bunx oxlint e2e/max-quantity-calculator.spec.ts`
- 수정 금지: 기존 e2e 파일, playwright.config.ts, app/, components/, lib/
- 구현 기록: seongho:e2e-dev(골격 작성 에이전트, 살 모드) — e2e/max-quantity-calculator.spec.ts. 수정 0/3
- 테스트 파일·runner: `e2e/max-quantity-calculator.spec.ts` — Playwright(chromium)
- mock 허용 경계: 없음(프로덕션 빌드를 실제 브라우저로)
- 데이터 격리: 테스트마다 새 페이지 또는 새 브라우저 컨텍스트를 쓰고 저장 상태가 없다
- 실행 환경: `http://localhost` + `E2E_PORT=3231`. Playwright webServer가 `bun run build && bun run start`로 띄우고 기존 서버를 재사용하지 않는다(3231이 비어 있어야 한다). 첫 실행 전 `bunx playwright install chromium`이 필요할 수 있다. 로그인·사전 데이터 없음

### T-7 — 전체 정합성 검사

- 사이드: 검사
- 상태: 완료
- 목적: 기존 테스트를 포함한 저장소 전체 정합성 명령이 통과하는지 확인한다
- 선행: T-1, T-2, T-3, T-4, T-5, T-6
- 연결 항목: DoD-13, DoD-16
- 수정 대상: 없음(실행만)
- 따라야 할 패턴: CI 명령 순서 — 근거: `.github/workflows/ci.yml`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기존 단위·컴포넌트·저장소·E2E 테스트가 수정 없이 통과한다 (2) `git status`의 수정 파일은 `app/page.tsx` 하나이고 나머지는 신규 파일(스펙·계획 문서 포함)이다 (3) 실패하면 원인 Task로 돌려보낸다 — 검증: 명령
- 실행 명령: `bun install --frozen-lockfile`, `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, `E2E_PORT=3231 bun run test:e2e`(순차)
- 수정 금지: 모든 파일
- 구현 기록: 7단계 독립 검증의 seongho:test-runner(정합성 명령)·seongho:e2e-runner(E2E)가 실행한다(수정 없음)

## 3. 항목 coverage

- DoD-1: T-1, T-4
- DoD-2: T-1, T-4
- DoD-3: T-1, T-4
- DoD-4: T-1, T-4
- DoD-5: T-2, T-5
- DoD-6: T-2, T-5
- DoD-7: T-2, T-5
- DoD-8: T-2, T-5
- DoD-9: T-2, T-5
- DoD-10: T-2, T-5
- DoD-11: T-2, T-5
- DoD-12: T-2, T-3, T-5
- DoD-13: T-3, T-7
- DoD-14: T-2, T-3, T-6
- DoD-15: T-3, T-6
- DoD-16: T-7
- EC-1: T-2, T-5
- EC-2: T-1, T-2, T-4, T-5
- EC-3: T-1, T-2, T-4, T-5
- EC-4: T-2, T-5
- EC-5: T-1, T-2, T-4, T-5
- EC-6: T-2, T-5
- EC-7: T-2, T-5
- EC-8: T-2, T-5
- EC-9: T-2, T-5

## 4. 실행 순서

- 0: 테스트 설계 단계에서 T-4·T-5·T-6의 골격을 동결한다.
- 병렬 A: T-1, T-4(본문) — 수정 파일이 겹치지 않는다.
- 순차: T-2(T-1 후) → T-3(T-2 후).
- 병렬 B: T-5, T-6(본문 작성, T-3 후) — 수정 파일이 겹치지 않는다. T-3의 `bun run build`, T-6의 `bun run test:e2e`, T-7은 `.next`·포트를 공유하므로 한 번에 하나만 실행한다.
- 마지막: T-7.

## 5. 차단 사항

- 없음

## 테스트 설계 증거

- 상태: PASS(사용자 확정 종결 — 3회차 reviewer의 잔여 finding이 골자 주석 오기 1건(Low)뿐이어서, 수정 후 기계 검사로 종결하기로 사용자가 결정)
- 기준 스펙: docs/specs/max-quantity.md(상태 확정, EC-3 예시 교체 반영본)
- 골자 digest: `ee077473ff72a720`
- 동결 확인 명령: `python3 /root/study/skills/dev-pipeline/skills/test-design/scripts/check-skeleton.py --spec docs/specs/max-quantity.md --files __tests__/lib/max-quantity.test.ts __tests__/components/max-quantity-calculator.test.tsx __tests__/components/max-quantity-tabs.test.tsx e2e/max-quantity-calculator.spec.ts --exempt DoD-13,DoD-16 --frozen ee077473ff72a720`
- 골격 파일(case 수, 모두 미구현 표기):
  - `__tests__/lib/max-quantity.test.ts` — 5(`it.todo`), T-4
  - `__tests__/components/max-quantity-calculator.test.tsx` — 16(`it.todo`), T-5
  - `__tests__/components/max-quantity-tabs.test.tsx` — 2(`it.todo`), T-5
  - `e2e/max-quantity-calculator.spec.ts` — 2(`test.fixme`), T-6
- 기계 검사: 통과(항목 25개 중 case 연결 23개, 제외 2개, case 25개)
- reviewer(매번 새 general-purpose, 읽기 전용, 파일 변경 없음 확인):
  - 1회차 NEEDS-FIX — lib DoD-1~4 case 중복, `toBeCloseTo` 정밀도 미지정, DoD-9 음성 case 중복, EC-2·EC-9 빈 값 중복, E2E C1 표시 문자열 부정확 → 반영
  - 2회차 NEEDS-FIX — `Math.floor` 구현이 통과하는 표본 부족(S1 추가), 4자리 반올림 판별 표본(E1 추가), 입력별 양수 검사 판별 표본(동시 음수 추가), 부정 @then 정리, M2 한도 경고 중복 정리, EC-9에 EC-2 추적 연결 → 반영
  - 3회차 NEEDS-FIX — E1 원값 주석 오기 1건(Low), nit 2건(DoD-9 결과 셀 재확인, 첫 화면 case 분리 — F-2 관례와 같아 유지). TD-01~08 충족, 새 case 요구 없음 → 오기 수정 후 기계 검사로 종결(사용자 결정)
- 사람 확정:
  - mock 경계: T-4 없음(실제 lib 호출), T-5 `console.error`의 `vi.spyOn`(관찰만)만 허용하고 lib·shadcn·Base UI의 `vi.mock`과 jsdom 폴리필 금지, T-6 없음(프로덕션 빌드·실제 브라우저). jsdom PASS는 실제 브라우저 PASS가 아니며 그 범위는 E2E가 덮는다
  - 제외: DoD-13 — 기존 `__tests__/repo/page-slots.test.ts`, T-3의 `git diff --numstat app/page.tsx` = `2 2` 조건, tabs DoD-12 case가 판정. DoD-16 — 명령 종료 코드 항목이라 T-7이 실행
- 본문 단계 주의:
  - 결과는 `최대 수량 결과` region 범위에서 찾는다(라벨이 탭 패널 이름과 겹침). `⚠`(U+26A0)·`—`(U+2014)는 정확히 비교한다
  - `toBeCloseTo`는 정밀도 6 이상
  - EC-3 컴포넌트 case는 307·309자리 키 입력이라 case별 timeout이 필요할 수 있다
  - 골격의 `it.todo`·`test.fixme`가 남은 동안 저장소 전체 `bun run lint`는 `vitest(warn-todo)`로 실패한다. T-7 전에 모든 본문이 채워져야 한다
- 미검증·검증 불가: E2E(DoD-14·DoD-15)의 실제 브라우저 결과와 EC-3 키 입력 소요 시간은 실행 전이라 확인하지 않았다

## 검증 기록

- 코드 기준: c8220f6 + 작업 트리(미커밋, `app/page.tsx` 2줄 수정 + 신규 파일), 2026-11-25
- 스펙 대조: 새 general-purpose + seongho:verify — 충족 22 / 부분 0 / 미충족 0 / 검증 불가 3(DoD-14·15·16, 실행 근거 필요), 스코프 초과·드리프트·결함 0, 골자 digest `ee077473ff72a720` 동결 유지, 미구현 표기 0
- 테스트 실행: seongho:test-runner — `bun install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test`(23 files, 281 tests), `build`(`○ /` 정적, prerender 오류 없음) 모두 종료 코드 0. 새 파일: lib 23, calculator 16, tabs 2, page-slots 2 통과. skip·todo 없음
- E2E 실행: seongho:e2e-runner — `E2E_PORT=3231` F-4 spec 2/2, 전체 16/16 통과(회귀 없음), 실제 chromium·프로덕션 빌드
- 읽기 전용 확인: 세 검증 후 `git status` 변화 없음
- 경미한 검증 공백(결함 아님, verify 보고): lib DoD-1~4 case가 정상 표본의 `belowMin === false`를 따로 assert하지 않는다(스펙 요구 아님)

| 스펙 항목 | 코드 대조 (`verify`) | 실행 확인 (`test-runner`·`e2e-runner`) | 종합 |
|---|---|---|---|
| DoD-1 | 충족 | 확인됨 — lib test DoD-1~4 case(23 통과) | 충족 |
| DoD-2 | 충족 | 확인됨 — 같은 case(M2·E1 toBeCloseTo 6) | 충족 |
| DoD-3 | 충족 | 확인됨 — 같은 case(M1~M5 리터럴) | 충족 |
| DoD-4 | 충족 | 확인됨 — 같은 case | 충족 |
| DoD-5 | 충족 | 확인됨 — calculator test DoD-5 case | 충족 |
| DoD-6 | 충족 | 확인됨 — calculator test DoD-6 case | 충족 |
| DoD-7 | 충족 | 확인됨 — calculator test DoD-7/8/9 case | 충족 |
| DoD-8 | 충족 | 확인됨 — 같은 case | 충족 |
| DoD-9 | 충족 | 확인됨 — DoD-9 한도 초과 case(BTC 300,000·SOL 50,000) | 충족 |
| DoD-10 | 충족 | 확인됨 — DoD-10 case(5개 상태) | 충족 |
| DoD-11 | 충족 | 확인됨 — DoD-11 case | 충족 |
| DoD-12 | 충족 | 확인됨 — tabs test 2 case | 충족 |
| DoD-13 | 충족(diff 2 2) | 확인됨 — 기존 page-slots test 2 통과 | 충족 |
| DoD-14 | 검증 불가(실행 필요) | 확인됨 — e2e-runner DoD-14 통과(768·1280px) | 충족 |
| DoD-15 | 검증 불가(실행 필요) | 확인됨 — e2e-runner DoD-15 통과 | 충족 |
| DoD-16 | 검증 불가(실행 범위 밖) | 확인됨 — test-runner format:check·lint·typecheck·test(281/281)·build 종료 코드 0, e2e-runner test:e2e 16/16 종료 코드 0 | 충족 |
| EC-1 | 충족 | 확인됨 — EC-1 case 2건 | 충족 |
| EC-2 | 충족 | 확인됨 — lib EC-2 case, calculator EC-2·EC-9 case | 충족 |
| EC-3 | 충족 | 확인됨 — lib EC-3 case, calculator EC-3 case(309·307자리) | 충족 |
| EC-4 | 충족 | 확인됨 — EC-4 case | 충족 |
| EC-5 | 충족 | 확인됨 — lib EC-5 case 2건, calculator EC-5/6 case | 충족 |
| EC-6 | 충족 | 확인됨 — EC-5/6 case | 충족 |
| EC-7 | 충족 | 확인됨 — EC-7 case | 충족 |
| EC-8 | 충족 | 확인됨 — EC-8 case 2건 | 충족 |
| EC-9 | 충족 | 확인됨 — EC-9 case | 충족 |
