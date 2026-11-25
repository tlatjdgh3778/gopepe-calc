# 계획: F-5 평균 진입가

- 상태: 승인
- 스펙: docs/specs/average-entry.md
- 기준 코드: c8220f6 + 작업 트리(스펙 신규, 미커밋)
- 최종 갱신: 2026-11-25

## 1. 구현 전략

- 계산은 화면과 분리된 순수 TS 모듈 `lib/average-entry.ts`에 둔다. 유한 양수 검사 헬퍼는 `lib/pnl.ts`의 것이 export되지 않고 공용 모듈은 수정 금지이므로 이 파일 안에 둔다. 합은 입력 순서대로 단일 패스로 구한다 — 근거: `docs/product/tech-stack.md` 구조 원칙, `lib/pnl.ts`, `lib/target-price.ts`.
- 기준 사례 A1~A5를 `bun -e`로 실측했다. `formatPrice`·`formatCoinQty` 표시값은 스펙 표와 모두 일치한다. 원값은 A1 `100000.06666666667`, A3 `2433.1882000000005`, A5 `150.12366666666665`로 오차가 있어 단위 테스트는 스펙 DoD-1의 비교 규칙(정확 표본은 일치, 나머지는 상대 1e-12)을 따른다. A1·A3의 총 수량(0.001+0.002, 0.33+0.67)은 정확히 0.003·1이다 — 근거: `lib/format.ts`.
- 계산기 `components/average-entry-calculator.tsx`는 행을 `{ id: number; price: string; qty: string }[]` 원문 문자열 상태로 들고 렌더할 때 계산한다. 초기 2행 id는 상수(0·1), 다음 id는 `useRef` 카운터로 만들고 증가는 `setRows` updater 밖 이벤트 핸들러에서 한다(StrictMode 이중 실행 대비). 렌더 경로에 `Date`·`Math.random`·`crypto`를 쓰지 않는다. 행 key는 id이고 index를 쓰지 않는다. 행 번호는 렌더 시 index+1이다 — 근거: `components/pnl-calculator.tsx`, `next.config.ts`(`cacheComponents`), F-2 계획 1장.
- 행 입력란은 공용 `DecimalField`를 그대로 쓰고 label에 행 번호를 넣는다. `DecimalField`는 ref를 받지 않으므로 포커스 이동은 진입가 입력란을 감싼 행 내부 요소의 callback ref(React 19 cleanup ref)를 id별 `Map`에 모으고, 핸들러가 목표 행 id를 기록한 뒤 `useEffect`에서 그 요소의 `input`에 `focus()`한다. `DecimalField`를 수정·복제하지 않는다 — 근거: `components/fields/decimal-field.tsx`.
- `components/ui/`에 button이 없으므로 추가·삭제 버튼은 F-5 컴포넌트 안의 네이티브 button 요소(`type="button"`)와 Tailwind 클래스로 만든다. 삭제 버튼은 보이는 글자 `삭제`에 `aria-label`로 행 번호 접근 이름을 준다. 행 컨테이너에 이름 있는 role을 두지 않는다(스펙에 없는 접근 이름을 만들지 않는다). 새 패키지·shadcn 컴포넌트를 추가하지 않는다 — 근거: `components/ui/` 목록.
- 행→계산 입력 변환은 컴포넌트 내부 함수로 둔다. 빈 칸은 원문 `""`·`"."`로 판정하고, 나머지는 `Number`로 바꿔 `averageEntry`에 넘긴다(0·비유한 판정은 lib가 한다) — 근거: 스펙 §5.1·§5.2, `lib/input.ts`.
- 표시는 `formatPrice`·`formatCoinQty`로만 만들고, 총 수량이 없을 때는 `formatCoinQty`가 돌려주는 `—`에 코인을 붙이지 않게 분기한다. `ResultRow`의 `toned`는 쓰지 않는다 — 근거: `lib/format.ts`, `components/calculator-layout.tsx`.
- 수량 경고는 공용 `checkQty`로 판정하고, 문구 함수는 `components/pnl-calculator.tsx`의 `qtyWarningOf`에서 USDT 분기를 뺀 복제본을 F-5 파일에 둔다. 판정 전 `isPositive(toNumber(qty))`로 거른다. 경고는 `DecimalField`의 `warning`으로 넘긴다 — 근거: `components/pnl-calculator.tsx`, `lib/validation.ts`.
- 등록은 `app/page.tsx`의 F-5 자리 두 줄만 꼬리표 `// F-5` 한 줄 등록으로 바꾼다. 두 줄은 86자·90자로 oxfmt 100자 안이고 `page-slots.test.ts`의 등록 정규식에 맞는 것을 실측했다. F-4 자리와는 `// ---`로 떨어져 있어 F-4 병합과 충돌하지 않는다 — 근거: CLAUDE.md "새 계산기 추가", `__tests__/repo/page-slots.test.ts`.
- 탭 왕복 유지는 `CalculatorTabs`의 `keepMounted`로 추가 코드 없이 충족된다. 결과 라벨 `평균 진입가`는 탭·패널 이름과 겹치므로 새 테스트는 결과를 `평균 진입가 결과` region 범위에서 찾는다. 기존 테스트는 코드 대조상 F-5 등록으로 깨지지 않으며 실행 확인은 T-7에서 한다 — 근거: `components/calculator-tabs.tsx`, `e2e/target-price-calculator.spec.ts`.
- 병렬 Task는 자기 파일만 `bunx oxfmt`·`bunx oxlint`한다. 골격의 `it.todo`·`test.fixme`가 남은 동안 저장소 전체 lint는 T-7에서 판정한다. 이 worktree 포트는 `DEV_PORT=3240`·`E2E_PORT=3241`이고 병렬 F-4 worktree와 다르다. 이 worktree에서 build와 test:e2e를 동시에 돌리지 않는다 — 근거: CLAUDE.md, F-2 계획 1장.
- 로드맵 F-5 상태 갱신은 이 계획 범위가 아니다. main 머지 후 별도 커밋으로 한다 — 근거: 커밋 cf39aa9·482f937 관례.

