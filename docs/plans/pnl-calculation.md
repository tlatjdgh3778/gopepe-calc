# 계획: F-1 손익 계산

- 상태: 승인
- 스펙: docs/specs/pnl-calculation.md
- 기준 코드: 4327388 + 작업 트리(스펙·계획·테스트 골격 신규, 미커밋)
- 최종 갱신: 2026-11-21

## 1. 구현 전략

- 계산·표시는 화면 없는 순수 모듈(`lib/symbols.ts`, `lib/pnl.ts`, `lib/format.ts`)에 두고, 화면은 클라이언트 컴포넌트 하나(`components/pnl-calculator.tsx`)가 입력을 문자열 상태로 들고 렌더 시 계산한다. 문자열 생성은 `lib/format.ts`만 한다 — 근거: `docs/product/tech-stack.md` 구조 원칙.
- `app/page.tsx`는 동기 서버 컴포넌트로 두고 기존 h1 아래에 계산기를 렌더한다. `cacheComponents: true`에서 클라이언트 컴포넌트도 빌드 시 prerender되므로 렌더 경로에서 `Date`·`Math.random`·`crypto`·`useSearchParams`를 쓰지 않고, id는 `useId`로 만든다 — 근거: `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md`.
- shadcn 컴포넌트는 `bunx --bun shadcn@latest add input label select toggle-group card --yes`로 추가하고(toggle 동반), 생성 결과는 내용 수정 없이 oxfmt 포맷만 한다 — 근거: `docs/plans/project-skeleton.md` T-1의 공식 도구 산출물 관례, `components.json`(base-nova).
- 접근 이름은 Base UI 폼 가이드를 따른다: Input은 `Label`의 `htmlFor`, Select는 `Select.Label` 또는 `aria-labelledby`, ToggleGroup은 그룹 `aria-labelledby`. ToggleGroup 값이 빈 배열이 되는 해제 동작은 무시해 항상 하나가 선택되게 한다 — 근거: `node_modules/@base-ui/react/docs/react/handbook/forms.md`.
- 숫자 표시는 원값을 소수 10자리에서 사사오입해 부동소수점 오차를 정리한 뒤 `Intl.NumberFormat("en-US")`(`roundingMode: "trunc"`, `signDisplay`)로 만들고 음수 부호를 U+2212로 치환한다. 자릿수는 호출부가 `decimals`로 넘기고, 증거금 자릿수는 `SYMBOLS`의 `marginDecimals`에서 읽는다. 단위 전환 시 채우는 문자열은 같은 모듈의 지수 표기 없는 8자리 사사오입 형식 함수로 만든다(버림 미적용).
- 화면 배치는 계산기 컴포넌트가 shadcn `Card` 두 개(제목 `입력`·`결과`)를 `md` 기준(768px) 2열 grid로 놓고, 좁은 화면에서는 1열로 쌓는다. `app/page.tsx`는 `main`에 여백·최대 폭·가운데 정렬과 h1 제목 크기만 준다. 다크 모드는 `globals.css`의 `@custom-variant dark`를 `prefers-color-scheme: dark` 미디어 쿼리로 바꾸고 `.dark` 블록을 같은 미디어 쿼리의 `:root`로 옮겨 OS 설정을 따른다 — 근거: `app/globals.css`, Tailwind 4 `@custom-variant`, shadcn `card`.
- 입력 필터는 `type="text"`·`inputMode`와 정규식(레버리지 `^\d*$`, 나머지 `^\d*\.?\d*$`)으로 맞지 않는 변경 전체를 버린다. 레버리지가 비면 계산에 0을 넘긴다(계약상 0 이하 → `null`).
- 병렬 Task는 저장소 전체 포맷을 돌리지 않고 자기 파일만 `bunx oxfmt` 경로 지정으로 포맷한다. 테스트는 반드시 `bun run test`로 실행한다. `bun run build`와 `bun run test:e2e`는 `.next`·포트 3201을 공유하므로 동시에 돌리지 않는다.

## 2. Task