## 2. Task

### T-1 — 평균 진입가 계산 모듈

- 사이드: 프론트(lib)
- 상태: 완료
- 목적: F-6이 재사용할 평균 진입가 순수 함수를 만든다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, EC-5, EC-6
- 수정 대상: `lib/average-entry.ts` — 신규(`averageEntry`, 내부 유한 양수 헬퍼)
- 따라야 할 패턴: 순수 모듈과 `@/` 별칭, `null` 규칙, 파일 내부 헬퍼 — 근거: `lib/pnl.ts`, `lib/target-price.ts`
- 완료 조건: 연결 항목 충족(T-4 통과). 추가로 (1) React·DOM·`lib/format` import가 없고 반올림하지 않는다 (2) 입력 배열을 변경하지 않는다 (3) 합 오버플로로 결과가 유한하지 않으면 `null`로 걸러진다(중간 곱만 넘치는 극단 입력의 결과는 스펙 비목표라 고정하지 않는다, 사용자 결정) (4) `git diff lib/`의 기존 파일 변경이 비어 있다 (5) 새 의존성이 없다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt lib/average-entry.ts`, `bunx oxlint lib/average-entry.ts`, `bun run typecheck`, `bun run test __tests__/lib/average-entry.test.ts`
- 수정 금지: lib/의 기존 파일, components/, app/, __tests__/, e2e/, package.json, bun.lock
- 구현 기록: seongho:frontend-dev — lib/average-entry.ts. 수정 0/3

### T-2 — 평균 진입가 계산기 컴포넌트

- 사이드: 프론트(UI 계산기)
- 상태: 완료
- 목적: 동적 진입 행 입력과 결과 카드를 가진 계산기 컴포넌트를 만든다
- 선행: T-1
- 연결 항목: DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-18, DoD-19, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12, EC-13, EC-14
- 수정 대상: `components/average-entry-calculator.tsx` — 신규
- 따라야 할 패턴: 입력 원문 상태와 렌더 시 계산, 공용 `SymbolSelect`·`DecimalField`·`CalculatorLayout`·`ResultRow`, 판정 코드를 문구로 바꾸는 `qtyWarningOf` — 근거: `components/pnl-calculator.tsx`, `components/target-price-calculator.tsx`
- 완료 조건: 연결 항목 충족(T-5 통과). 추가로 (1) 행 key는 카운터 id이고 index key가 없다 (2) id 증가가 updater 밖에 있다 (3) 렌더 경로에 `Date`·`Math.random`·`crypto`가 없다 (4) 포커스 이동이 `DecimalField` 수정·복제 없이 이뤄진다 (5) 파일에 `⚠` 리터럴이 없고 경고는 `warning` prop으로만 넘긴다 (6) 표시 문자열은 `formatPrice`·`formatCoinQty`로만 만든다 (7) 다른 계산기와 상태를 공유하지 않는다 (8) 공용 모듈 diff가 비어 있다 — 검증: 테스트 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/average-entry-calculator.tsx`, `bunx oxlint components/average-entry-calculator.tsx`, `bun run typecheck`, `bun run test __tests__/components/average-entry-calculator.test.tsx`
- 수정 금지: components/fields/, components/ui/, components/calculator-layout.tsx, components/calculator-tabs.tsx, 다른 계산기 파일, lib/, app/, __tests__/, e2e/, CLAUDE.md
- 구현 기록: seongho:frontend-dev(T-1 에이전트가 작성 중 세션 종료로 중단 → 새 seongho:frontend-dev 인스턴스가 대조·마무리, 주석의 `⚠` 1줄 수정) — components/average-entry-calculator.tsx. 수정 0/3