### T-1 — 의존성과 shadcn 컴포넌트 추가

- 사이드: 프론트(기반)
- 상태: 완료
- 목적: 화면과 컴포넌트 테스트가 쓸 shadcn 컴포넌트와 user-event를 설치한다
- 선행: 없음
- 연결 항목: DoD-17
- 수정 대상: `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/select.tsx`, `components/ui/toggle.tsx`, `components/ui/toggle-group.tsx`, `components/ui/card.tsx` — shadcn add 생성 결과(포맷만). 단 `components/ui/label.tsx`는 범용 래퍼의 `jsx-a11y(label-has-associated-control)` 오탐을 막는 `oxlint-disable-next-line` 주석 한 줄을 추가한다(사용자 결정) / `package.json` — devDependencies에 `@testing-library/user-event` 최신판 / `bun.lock` — 갱신
- 따라야 할 패턴: 공식 도구 산출물을 그대로 쓴다 — 근거: `docs/plans/project-skeleton.md`, `components.json`
- 완료 조건: (1) dependencies에 새 항목이 없고, shadcn이 기존 패키지 버전을 바꿨다면 diff를 보고한다 (2) 생성 파일 목록이 수정 대상과 같고 다르면 보고한다 (3) `components.json`·`app/globals.css`가 바뀌지 않았다 (4) `bun install --frozen-lockfile`이 성공한다 (5) 기존 `__tests__/page.test.tsx`가 통과한다 — 검증: 명령
- 실행 명령: `bunx --bun shadcn@latest add input label select toggle-group card --yes`(이미 있는 파일은 덮어쓰지 않는다), `bun add -d @testing-library/user-event@latest`, `bunx oxfmt components/ui`, `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test __tests__/page.test.tsx`
- 수정 금지: app/, lib/, __tests__/, e2e/, components.json, 설정 파일, docs/, CLAUDE.md
- 구현 기록: seongho:frontend-dev — components/ui/{input,label,select,toggle,toggle-group}.tsx, package.json, bun.lock. 수정 1/3(label.tsx lint 오탐, 사용자 결정으로 인라인 주석). `card` 추가는 DoD-21·22 반영으로 seongho:frontend-dev에 다시 위임해 components/ui/card.tsx만 추가했다(기존 파일·package.json·bun.lock 무변경). 수정 1/3

### T-2 — 계산·표시 순수 모듈

- 사이드: 로직(lib)
- 상태: 완료
- 목적: 화면과 분리된 심볼 데이터, 손익 계산, 표시 형식 모듈을 만든다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, DoD-8, DoD-13, DoD-14, DoD-18, DoD-20, EC-3, EC-5, EC-6, EC-7, EC-8
- 수정 대상: `lib/symbols.ts` — 심볼 3종(기초 코인, 증거금 자릿수)과 타입 / `lib/pnl.ts` — `calculatePnl`, `qtyFromValue` / `lib/format.ts` — `formatUsdt`, `formatPercent`, 참고 코인 수량 형식, 단위 전환용 입력 문자열 형식
- 따라야 할 패턴: 화면과 분리된 순수 TS 모듈, 별칭 import — 근거: `docs/product/tech-stack.md`, `lib/utils.ts`
- 완료 조건: 연결 항목 충족(T-4·T-5 통과). 추가로 (1) React·DOM import가 없다 (2) 새 의존성이 없다 (3) 오차 정리·버림·채움 사사오입은 `lib/format.ts`에만 있다 (4) 양의 유한수 검사가 `NaN`을 통과시키지 않는다 (5) 각 결과는 자기 계산에 필요한 값만 검사한다(레버리지가 없어도 `pnl`은 계산된다) (6) 심볼에 F-7·F-3 필드가 없다 — 검증: 테스트
- 실행 명령: `bunx oxfmt lib`, `bun run lint`, `bun run typecheck`, `bun run test __tests__/lib`
- 수정 금지: `lib/utils.ts`, package.json, bun.lock, __tests__/, e2e/, app/, components/
- 구현 기록: seongho:frontend-dev — lib/symbols.ts, lib/pnl.ts, lib/format.ts. 수정 0/3