### T-3 — 화면 등록

- 사이드: 프론트(화면 등록)
- 상태: 완료
- 목적: 평균 진입가 계산기를 `/` 화면의 마지막 탭으로 등록한다
- 선행: T-2
- 연결 항목: DoD-20, DoD-21, DoD-22, DoD-23
- 수정 대상: `app/page.tsx` — F-5 자리 두 줄(import 1곳, 탭 항목 1곳)만
- 따라야 할 패턴: 자리 줄을 꼬리표 등록 줄로 바꾸는 규칙 — 근거: CLAUDE.md "새 계산기 추가", `__tests__/repo/page-slots.test.ts`, F-2 계획 T-4
- 완료 조건: 연결 항목 충족(기존 `page-slots.test.ts`와 T-5·T-6 통과). 추가로 (1) `git diff app/page.tsx`가 정확히 두 줄 교체다 (2) oxfmt 후에도 각 등록 줄이 한 줄이고 꼬리표가 줄 끝에 남는다 (3) `defaultValue="pnl"`과 F-4 자리 줄이 그대로다 (4) build 출력에서 `/`가 정적이고 prerender·hydration 오류가 없다 — 검증: 테스트 + 명령 + 확인 절차(diff 대조)
- 실행 명령: `bunx oxfmt app/page.tsx`, `bun run test __tests__/repo/page-slots.test.ts __tests__/page.test.tsx __tests__/components/calculator-tabs.test.tsx`, `bun run typecheck`, `E2E_PORT=3241 bun run build`(다른 build·E2E가 돌지 않을 때만)
- 수정 금지: app/page.tsx의 다른 줄, 그 외 모든 파일
- 구현 기록: seongho:frontend-dev — app/page.tsx(F-5 자리 두 줄). 수정 0/3. build: `/` 정적(○), prerender 오류 없음

### T-4 — lib 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 평균 진입가 계산 모듈의 계산과 `null` 규칙을 단위 테스트로 고정한다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, EC-5, EC-6
- 수정 대상: `__tests__/lib/average-entry.test.ts` — 신규
- 따라야 할 패턴: vitest 함수 명시 import, JSDoc `@spec`·`@given`·`@when`·`@then`, 제목 `[DoD-N]`·`[EC-N]` 접두, 표 순회는 `it.each` — 근거: `__tests__/lib/target-price.test.ts`, `__tests__/lib/step-format.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기대값은 손계산 리터럴이고 구현 함수로 만들지 않는다 (2) 정확 표본(A2·A4와 그 총 수량)은 일치, 오차 표본(A1·A3·A5)은 상대 1e-12로 비교한다 (3) `null` 표본에 빈 배열, price 0, qty 0, 음수, NaN, ±Infinity, 합 오버플로를 둔다(곱 오버플로 표본은 두지 않는다, 사용자 결정) (4) 입력 배열이 바뀌지 않음을 본다 (5) 기존 테스트 파일은 손대지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib/average-entry.test.ts`, `bunx oxfmt --check __tests__/lib/average-entry.test.ts`, `bunx oxlint __tests__/lib/average-entry.test.ts`, `bun run typecheck`
- 수정 금지: lib/, 기존 __tests__ 파일, 설정 파일, package.json
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/lib/average-entry.test.ts. 수정 0/3
- 테스트 파일·runner: `__tests__/lib/average-entry.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(`lib/average-entry`를 실제로 호출) — 테스트 설계 단계에서 사용자 확정
- 데이터 격리: 공유 상태가 없고 표본은 테스트마다 상수로 둔다

### T-5 — 컴포넌트 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 계산기의 행 조작·포커스·계산·경고·심볼 변경과 탭 등록을 컴포넌트 테스트로 고정한다
- 선행: T-2, T-3
- 연결 항목: DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-18, DoD-19, DoD-20, EC-1, EC-2, EC-3, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12, EC-13, EC-14
- 수정 대상: `__tests__/components/average-entry-calculator.test.tsx` — 신규(계산기 단독 렌더) / `__tests__/components/average-entry-tabs.test.tsx` — 신규(DoD-20, `app/page` 렌더)
- 따라야 할 패턴: RTL + user-event, `screen`·`within`, 헬퍼는 각 파일 안에 두고 기존 테스트 파일을 import하지 않는다 — 근거: `__tests__/components/target-price-calculator.test.tsx`, `__tests__/components/target-price-tabs.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 결과는 `평균 진입가 결과` region 범위에서 찾는다 (2) 포커스는 `document.activeElement`와 접근 이름으로 찾은 입력란의 동일성으로 판정한다 (3) DoD-17은 글자마다 포커스와 값을 확인한다 (4) DoD-18은 서로 다른 값의 3행에서 중간 행을 지운 뒤 앞당겨진 행의 값을 본다 (5) 접근 이름은 정확 일치로 찾는다(`진입가 1`과 `진입가 1x` 구별) (6) 경고는 `aria-describedby`가 가리키는 요소로 판정하고 `⚠`(U+26A0)·`—`(U+2014)를 정확히 비교한다 (7) EC-1에 붙여넣기 표본을 둔다 (8) EC-13·EC-14는 심볼에 따라 결과·경고가 달라지는 표본을 쓴다 (9) 각 EC 테스트에서 화면에 `NaN`·`Infinity`가 없고 `console.error`가 호출되지 않는다 (10) 탭 파일은 F-4 병합 순서와 무관하게 판정한다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components`, `bunx oxfmt --check __tests__/components`, `bunx oxlint __tests__/components/average-entry-calculator.test.tsx __tests__/components/average-entry-tabs.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 기존 __tests__ 파일, vitest.setup.ts, vitest.config.mts, package.json
- 구현 기록: seongho:test-dev(살 모드) — __tests__/components/average-entry-calculator.test.tsx, __tests__/components/average-entry-tabs.test.tsx. 수정 0/3
- 테스트 파일·runner: `__tests__/components/average-entry-calculator.test.tsx`, `__tests__/components/average-entry-tabs.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: `console.error`의 `vi.spyOn`(관찰만)만 허용한다. `vi.mock`, jsdom 폴리필, `vitest.setup.ts` 변경은 금지하고 필요하면 BLOCKED로 보고한다 — 테스트 설계 단계에서 사용자 확정
- 데이터 격리: 테스트마다 새로 렌더하고 `vitest.setup.ts`의 `cleanup`으로 DOM을 비운다

### T-6 — E2E

- 사이드: E2E
- 상태: 완료
- 목적: 프로덕션 빌드에서 포커스·행 값 유지·기준 사례·탭 왕복을 E2E로 고정한다
- 선행: T-3
- 연결 항목: DoD-11, DoD-13, DoD-14, DoD-17, DoD-18, DoD-22, DoD-23
- 수정 대상: `e2e/average-entry-calculator.spec.ts` — 신규
- 따라야 할 패턴: 탭 패널 범위 locator, 심볼 옵션은 열린 listbox 범위, 결과는 결과 region 범위의 `exact: true` 조회, 너비마다 `browser.newContext({ viewport })`와 `try/finally` — 근거: `e2e/target-price-calculator.spec.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) DoD-22 표본은 A4(심볼 변경과 `행 추가`를 함께 거친다)로 768px·1280px에서 확인한다 (2) 포커스는 `toBeFocused`로 판정한다 (3) DoD-17은 한 글자씩 입력한다 (4) DoD-23은 평균 진입가 → 손익 → 평균 진입가로 오간 뒤 행 수·값·결과를 비교한다 (5) URL·포트를 하드코딩하지 않는다 (6) 기존 `e2e/*.spec.ts`와 함께 전부 통과한다 — 검증: E2E
- 실행 명령: `E2E_PORT=3241 bun run test:e2e e2e/average-entry-calculator.spec.ts`, `E2E_PORT=3241 bun run test:e2e`(이 worktree에서 다른 build·E2E가 돌지 않을 때만), `bunx oxfmt --check e2e`, `bunx oxlint e2e/average-entry-calculator.spec.ts`
- 수정 금지: 기존 e2e 파일, playwright.config.ts, app/, components/, lib/
- 구현 기록: seongho:e2e-dev(살 모드) — e2e/average-entry-calculator.spec.ts. 수정 0/3
- 테스트 파일·runner: `e2e/average-entry-calculator.spec.ts` — Playwright(chromium)
- mock 허용 경계: 없음(프로덕션 빌드를 실제 브라우저로) — 테스트 설계 단계에서 사용자 확정
- 데이터 격리: 테스트마다 새 페이지 또는 새 브라우저 컨텍스트를 쓰고 저장 상태가 없다
- 실행 환경: `http://localhost` + `E2E_PORT=3241`. Playwright webServer가 `bun run build && bun run start`로 띄우고 기존 서버를 재사용하지 않는다(3241이 비어 있어야 한다). 로그인·사전 데이터 없음. 필요하면 `bunx playwright install chromium`을 먼저 실행한다