### T-3 — 계산기 화면 통합

- 사이드: 프론트(UI)
- 상태: 완료
- 목적: `/`에서 입력 즉시 결과가 갱신되는 계산기 화면을 만든다
- 선행: T-1, T-2
- 연결 항목: DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-19, DoD-20, DoD-21, DoD-22, DoD-23, EC-1, EC-2, EC-3, EC-4, EC-9, EC-10, EC-11, EC-12, EC-13
- 수정 대상: `components/pnl-calculator.tsx` — 신규 클라이언트 컴포넌트(입력 상태, 입력 필터, 단위 전환, 선택 심볼의 증거금 자릿수와 손익 4자리를 넘기는 결과 표시·색, 손익·ROE 요소에 `data-tone="profit|loss|neutral"` 표식과 그 값에 따른 `text-profit`·`text-loss` 적용, `aria-live` 결과 영역, h1 없음, 제목 `입력`·`결과` 카드 두 개를 768px 이상 2열·미만 1열로 배치) / `app/page.tsx` — 기존 h1 아래 계산기 렌더, 동기 함수 유지, `main` 여백·최대 폭·가운데 정렬과 h1 제목 크기 / `app/globals.css` — `:root`·다크 블록에 `--profit`·`--loss`, `@theme inline`에 `--color-profit`·`--color-loss`, 다크 변형과 다크 토큰 블록을 `prefers-color-scheme: dark` 미디어 쿼리로 전환
- 따라야 할 패턴: shadcn 컴포넌트와 `cn`, Base UI 라벨 전략, globals.css의 `:root`·`.dark`·`@theme inline` 3단 구조, 렌더 중 동기 IO 금지 — 근거: `app/globals.css`, `node_modules/@base-ui/react/docs/react/handbook/forms.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md`
- 완료 조건: 연결 항목 충족(T-6·T-7 통과). 추가로 (1) 직접 작성한 파일 중 `"use client"`는 이 컴포넌트 하나다 (2) build 출력에서 `/`가 정적이고 prerender 오류가 없다 (3) `next/font/google`·외부 URL·fetch가 없다 (4) 렌더 경로에 `Date`·`Math.random`·`crypto`가 없다 (5) 색 토큰이 라이트·다크 배경에서 4.5:1 이상 대비를 가진다 (6) 기존 `__tests__/page.test.tsx`·`e2e/home.spec.ts`가 수정 없이 통과한다 (7) 카드 배치 변경 후에도 접근 이름·`data-tone`·`aria-live` 계약이 그대로여서 T-6 테스트가 수정 없이 통과한다 (8) `.dark` 클래스에 기대는 선택자가 남지 않는다 — 검증: 명령 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/pnl-calculator.tsx app`, `bun run lint`, `bun run typecheck`, `bun run test __tests__/page.test.tsx __tests__/components`, `bun run build`(다른 build·E2E가 돌지 않을 때만)
- 수정 금지: lib/, components/ui/, package.json, bun.lock, 설정 파일, __tests__/, e2e/, `app/layout.tsx`
- 구현 기록: seongho:frontend-dev — components/pnl-calculator.tsx, app/page.tsx, app/globals.css. 수정 0/3. DoD-21·22·23 반영으로 seongho:frontend-dev에 다시 위임해 같은 세 파일을 수정했다(카드 region 2열/1열, main 레이아웃, 다크 미디어 쿼리). 수정 0/3

### T-4 — lib 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 계산·표시 모듈의 정상 동작과 경계를 단위 테스트로 고정한다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-6, DoD-7, DoD-8, DoD-18, EC-3, EC-5, EC-6, EC-7, EC-8
- 수정 대상: `__tests__/lib/pnl.test.ts` — 계산 모듈 / `__tests__/lib/format.test.ts` — 표시 형식 모듈
- 따라야 할 패턴: vitest 함수 명시 import, JSDoc `@spec`·`@given`·`@when`·`@then`, 한국어 테스트 이름 — 근거: `__tests__/page.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기대값은 손계산 리터럴이며 구현 함수로 만들지 않는다 (2) DoD-18 경계값(양수·음수의 0 방향 버림, `100.35 − 100` 같은 부동소수점 오차)을 명시적으로 다룬다 (3) 레버리지 없이 `pnl`이 계산되는 사례가 있다 (4) `−`(U+2212)·`—`(U+2014)를 정확히 비교한다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib`, `bunx oxfmt --check __tests__/lib`, `bun run lint`, `bun run typecheck`
- 수정 금지: lib/, 설정 파일, package.json, bun.lock. 의존성이 필요하면 BLOCKED로 보고한다
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/lib/pnl.test.ts, __tests__/lib/format.test.ts. 수정 0/3
- 테스트 파일·runner: `__tests__/lib/pnl.test.ts`, `__tests__/lib/format.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(순수 함수를 실제로 호출)
- 데이터 격리: 공유 상태가 없고 사례는 테스트마다 상수로 둔다