### T-7 — 전체 정합성 검사

- 사이드: 검사
- 상태: 완료
- 목적: 기존 테스트를 포함한 저장소 전체 정합성 명령이 통과하는지 확인한다
- 선행: T-1, T-2, T-3, T-4, T-5, T-6
- 연결 항목: DoD-21, DoD-24
- 수정 대상: 없음(실행만)
- 따라야 할 패턴: CI 명령 순서 — 근거: `.github/workflows/ci.yml`, F-2 계획 T-8
- 완료 조건: 연결 항목 충족. 추가로 (1) 기존 단위·컴포넌트·저장소·E2E 테스트가 수정 없이 통과한다 (2) `git diff --stat`의 수정 파일은 `app/page.tsx` 하나이고 나머지는 신규 파일이다 (3) 실패하면 원인 Task로 돌려보낸다 — 검증: 명령
- 실행 명령: `bun install --frozen-lockfile`, `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `E2E_PORT=3241 bun run build`, `E2E_PORT=3241 bun run test:e2e`(순차)
- 수정 금지: 모든 파일
- 구현 기록: 7단계 독립 검증의 seongho:test-runner(정합성 명령)·seongho:e2e-runner(E2E)가 실행했다(수정 없음)

## 3. 항목 coverage

- DoD-1: T-1, T-4
- DoD-2: T-1, T-4
- DoD-3: T-1, T-2, T-5
- DoD-4: T-1, T-2, T-5
- DoD-5: T-2, T-5
- DoD-6: T-2, T-5
- DoD-7: T-2, T-5
- DoD-8: T-2, T-5
- DoD-9: T-2, T-5
- DoD-10: T-2, T-5
- DoD-11: T-2, T-5, T-6
- DoD-12: T-2, T-5
- DoD-13: T-2, T-5, T-6
- DoD-14: T-2, T-5, T-6
- DoD-15: T-2, T-5
- DoD-16: T-2, T-5
- DoD-17: T-2, T-5, T-6
- DoD-18: T-2, T-5, T-6
- DoD-19: T-2, T-5
- DoD-20: T-3, T-5
- DoD-21: T-3, T-7
- DoD-22: T-3, T-6
- DoD-23: T-3, T-6
- DoD-24: T-7
- EC-1: T-2, T-5
- EC-2: T-2, T-5
- EC-3: T-2, T-5
- EC-4: T-2, T-5
- EC-5: T-1, T-2, T-4, T-5
- EC-6: T-1, T-2, T-4, T-5
- EC-7: T-2, T-5
- EC-8: T-2, T-5
- EC-9: T-2, T-5
- EC-10: T-2, T-5
- EC-11: T-2, T-5
- EC-12: T-2, T-5
- EC-13: T-2, T-5
- EC-14: T-2, T-5

## 4. 실행 순서

- 0: 테스트 설계 단계에서 T-4·T-5·T-6의 골격을 동결한다.
- 병렬 A: T-1, T-4(본문) — 수정 파일이 겹치지 않는다.
- 순차: T-2(T-1 후) → T-3(T-2 후).
- 병렬 B: T-5, T-6(본문 작성, T-3 후) — 수정 파일이 겹치지 않는다. T-3의 `bun run build`, T-6의 `bun run test:e2e`, T-7은 `.next`·포트 3241을 공유하므로 한 번에 하나만 실행한다.
- 마지막: T-7.

## 5. 차단 사항

- 없음

## 테스트 설계 증거

- 상태: PASS(동결). 기계 검사와 새 reviewer가 같은 digest에서 통과했고 사람 확정이 끝났다.
- 기준 스펙: docs/specs/average-entry.md(확정, DoD-1·DoD-2 비교 규칙과 DoD-20 판정 기준 갱신 반영)
- 골자 digest: `72746f6c3aa2418b`
- 확인 명령: `python3 /root/study/skills/dev-pipeline/skills/test-design/scripts/check-skeleton.py --spec docs/specs/average-entry.md --files __tests__/lib/average-entry.test.ts __tests__/components/average-entry-calculator.test.tsx __tests__/components/average-entry-tabs.test.tsx e2e/average-entry-calculator.spec.ts --exempt DoD-21,DoD-24 --frozen 72746f6c3aa2418b`
- 골격 파일(항목 38개 중 case 연결 36개, 제외 2개, case 44개):
  - `__tests__/lib/average-entry.test.ts` — 7 case, DoD-1·DoD-2·EC-5·EC-6 (T-4, seongho:test-dev)
  - `__tests__/components/average-entry-calculator.test.tsx` — 29 case, DoD-3~DoD-19·EC-1~EC-14 (T-5, seongho:test-dev)
  - `__tests__/components/average-entry-tabs.test.tsx` — 2 case, DoD-20 (T-5, seongho:test-dev)
  - `e2e/average-entry-calculator.spec.ts` — 6 case, DoD-11·DoD-13·DoD-14·DoD-17·DoD-18·DoD-22·DoD-23 (T-6, seongho:e2e-dev)
- 기계 검사: 통과(`--exempt DoD-21,DoD-24`).
- reviewer(매회 새 general-purpose, 읽기 전용, 매회 `git status` 불변 확인):
  - 1회차(digest d69d88bfaf597f45): NEEDS-FIX — 수량 경고 `aria-describedby` 행별 연결 미확인(Med), 같은 시작 상태 case 중복, 중복 `@then`, EC-1 표본 문구 모호(Low). 반영.
  - 2회차(e1382581d149be5c): NEEDS-FIX — 삭제 뒤 추가 경로 부재로 `rows.length` id 구현 통과(Med), DoD-5 case 중복, E2E DoD-18 약한 중복(Low). 반영.
  - 3회차(04807bdcaf2ac40f): PASS. 곱 오버플로 표본 해석을 사람 결정으로 올림 → 사용자 결정으로 제거(골자 변경).
  - 4회차(5efc9a27e11d6d9c): NEEDS-FIX — 소수 10자리 반올림 구현이 DoD-1 오차 표본을 통과. 사용자 결정으로 반영(작은 가격 표본 추가).
  - 5회차(72746f6c3aa2418b): PASS, finding 없음.
- 사람 확정(사용자):
  - 제외: DoD-21 — 기존 `__tests__/repo/page-slots.test.ts`(등록 줄 형식·순서·구분 줄)와 T-3 완료 조건 (1)·T-7 완료 조건 (2)의 `git diff` 확인으로 검증한다. DoD-24 — T-7 정합성 명령으로 검증한다.
  - mock 경계: lib 단위·E2E는 mock 없음. 컴포넌트 테스트는 `console.error`의 `vi.spyOn`(관찰만)만 허용하고 `vi.mock`·jsdom 폴리필·`vitest.setup.ts` 변경은 금지한다(필요 시 BLOCKED 보고). 이 경계의 jsdom 포커스 PASS는 실제 브라우저 PASS가 아니며 E2E가 따로 확인한다.
  - 극단 입력: 곱 오버플로 표본을 두지 않는다(스펙 §2 비목표, 계산 방식 비고정). 합 오버플로 표본만 둔다.
  - 반올림 판별: DoD-1 오차 표본에 작은 가격 표본 `[(0.0001234, 1), (0.0001235, 2)]`를 둔다.
- 본문 단계 주의: 골격의 `it.todo`·`test.fixme`가 남은 동안 `vitest(warn-todo)` 때문에 저장소 전체 `bun run lint`가 실패한다. 본문 작성 Task는 자기 파일만 `bunx oxlint`하고 전체 lint는 T-7에서 판정한다.
- 미검증·검증 불가: jsdom에서 base-ui Select 심볼 변경 조작(EC-13·EC-14)과 user-event 붙여넣기 재현(EC-1)은 본문 실행 전이라 확인하지 않았다(기존 계산기 테스트에 같은 패턴이 있다). 극단 입력의 화면 불변식은 사용자 확정 범위로 별도 case를 두지 않았다.

### 검증 기록

- 코드 기준: c8220f6 + 미커밋 작업 트리(2026-11-25). 검증 전후 `git status --short` 동일(읽기 전용 확인).
- 스펙 대조: 새 general-purpose + seongho:verify — 충족 35 / 부분 0 / 미충족 0 / 검증 불가 3(DoD-22·23·24, 실행 항목). 스코프 초과·스펙 드리프트·결함 0. 골자 digest 72746f6c3aa2418b 동결 유지.
- test-runner: `bun install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test`(23 files / 278 passed), `E2E_PORT=3241 build`(`/` 정적) 모두 종료 코드 0. F-5 대상 4파일 40 case 통과.
- e2e-runner: `E2E_PORT=3241 bun run test:e2e e2e/average-entry-calculator.spec.ts` 6 passed, 전체 `test:e2e` 20 passed, 종료 코드 0.
- 수정 재위임: 없음(모든 Task 수정 0/3).

| 스펙 항목 | 코드 대조 (verify) | 실행 확인 (test-runner·e2e-runner) | 종합 |
|---|---|---|---|
| DoD-1 | 충족 | 확인됨 — U 정확·오차 표본 case | 충족 |
| DoD-2 | 충족 | 확인됨 — U 정확·오차 표본 case | 충족 |
| DoD-3 | 충족 | 확인됨 — T [DoD-3][DoD-4][DoD-5] | 충족 |
| DoD-4 | 충족 | 확인됨 — T [DoD-3][DoD-4][DoD-5] | 충족 |
| DoD-5 | 충족 | 확인됨 — T [DoD-3][DoD-4][DoD-5] | 충족 |
| DoD-6 | 충족 | 확인됨 — T [DoD-6] | 충족 |
| DoD-7 | 충족 | 확인됨 — T [DoD-7] | 충족 |
| DoD-8 | 충족 | 확인됨 — T [DoD-8] | 충족 |
| DoD-9 | 충족 | 확인됨 — T [DoD-9] | 충족 |
| DoD-10 | 충족 | 확인됨 — T [DoD-10][DoD-11][DoD-18] | 충족 |
| DoD-11 | 충족 | 확인됨 — T [DoD-10][DoD-11][DoD-18] + E [DoD-11][DoD-18] | 충족 |
| DoD-12 | 충족 | 확인됨 — T [DoD-12][DoD-13] | 충족 |
| DoD-13 | 충족 | 확인됨 — T [DoD-12][DoD-13]·[DoD-13][DoD-18] + E [DoD-13][DoD-18] | 충족 |
| DoD-14 | 충족 | 확인됨 — T [DoD-14]·[DoD-14][DoD-15] + E [DoD-14] | 충족 |
| DoD-15 | 충족 | 확인됨 — T [DoD-14][DoD-15] | 충족 |
| DoD-16 | 충족 | 확인됨 — T [DoD-16] | 충족 |
| DoD-17 | 충족 | 확인됨 — T [DoD-17] + E [DoD-17] | 충족 |
| DoD-18 | 충족 | 확인됨 — T 2 case + E 2 case | 충족 |
| DoD-19 | 충족 | 확인됨 — T [DoD-19] 2 case | 충족 |
| DoD-20 | 충족 | 확인됨 — TB [DoD-20] 2 case | 충족 |
| DoD-21 | 충족 | 확인됨 — page-slots 2 case + git diff --stat(app/page.tsx +2/−2) | 충족 |
| DoD-22 | 검증 불가(실행 필요) | 확인됨 — E [DoD-22] 768·1280px | 충족 |
| DoD-23 | 검증 불가(실행 필요) | 확인됨 — E [DoD-23] | 충족 |
| DoD-24 | 검증 불가(실행 필요) | 확인됨 — format:check·lint·typecheck·test(278)·build·test:e2e(20) 모두 종료 코드 0 | 충족 |
| EC-1 | 충족 | 확인됨 — T [EC-1] case | 충족 |
| EC-2 | 충족 | 확인됨 — T [EC-2] case | 충족 |
| EC-3 | 충족 | 확인됨 — T [EC-3] case | 충족 |
| EC-4 | 충족 | 확인됨 — T [EC-4] case | 충족 |
| EC-5 | 충족 | 확인됨 — T [EC-5] case + U | 충족 |
| EC-6 | 충족 | 확인됨 — T [EC-6] case + U | 충족 |
| EC-7 | 충족 | 확인됨 — T [EC-7] case | 충족 |
| EC-8 | 충족 | 확인됨 — T [EC-8] case | 충족 |
| EC-9 | 충족 | 확인됨 — T [EC-9] case | 충족 |
| EC-10 | 충족 | 확인됨 — T [EC-10] case | 충족 |
| EC-11 | 충족 | 확인됨 — T [EC-11] case | 충족 |
| EC-12 | 충족 | 확인됨 — T [EC-12] case | 충족 |
| EC-13 | 충족 | 확인됨 — T [EC-13] case | 충족 |
| EC-14 | 충족 | 확인됨 — T [EC-14] case | 충족 |

- 관찰(결함 아님): 삭제 버튼 연타 시 클로저 `rows` 사용(재현 경로 없음), 극단 언더플로 입력에서 avgPrice 0 표시(NaN·Infinity 아님, 비목표 범위).
- 미검증·한계: §5 머리 불변식은 EC 표본 범위에서만 확인했다(극단 입력은 사용자 확정 범위). jsdom 포커스는 E2E로 따로 확인했다. 수동 시각 확인(레이아웃·스타일)은 하지 않았다.