### T-5 — Bybit 기준 사례 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 사용자가 제공한 Bybit 계산기 값과 계산 결과가 같음을 고정한다
- 선행: 없음
- 연결 항목: DoD-5, DoD-18
- 수정 대상: `__tests__/lib/pnl-bybit.test.ts` — 스펙 DoD-5 기준 사례 표(입력·Bybit 표시값), 상단 주석에 기준일, DoD-18 규칙과 DoD-20 자릿수를 따르는 테스트 내부 자릿수 헬퍼
- 따라야 할 패턴: T-4와 같은 관례, `test.each`로 사례 표 순회 — 근거: `__tests__/page.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 표가 심볼 3종·롱·숏·손익 양수·음수·0을 모두 덮는다 (2) 스펙 표의 값을 바꾸지 않고 옮긴다 (3) `formatUsdt`를 재사용하지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib/pnl-bybit.test.ts`, `bunx oxfmt --check __tests__/lib/pnl-bybit.test.ts`
- 수정 금지: lib/, T-4 파일, 설정 파일, package.json, bun.lock
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/lib/pnl-bybit.test.ts. 수정 0/3
- 테스트 파일·runner: `__tests__/lib/pnl-bybit.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(순수 함수를 실제로 호출)
- 데이터 격리: 정적 사례 표만 쓴다

### T-6 — 계산기 컴포넌트 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 화면의 초깃값, 즉시 갱신, 단위 전환, 입력 필터, 상태 전환을 jsdom에서 고정한다
- 선행: T-1
- 연결 항목: DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-19, DoD-20, EC-1, EC-2, EC-3, EC-4, EC-9, EC-10, EC-11, EC-12, EC-13
- 수정 대상: `__tests__/components/pnl-calculator.test.tsx` — `PnlCalculator` 렌더와 `userEvent.setup()`, 역할·라벨 기반 조회
- 따라야 할 패턴: `__tests__/page.test.tsx` 관례, Base UI 접근 이름 — 근거: `__tests__/page.test.tsx`, `node_modules/@base-ui/react/docs/react/handbook/forms.md`
- 완료 조건: 연결 항목 충족. 추가로 (1) 입력은 실제 키 입력으로 넣고, EC-1·EC-2는 붙여넣기 사례도 포함한다 (2) EC 테스트마다 화면 텍스트에 `NaN`·`Infinity`가 없음을 확인한다 (3) DoD-12·EC-12는 손익·ROE 요소의 `data-tone` 값(`profit`·`loss`·`neutral`)으로 판정한다 (4) Select 포인터 조작이 불안정하면 키보드 조작으로 대체한다 (5) DoD-20은 2자리 심볼과 SOLUSDT(3자리)의 증거금을 모두 본다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components`, `bunx oxfmt --check __tests__/components`, `bun run lint`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, package.json, bun.lock. `vitest.setup.ts`는 jsdom에 없는 브라우저 API 폴리필이 꼭 필요할 때만 이 Task가 독점 수정하고 보고한다
- 구현 기록: seongho:test-dev(골격 작성 에이전트, 살 모드) — __tests__/components/pnl-calculator.test.tsx(필요 시 vitest.setup.ts). 수정 1/3(7단계 verify의 테스트 결함: DoD-14 표본 4개의 빈 객체 비교를 손계산 기대값 비교로 교체, 골자 무변경)
- 테스트 파일·runner: `__tests__/components/pnl-calculator.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: jsdom에 없는 브라우저 API의 최소 폴리필만 허용. "오류가 나타나지 않는다"는 계산기 컨트롤의 렌더 유지와 `console.error` 미호출로 관찰하며, `console.error`는 `vi.spyOn`으로 관찰만 하고 대체하지 않는다. `vi.mock`으로 `lib/*`·shadcn·Base UI를 대체하지 않는다
- 데이터 격리: 테스트마다 새로 렌더하고 setup의 cleanup으로 DOM을 비운다. 브라우저 저장소를 쓰지 않는다

### T-7 — 계산기 E2E

- 사이드: E2E
- 상태: 완료
- 목적: 프로덕션 빌드의 실제 브라우저에서 롱·숏 입력 흐름의 결과와 화면 배치·색 구성을 확인한다
- 선행: 없음
- 연결 항목: DoD-15, DoD-16, DoD-21, DoD-22, DoD-23
- 수정 대상: `e2e/pnl-calculator.spec.ts` — 롱 1건(사례 C1), 숏 손실 1건(사례 C2), 너비 768px·1280px 배치, 너비 375px·767px 배치(큰 결과 값 입력 상태 포함), 다크·라이트 색 구성
- 따라야 할 패턴: baseURL만 사용, 역할 기반 조회, JSDoc 관례 — 근거: `e2e/home.spec.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 숏 사례는 손실이라 `−` 렌더링을 함께 본다 (2) URL·포트를 하드코딩하지 않는다 (3) 기존 `e2e/home.spec.ts`와 함께 전체 통과한다 (4) 배치는 `입력`·`결과` 카드의 bounding box 좌표로 판정한다 (5) 가로 스크롤은 문서의 `scrollWidth`가 `documentElement.clientWidth`를 넘지 않는지, 그리고 큰 값 상태에서 `결과` 카드와 그 안 요소의 `scrollWidth`가 `clientWidth`를 넘지 않는지(카드 안 스크롤·잘림 없음)로 판정한다 (6) 색 구성은 `colorScheme` 에뮬레이션에서 body 배경과 손익·ROE 요소 색이 그 구성의 `:root` 토큰(`--background`·`--profit`·`--loss`) 색과 같은지(같은 직렬화로 맞춰 비교), 그리고 라이트·다크에서 서로 다른지, 다크 구성의 body 배경 휘도가 라이트 구성보다 낮은지로 판정한다. 빌드가 oklch를 hex·lab으로 바꾸므로 `globals.css` 리터럴 문자열과는 비교하지 않는다 — 검증: 명령
- 실행 명령: `bun run test:e2e`, `bunx oxfmt --check e2e`
- 수정 금지: playwright.config.ts, package.json, app/, components/, `e2e/home.spec.ts`
- 구현 기록: seongho:e2e-dev(골격 작성 에이전트, 살 모드) — e2e/pnl-calculator.spec.ts. 수정 0/3. DoD-21·22·23 골격 추가 후 같은 에이전트에 살 채우기를 다시 위임해 92행 이후만 작성했다(1~91행 무변경). 수정 0/3
- 테스트 파일·runner: `e2e/pnl-calculator.spec.ts` — Playwright(Chromium)
- mock 허용 경계: 없음(실제 프로덕션 빌드)
- 데이터 격리: 테스트마다 새 브라우저 컨텍스트, 저장 상태 없음. 뷰포트·`colorScheme`은 해당 테스트 안에서만 지정한다
- 실행 환경: http://localhost:3201 — webServer가 `bun run build && bun run start`로 띄운다(재사용 없음). 3201이 비어 있어야 하고 다른 build와 동시에 돌리지 않는다. 로그인·사전 데이터 없음

### T-8 — 전체 정합성 검사

- 사이드: 검사
- 상태: 완료
- 목적: 모든 Task 완료 후 프로젝트 정합성 명령 전체를 순서대로 통과시킨다
- 선행: T-1, T-2, T-3, T-4, T-5, T-6, T-7
- 연결 항목: DoD-17
- 수정 대상: 없음 — 실행만 한다
- 따라야 할 패턴: CI check·e2e 잡의 명령 순서 — 근거: `.github/workflows/ci.yml`
- 완료 조건: 연결 항목 충족. 실패하면 해당 Task로 돌려보낸다 — 검증: 명령
- 실행 명령: `bun install --frozen-lockfile`, `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, `bun run test:e2e`(순차)
- 수정 금지: 모든 파일
- 구현 기록: 오케스트레이터가 실행 명령 7개를 순서대로 실행(모두 exit 0). 수정 파일 없음. DoD-21·22·23 반영 후 재실행: 7개 모두 exit 0(단위 56 통과, `/` 정적, E2E 6 통과)

## 3. 항목 coverage

- DoD-1: T-2, T-4
- DoD-2: T-2, T-4
- DoD-3: T-2, T-4
- DoD-4: T-2, T-4
- DoD-5: T-2, T-5
- DoD-6: T-2, T-4
- DoD-7: T-2, T-4
- DoD-8: T-2, T-4
- DoD-9: T-3, T-6
- DoD-10: T-3, T-6
- DoD-11: T-3, T-6
- DoD-12: T-3, T-6
- DoD-13: T-2, T-3, T-6
- DoD-14: T-2, T-3, T-6
- DoD-15: T-3, T-7
- DoD-16: T-3, T-7
- DoD-17: T-1, T-3, T-8
- DoD-18: T-2, T-4, T-5
- DoD-19: T-3, T-6
- DoD-20: T-2, T-3, T-6
- DoD-21: T-3, T-7
- DoD-22: T-3, T-7
- DoD-23: T-3, T-7
- EC-1: T-3, T-6
- EC-2: T-3, T-6
- EC-3: T-2, T-3, T-4, T-6
- EC-4: T-3, T-6
- EC-5: T-2, T-4
- EC-6: T-2, T-4
- EC-7: T-2, T-4
- EC-8: T-2, T-4
- EC-9: T-3, T-6
- EC-10: T-3, T-6
- EC-11: T-3, T-6
- EC-12: T-3, T-6
- EC-13: T-3, T-6

## 4. 실행 순서

- 테스트 설계(5단계)에서 T-4·T-5·T-6·T-7의 골격을 먼저 동결한다.
- 병렬 1: T-1, T-2 — 수정 파일이 겹치지 않는다(package.json·bun.lock은 T-1만 바꾼다).
- 병렬 2: T-3(T-1·T-2 선행), T-4·T-5(살 채우기), T-6(T-1 선행), T-7(살 채우기) — 수정 파일이 서로 겹치지 않는다.
- DoD-21·22·23 반영(재진행): 테스트 설계에서 T-7 골격에 case를 추가해 다시 동결 → T-1(`card` 추가) → T-3·T-7(살 채우기) 병렬 → 아래 순차 구간 → T-8.
- 순차: T-3의 `bun run build` → T-7의 `bun run test:e2e` → T-8. 모두 `.next`·포트 3201을 쓰므로 한 번에 하나만 돌린다.

## 5. 차단 사항

- 네트워크 필요: shadcn 레지스트리와 `bun add`(T-1). Playwright Chromium은 로컬 캐시(chromium-1255)를 쓰고, 버전이 안 맞으면 `bunx playwright install chromium`이 필요하다.
- 사용자 제공 데이터: 없음. Bybit 기준 사례는 스펙 DoD-5 표(2026-11-21 확인)에 있다.

## 테스트 설계 증거

- 상태: PASS (3회차 reviewer의 낮음 finding 1건을 사람이 수용하고 동결)
- 기준 스펙: `docs/specs/pnl-calculation.md` (상태 확정, 최종 갱신 2026-11-21, DoD-21·22·23 추가본). 이전 digest `a5d4147d5496d4d8`·`a457d53d92ef0bdb`는 스펙 변경으로 무효다. 단 기존 52 case의 태그는 `a5d4147d5496d4d8`과 일치함을 확인했다.
- 골자 digest: `37070968c7a9c1dd`
- 골격 파일:
  - `__tests__/lib/pnl.test.ts` (T-4, 13 case): DoD-1, 2, 3, 4, 6 · EC-3, 5, 7, 8
  - `__tests__/lib/format.test.ts` (T-4, 11 case): DoD-7, 8, 18 · EC-3, 5, 6, 7, 8
  - `__tests__/lib/pnl-bybit.test.ts` (T-5, 1 case): DoD-5, 18
  - `__tests__/components/pnl-calculator.test.tsx` (T-6, 25 case): DoD-9~14, 18, 19, 20 · EC-1~4, 9~13. DoD-14 case의 DoD-18 태그는 참고 수량 표시 규칙을 함께 보는 것이라 그대로 둔다.
  - `e2e/pnl-calculator.spec.ts` (T-7, 5 case): DoD-15, 16, 21, 22, 23. 새 3 case(DoD-21~23)는 본문 미작성(`test.fixme`)이고 기존 2 case는 본문 작성 완료다.
- 기계 검사: `check-skeleton.py --exempt DoD-17`에서 연결·누락 위반 0, 항목 36개 중 연결 35개·제외 1개, case 55개. 위반으로 표시되는 251건은 모두 이전 동결 후 본문이 채워진 기존 52 case의 미구현 표기 없음·assertion 표시다(갱신 중 정상).
- reviewer: 이번 스펙 변경 후 새 general-purpose 에이전트 3회. 검토 전후 파일 변경 없음을 매회 확인했다.
  - 1회차 NEEDS-DECISION: 토큰 리터럴 문자열 비교의 거짓 실패(빌드가 oklch를 hex·lab으로 변환), 768px 경계 미실행, 큰 값 상태 가로 넘침 — 모두 사람 결정으로 반영
  - 2회차 NEEDS-DECISION: 카드 안 스크롤·잘림 미검출, 라이트·다크 방향 반전 미검출 — 사람 결정으로 반영. 큰 값 입력 후 2열 유지는 관찰로만 둔다
  - 3회차 NEEDS-FIX(낮음 1건): DoD-22 `@then`의 '결과 카드 위쪽 끝이 입력 카드 아래쪽 끝보다 아래'가 엄격 부등호라 카드 간격 0 구현에서 거짓 실패할 수 있다 — 사람이 수용했다(계획 배치는 카드 간격을 둔다)
- 사람 확정:
  - mock 경계: T-4·T-5·T-7은 mock 없음(T-7은 실제 프로덕션 빌드). T-6은 jsdom 최소 폴리필만 허용하고, `console.error`는 `vi.spyOn`으로 관찰만 하며 대체하지 않는다. `lib/*`·shadcn·Base UI의 `vi.mock`은 금지한다.
  - 제외: DoD-17은 T-8과 7단계 runner의 명령 실행으로 검증한다.
  - 판정 방식(기존): DoD-12·EC-12는 `data-tone` 값으로 판정하고, `data-tone`과 `text-profit`·`text-loss` 클래스 대응은 7단계 코드 대조로 확인한다. "오류 없음"은 컨트롤 렌더 유지와 `console.error` 미호출로 관찰한다. 단독 `.`은 빈 값, 채움 값은 쉼표 없음, 채움(DoD-13)은 8자리 10진 사사오입이다. DoD-5는 표시 숫자로 비교한다. EC-8: 증거금이 비유한이면 ROE도 `null`(`—`)이다. 음수 경계를 테스트한다.
  - 판정 방식(DoD-21~23): DoD-21 너비 표본 768·1280px, DoD-22 375·767px. DoD-22는 첫 화면과 큰 값(수량 1e9) 상태에서 문서 `scrollWidth` ≤ `documentElement.clientWidth`, 큰 값 상태에서 `결과` 카드와 그 안 요소의 `scrollWidth` ≤ 각자 `clientWidth`. DoD-23은 `globals.css` 리터럴과 비교하지 않고, 각 구성에서 body 배경·손익·ROE 색 = 그 구성의 `:root` 토큰 색(같은 직렬화로 비교), 라이트·다크 간 차이, 다크 body 배경 휘도 < 라이트로 판정한다. 라이트·다크는 한 case의 표본이고 표본마다 새 컨텍스트를 쓴다.
- 본문 단계 주의:
  - T-6 EC-1·EC-2 붙여넣기 표본(`1e5`, `-5`, `+5`, `Infinity`)은 골격 `@given`에 있다.
  - T-5 헬퍼는 `Math.trunc(x*10**d)` 대신 10진 문자열이나 Intl trunc로 버린다. 오차 정리는 큰 값에서도 정확한 `toFixed(10)` 계열을 쓴다. EC-5 숏 0의 `−0`은 0과 같다고 비교한다.
  - T-7 새 case: `browser.newContext({ viewport: { width, height }, colorScheme })`로 만들고 `try/finally`로 닫는다(baseURL은 config에서 물려받으므로 URL 리터럴 금지). 카드 제목은 정확히 일치로 찾고 heading role을 전제하지 않는다. "h1 아래"는 ≥ 비교. 토큰 색은 `color: var(--token)` probe 요소의 computed 값으로 직렬화를 맞추고, 요소 색은 재시도 단언(`toHaveCSS`·`expect.poll`)으로 비교한다. 휘도·차이 비교는 `rgb()` 파싱을 전제하지 않는다. 손익·ROE 색은 `getByLabel`로 찾은 요소 자체의 color를 읽는다. 결과 카드 안 `sr-only` 요소나 1px 반올림 차이로 실패하면 허용치를 몰래 넣지 말고 보고한다. 큰 값은 결과 텍스트가 보일 때까지 기다린 뒤 잰다.
- 미검증·검증 불가:
  - 실제 OS 다크 설정 전환(`colorScheme` 에뮬레이션만 검증), Chromium 외 엔진
  - EC-12 중립(0) 값의 실제 색, 색 대비(T-3 (5)는 7단계 대조)
  - 768px 이상에서의 가로 스크롤, 큰 값 입력 후 2열 유지(7단계에서 2열 grid 사용을 코드로 대조)
  - 래퍼의 하드코딩 배경, `overflow-x-hidden`·`clip` 같은 넘침 숨기기 — 7단계 코드 대조로 확인한다
  - 실제 브라우저의 붙여넣기 필터, 기본값이 아닌 심볼의 Select 조작, ToggleGroup 전환(E2E 입력 흐름은 롱·숏 기본 흐름과 C1·C2·큰 값 입력만)
  - 형식 세부: 형식 함수에 NaN·Infinity 직접 입력, signed 없는 음수, 1000% 이상 ROE의 쉼표, 1e21 이상 값 채움의 overflow 경로
  - DoD-13 `0.00000003` 기대값은 V8/ICU의 최단 10진 표현 사사오입에 기댄다(Node·Chromium 동일 엔진).
  - Bybit 화면 값은 사용자 확인(2026-11-21)에만 근거한다.
  - USDT 모드 참고 수량 문구(`≈ … BTC`)는 줄바꿈 처리가 없어 비현실적으로 큰 금액(환산 수량 약 40자 이상, 1e28 규모)에서 입력 카드 밖으로 잘릴 수 있다. DoD-22 E2E는 결과 카드만 측정한다. 7단계 verify가 발견했고 사용자가 기록만 하기로 결정했다(2026-11-21).
