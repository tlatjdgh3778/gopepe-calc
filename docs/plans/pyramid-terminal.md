# 계획: F-6 피라미딩 터미널

- 상태: 승인
- 스펙: docs/specs/pyramid-terminal.md
- 기준 코드: 5e4964b + 작업 트리(스펙 신규, 미커밋)
- 최종 갱신: 2026-11-27

## 1. 구현 전략

- 계산은 화면과 분리된 순수 TS 모듈 `lib/pyramid.ts`에 둔다. 청산가는 기존 `liquidationPrice`를 재사용하고(collateral·mmr 조정), 단계 판정 순서는 시안 `simulate()`를 따른다(empty → invalidInput → notProfitDirection → noProfit). React·`lib/format` import 없이 원값만 돌려준다 — 근거: `lib/target-price.ts`, `lib/liquidation.ts`, `docs/product/tech-stack.md` 구조 원칙, 시안 html:146-169.
- 화면은 `components/pyramid/` 아래로 나눈다. `pyramid-terminal.tsx`(`"use client"`, 유일한 상태 소유자, 렌더 시 계산)가 `market-strip`·`setup-panel`·`leverage-control`·`step-editor`·`summary-panel`·`path-panel`·`path-chart`·`take-profit-panel`·`stop-loss-panel`·`method-dialog`를 조합하고, 순수 표시 헬퍼는 `display.ts`에 둔다. `ResultRow`는 `components/result-row.tsx`로 그대로 옮긴다 — 근거: `components/average-entry-calculator.tsx`, `components/calculator-layout.tsx`.
- 상태는 입력 원문 문자열(심볼·방향·진입가·증거금·레버리지·수수료·단계 `{id, price, reinvest}[]`·익절가·손절가)과 `roeDraft: string | null`로 둔다. 초기값 상수 하나를 초기화에서 재사용한다. 목표 수익률 입력란 값은 `roeDraft ?? netPnl 기반 재계산 문자열`이고, 목표 수익률 외의 모든 setter가 `roeDraft`를 해제한다(effect 없이) — 근거: `components/average-entry-calculator.tsx`, 스펙 DoD-22·DoD-23.
- 단계 id·포커스는 F-5 패턴(`useRef` 카운터 증가는 updater 밖, key = id, 가격 입력 래퍼 callback ref `Map`, `pendingFocus`를 `useEffect([steps])`에서 처리, 0개면 추가 버튼)을 따른다. `DecimalField`는 수정·복제하지 않는다 — 근거: `components/average-entry-calculator.tsx`.
- 레버리지는 `Input`+`Label`(`filtered(LEVERAGE_PATTERN)`)과 base-ui Slider를 같은 문자열 상태로 묶는다. 생성된 `ui/slider`가 Thumb 접근 이름을 넘기지 못하면 `@base-ui/react/slider` 원시 컴포넌트로 조합한다 — 근거: `components/fields/symbol-select.tsx`(원시 Label 판례), `node_modules/@base-ui/react/slider`.
- 의존성은 `bun add pretendard`와 로컬 shadcn CLI(`bunx shadcn add button slider dialog chart`, recharts 포함)로 추가한다. shadcn add는 레지스트리 네트워크가 필요하다. 실패하면 button·slider·dialog는 base-ui 원시 컴포넌트로 직접 작성할 수 있으나 chart는 BLOCKED로 보고한다. bun 캐시에 `recharts@3.10.1`·`pretendard@1.3.9`가 있다 — 근거: `components.json`, Plan 조사.
- 다크 고정: `app/globals.css`의 라이트 `:root`와 `prefers-color-scheme` 블록을 단일 다크 `:root`(시안 터미널 색)로 합치고 `color-scheme: dark`, `@custom-variant dark (&:is(.dark *))`, html 요소의 `dark` 클래스를 쓴다 — 근거: 시안 html:41-45, `app/globals.css`.
- 폰트: `app/layout.tsx`에서 `next/font/local`로 `node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2`를 CSS 변수로 로드하고 `--font-sans`에 연결, body에 `tabular-nums`. `next/font/local`은 vitest에서 import하면 throw하므로 `metadata`(title)는 `app/page.tsx`에 둔다 — 근거: `node_modules/next/font/local/index.js`.
- 반응형은 시안 `.desk` 그리드를 Tailwind 임의 값(`min-[721px]`, `min-[1151px]`)으로 옮기고 모든 열에 `min-w-0`, 표는 `overflow-x-auto`로 감싼다 — 근거: 시안 html:46, 117-122.
- 경고 문구는 입력란은 `DecimalField`·`SignedDecimalField`의 `warning`, 패널·카드는 `FieldWarning`으로 그리고 컴포넌트 파일에 `⚠` 리터럴을 두지 않는다. 한도 금액은 `formatPrice(riskLimitValue, 0)` — 근거: `components/liquidation-calculator.tsx`, `__tests__/repo/shared-modules.test.ts`.
- `components/ui/tabs.tsx`와 `lib/validation.ts`는 쓰는 곳이 없어지지만 스펙이 삭제를 요구하지 않으므로 남긴다. `__tests__/page.test.tsx`·`e2e/home.spec.ts`는 h1만 확인하므로 수정 없이 유지한다 — 근거: 스펙 §2, Explore 조사.
- 이 worktree 포트는 `DEV_PORT=3260`·`E2E_PORT=3261`이다(F-2~F-5의 3210~3241과 다르다). build·test:e2e·전체 정합성은 `.next`와 포트를 공유하므로 이 worktree에서 동시에 돌리지 않는다. 골격의 `it.todo`·`test.fixme`가 남은 동안 각 Task는 자기 파일만 oxfmt·oxlint한다 — 근거: CLAUDE.md 포트 절, F-5 계획 1장.

## 2. Task

### T-1 — 피라미딩 계산 모듈

- 사이드: 프론트(lib)
- 상태: 완료
- 목적: 스펙 §4 계약대로 `simulatePyramid`·`netPnl`·`baselinePnl`·`priceForRoe`를 만든다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, EC-5, EC-11, EC-12, EC-13, EC-14, EC-15, EC-17, EC-34
- 수정 대상: `lib/pyramid.ts` — 신규
- 따라야 할 패턴: 순수 모듈, `@/` 별칭, null 규칙, `liquidationPrice` 재사용 — 근거: `lib/target-price.ts`, `lib/liquidation.ts`, `lib/average-entry.ts`
- 완료 조건: 연결 항목 충족(T-6 통과). 추가로 (1) React·DOM·`lib/format` import가 없고 반올림하지 않는다 (2) 입력 배열을 변경하지 않는다 (3) `git diff lib/`의 기존 파일 변경이 비어 있다 (4) 새 의존성이 없다 — 검증: 테스트 + 명령
- 실행 명령: `bunx oxfmt lib/pyramid.ts`, `bunx oxlint lib/pyramid.ts`, `bun run typecheck`, `bun run test __tests__/lib/pyramid.test.ts`
- 수정 금지: lib/의 기존 파일, components/, app/, __tests__/, e2e/, package.json, bun.lock
- 구현 기록: seongho:frontend-dev(인스턴스 A) — lib/pyramid.ts. 수정 0/3. 오케스트레이터 확인: test 21 passed, oxfmt·oxlint 통과, 기존 lib diff 없음

### T-2 — 기반: 의존성·ui 컴포넌트·다크 테마·폰트

- 사이드: 프론트(기반)
- 상태: 완료
- 목적: recharts·pretendard와 shadcn button·slider·dialog·chart를 추가하고 다크 고정 테마와 Pretendard를 적용한다
- 선행: 없음
- 연결 항목: DoD-39, DoD-40
- 수정 대상: `package.json`, `bun.lock` — 의존성 추가 / `components/ui/button.tsx`, `components/ui/slider.tsx`, `components/ui/dialog.tsx`, `components/ui/chart.tsx` — 신규 / `app/globals.css` — 다크 단일 토큰 / `app/layout.tsx` — 폰트·`dark` 클래스, title 제거
- 따라야 할 패턴: shadcn base-nova 생성물, 기존 토큰 이름(`--profit`·`--loss` 유지) — 근거: `components.json`, `app/globals.css`
- 완료 조건: 연결 항목 충족(T-12 통과). 추가로 (1) `components.json`과 기존 ui 파일 7개가 바뀌지 않는다 (2) shadcn add가 globals.css의 chart 변수를 덮어쓰면 다크 값으로 다시 맞춘다 (3) 네트워크로 chart를 받지 못하면 BLOCKED로 보고한다 (4) `bun install --frozen-lockfile`이 통과한다 — 검증: 명령 + 확인 절차(diff 대조)
- 실행 명령: `bunx shadcn add button slider dialog chart`, `bun add pretendard`, `bunx oxfmt components/ui app`, `bun run typecheck`, `bun install --frozen-lockfile`
- 수정 금지: components/fields/, 기존 components/ui 파일, lib/, __tests__/, e2e/, components.json
- 구현 기록: seongho:frontend-dev(인스턴스 B) — package.json, bun.lock(recharts 3.8.0, pretendard ^1.3.9), components/ui/{button,slider,dialog,chart}.tsx, app/globals.css, app/layout.tsx. 수정 0/3. 오케스트레이터 확인: typecheck·frozen-lockfile·oxlint 통과, components.json·기존 ui 무변경

### T-3 — 피라미딩 터미널 화면 컴포넌트

- 사이드: 프론트(UI)
- 상태: 완료
- 목적: `components/pyramid/*`와 `components/result-row.tsx`로 터미널 화면을 만든다
- 선행: T-1, T-2
- 연결 항목: DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-18, DoD-19, DoD-20, DoD-21, DoD-22, DoD-23, DoD-24, DoD-25, DoD-26, DoD-27, DoD-28, DoD-29, DoD-30, DoD-32, DoD-33, DoD-34, DoD-35, DoD-36, DoD-37, DoD-38, EC-1, EC-2, EC-3, EC-4, EC-6, EC-7, EC-8, EC-9, EC-10, EC-12, EC-13, EC-14, EC-16, EC-18, EC-19, EC-20, EC-21, EC-22, EC-23, EC-24, EC-25, EC-26, EC-27, EC-28, EC-29, EC-30, EC-31, EC-32, EC-33, EC-34, EC-35
- 수정 대상: `components/pyramid/` — 신규(1장의 파일들과 `display.ts`) / `components/result-row.tsx` — 신규(`ResultRow` 이동)
- 따라야 할 패턴: 입력 원문 상태와 렌더 시 계산, F-5 단계 id·포커스, 공용 `SymbolSelect`·`SideToggle`·`DecimalField`·`SignedDecimalField`·`FieldWarning`, F-3 한도·`roundLiquidation`·`isStopBeforeLiquidation` 사용 — 근거: `components/average-entry-calculator.tsx`, `components/liquidation-calculator.tsx`, `components/fields/`
- 완료 조건: 연결 항목 충족(T-7·T-8·T-9·T-10 통과, 레이아웃은 T-12). 추가로 (1) index key가 없고 id 증가가 updater 밖이다 (2) 렌더 경로에 `Date`·`Math.random`·`crypto`가 없다 (3) 컴포넌트 파일에 `⚠` 리터럴이 없다 (4) 표시 문자열은 `lib/format`·`formatDistance`·`display.ts`로만 만든다 (5) 차트 데이터에 비유한 값이 들어가지 않는다 (6) 장식 글리프(↻, ＋, ⓘ)는 `aria-hidden`이다 (7) `components/fields/`·기존 `components/ui/` diff가 비어 있다(슬라이더 접근 이름 전달에 필요한 `ui/slider` 최소 수정만 허용) — 검증: 테스트 + 확인 절차(파일 대조)
- 실행 명령: `bunx oxfmt components/pyramid components/result-row.tsx`, `bunx oxlint components/pyramid components/result-row.tsx`, `bun run typecheck`, `bun run test __tests__/components`
- 수정 금지: lib/, app/, components/fields/, 기존 계산기 파일, __tests__/, e2e/, package.json
- 구현 기록: seongho:frontend-dev(인스턴스 C, 사용량 한도로 1회 중단 후 같은 인스턴스 재개) — components/pyramid/{pyramid-terminal,market-strip,setup-panel,leverage-control,step-editor,summary-panel,path-panel,path-chart,take-profit-panel,stop-loss-panel,method-dialog,panel}.tsx, components/pyramid/display.ts, components/result-row.tsx. 수정 1/3 — 원인: 8단계 사용자 결정으로 푸터 "교육용 시뮬레이터" 문구 제거. 오케스트레이터 확인: oxfmt·oxlint·typecheck 통과, __tests__/components 161 passed·84 todo, fields·ui·lib diff 없음. 시안 부가 문구 추가는 verify에서 범위 판정

### T-4 — 화면 교체와 기존 자산 삭제

- 사이드: 프론트(정리)
- 상태: 완료
- 목적: `/`를 피라미딩 터미널로 바꾸고 탭형 화면 자산과 그 테스트를 삭제한다
- 선행: T-3
- 연결 항목: DoD-31, DoD-41, DoD-42
- 수정 대상: `app/page.tsx` — `metadata`(title)와 `PyramidTerminal` 렌더만 남긴다 / 삭제: `components/pnl-calculator.tsx`, `components/target-price-calculator.tsx`, `components/liquidation-calculator.tsx`, `components/max-quantity-calculator.tsx`, `components/average-entry-calculator.tsx`, `components/calculator-tabs.tsx`, `components/calculator-layout.tsx`, `components/fields/leverage-field.tsx`, `__tests__/components/`의 기존 파일 전부, `e2e/`의 `home.spec.ts`를 뺀 기존 spec 6개, `__tests__/repo/page-slots.test.ts`
- 따라야 할 패턴: 서버 컴포넌트 page에서 client 컴포넌트 렌더 — 근거: `app/page.tsx`
- 완료 조건: 연결 항목 충족(T-11·T-12 통과). 추가로 (1) `rg "calculator-layout|calculator-tabs|LeverageField|CalculatorTabs|CalculatorLayout"`가 app·components·lib·e2e에서 0건이다(`__tests__/repo/shared-modules.test.ts`는 T-11가 고친다) (2) build 출력에서 `/`가 정적이고 prerender·hydration 오류가 없다 (3) T-3·T-7·T-8·T-11·T-12의 신규 파일을 삭제하지 않는다 — 검증: 명령 + 확인 절차
- 실행 명령: `bun run typecheck`, `bun run test __tests__/page.test.tsx`, `E2E_PORT=3261 bun run build`(다른 build·E2E가 돌지 않을 때만)
- 수정 금지: lib/, components/pyramid/, components/fields/의 남는 파일, components/ui/, CLAUDE.md, 신규 테스트 파일
- 구현 기록: seongho:frontend-dev(인스턴스 C) — app/page.tsx 교체, 기존 컴포넌트 8개·테스트 18개·E2E 6개 등 26+8개 삭제. 수정 0/3. 오케스트레이터 확인: typecheck 통과, 옛 모듈 참조 0건, 삭제 26건. build ○ / 정적(에이전트 보고)

### T-5 — CLAUDE.md 갱신

- 사이드: 문서
- 상태: 완료
- 목적: CLAUDE.md의 "새 계산기 추가" 절을 F-6 화면 구조와 공용 모듈 목록으로 바꾼다
- 선행: T-4
- 연결 항목: DoD-44
- 수정 대상: `CLAUDE.md` — "새 계산기 추가" 절과 공용 모듈 목록(자리 줄 규칙·탭 순서·카드 이름 규칙 삭제)
- 따라야 할 패턴: 기존 CLAUDE.md 문체(짧은 bullet, 경로·export 명시) — 근거: `CLAUDE.md`
- 완료 조건: 연결 항목 충족. 추가로 (1) 문서에 적힌 파일·export가 실제와 일치한다 (2) 다른 절은 바뀌지 않는다 — 검증: 확인 절차(문서·코드 대조)
- 실행 명령: `git diff CLAUDE.md`
- 수정 금지: 코드, 테스트, docs/
- 구현 기록: general-purpose(문서 전용 에이전트 없음) — CLAUDE.md "새 계산기 추가" 절을 "화면 구조(F-6 피라미딩 터미널)"로 교체. 수정 0/3

### T-6 — lib 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 피라미딩 계산과 null·제외 규칙을 손계산 리터럴로 고정한다
- 선행: 없음
- 연결 항목: DoD-1, DoD-2, DoD-3, DoD-4, DoD-5, DoD-6, DoD-7, EC-5, EC-11, EC-12, EC-13, EC-14, EC-15, EC-17, EC-34
- 수정 대상: `__tests__/lib/pyramid.test.ts` — 신규
- 따라야 할 패턴: vitest 함수 명시 import, JSDoc `@spec`·`@given`·`@when`·`@then`, 제목 `[DoD-N]`·`[EC-N]` 접두, `it.each` — 근거: `__tests__/lib/average-entry.test.ts`, `__tests__/lib/liquidation.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 기대값은 스펙 기준 사례 리터럴이고 구현 함수로 만들지 않는다 (2) 원값은 상대 오차 1e-12 이내로 비교한다 (3) EC-15는 제외 단계 유무에 따라 뒤 행이 같은지로 본다 (4) 입력 배열이 바뀌지 않음을 본다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/lib/pyramid.test.ts`, `bunx oxfmt --check __tests__/lib/pyramid.test.ts`, `bunx oxlint __tests__/lib/pyramid.test.ts`, `bun run typecheck`
- 수정 금지: lib/, 기존 __tests__ 파일, 설정 파일, package.json
- 구현 기록: seongho:test-dev(T-6·T-7 골격 작성 인스턴스, 살 모드) — __tests__/lib/pyramid.test.ts. 수정 0/3. digest 동결 유지
- 테스트 파일·runner: `__tests__/lib/pyramid.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음(`lib/pyramid`·`lib/liquidation`을 실제로 호출) — 테스트 설계 단계에서 사용자 확정
- 데이터 격리: 공유 상태가 없고 표본은 테스트마다 상수로 둔다

### T-7 — 표시 헬퍼 단위 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: `components/pyramid/display.ts`의 형식·차트 점 변환을 순수 함수 수준에서 고정한다
- 선행: T-4
- 연결 항목: DoD-18, DoD-22, DoD-23, EC-8
- 수정 대상: `__tests__/components/pyramid-display.test.ts` — 신규
- 따라야 할 패턴: `__tests__/lib/step-format.test.ts`의 표 순회 — 근거: `__tests__/lib/step-format.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) `−`(U+2212)·`×`·`—` 등 글자를 정확히 비교한다 (2) 자동 채움 문자열에 천 단위 구분·지수 표기·끝자리 0이 없음을 본다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components/pyramid-display.test.ts`, `bunx oxfmt --check __tests__/components/pyramid-display.test.ts`, `bunx oxlint __tests__/components/pyramid-display.test.ts`
- 수정 금지: components/, lib/, 다른 테스트 파일
- 구현 기록: seongho:test-dev(T-6·T-7 골격 인스턴스, 살 모드) — __tests__/components/pyramid-display.test.ts. 수정 0/3. 실행 통과
- 테스트 파일·runner: `__tests__/components/pyramid-display.test.ts` — Vitest(jsdom)
- mock 허용 경계: 없음 — 테스트 설계 단계에서 사용자 확정
- 데이터 격리: 공유 상태 없음

### T-8 — 컴포넌트 테스트: 입력·요약·경로·화면 구조

- 사이드: 테스트
- 상태: 완료
- 목적: 초기 상태·입력·요약·경로 표·구조·다이얼로그와 기본 입력 경계를 컴포넌트 테스트로 고정한다
- 선행: T-4
- 연결 항목: DoD-8, DoD-9, DoD-10, DoD-11, DoD-12, DoD-13, DoD-14, DoD-15, DoD-16, DoD-17, DoD-18, DoD-19, DoD-20, DoD-21, DoD-31, DoD-32, DoD-33, DoD-34, DoD-35, DoD-36, EC-1, EC-2, EC-3, EC-4, EC-6, EC-7, EC-8, EC-9, EC-10, EC-30, EC-33, EC-34
- 수정 대상: `__tests__/components/pyramid-terminal.test.tsx` — 신규
- 따라야 할 패턴: RTL + user-event, region 범위 조회, 헬퍼는 파일 안, 심볼은 열린 listbox 범위 — 근거: 삭제 전 `__tests__/components/liquidation-calculator.test.tsx`, `__tests__/components/average-entry-calculator.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) 접근 이름은 정확 일치로 찾는다(`레버리지`와 `레버리지 슬라이더` 구별) (2) 경고는 `aria-describedby` 또는 `⚠`·`—` 정확 비교로 판정한다 (3) 슬라이더는 role `slider`에 키보드로 조작한다 (4) 각 EC 테스트에서 `NaN`·`Infinity`가 없고 `console.error`가 호출되지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components/pyramid-terminal.test.tsx`, `bunx oxfmt --check __tests__/components/pyramid-terminal.test.tsx`, `bunx oxlint __tests__/components/pyramid-terminal.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 다른 테스트 파일, vitest.setup.ts, vitest.config.mts, package.json
- 구현 기록: seongho:test-dev(T-8 골격 인스턴스, 살 모드) — __tests__/components/pyramid-terminal.test.tsx. 수정 1/3 — 원인: 본문 선택자 결함(심볼 combobox textContent에 ▼ 포함, 결과 텍스트 비교에 차트 style useId 포함). 수정 후 37 passed, digest 동결 유지
- 테스트 파일·runner: `__tests__/components/pyramid-terminal.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: `console.error`의 `vi.spyOn`(관찰만)만 허용한다. 차트는 mock 없이 실제로 렌더하고 선 렌더는 판정하지 않는다(차트 데이터는 T-7, 실제 선·범례·툴팁은 T-12). `vi.mock`, jsdom 폴리필, `vitest.setup.ts` 변경은 금지하고 필요하면 BLOCKED로 보고한다 — 사용자 확정 2026-11-26
- 데이터 격리: 테스트마다 새로 렌더하고 `vitest.setup.ts`의 `cleanup`으로 DOM을 비운다

### T-9 — 컴포넌트 테스트: 단계 편집

- 사이드: 테스트
- 상태: 완료
- 목적: 단계 추가·삭제·포커스·제외 경고·8단계 제한을 컴포넌트 테스트로 고정한다
- 선행: T-4
- 연결 항목: DoD-27, DoD-28, DoD-29, DoD-30, EC-12, EC-13, EC-14, EC-16, EC-18, EC-19, EC-31, EC-35
- 수정 대상: `__tests__/components/pyramid-steps.test.tsx` — 신규
- 따라야 할 패턴: F-5 포커스 판정(`document.activeElement`와 접근 이름 동일성), 한 글자씩 입력 — 근거: 삭제 전 `__tests__/components/average-entry-calculator.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) DoD-30은 서로 다른 값의 3단계에서 중간 단계를 지운 뒤 앞당겨진 단계 값을 본다 (2) 경고는 단계 카드 범위에서 판정한다 (3) `NaN`·`Infinity`·`console.error`가 없다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components/pyramid-steps.test.tsx`, `bunx oxfmt --check __tests__/components/pyramid-steps.test.tsx`, `bunx oxlint __tests__/components/pyramid-steps.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 다른 테스트 파일, vitest.setup.ts, vitest.config.mts
- 구현 기록: seongho:test-dev(T-9 골격 인스턴스, 살 모드) — __tests__/components/pyramid-steps.test.tsx. 수정 0/3. 실행 통과
- 테스트 파일·runner: `__tests__/components/pyramid-steps.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: `console.error`의 `vi.spyOn`(관찰만)만 허용한다. 차트는 mock 없이 실제로 렌더하고 선 렌더는 판정하지 않는다(차트 데이터는 T-7, 실제 선·범례·툴팁은 T-12). `vi.mock`, jsdom 폴리필, `vitest.setup.ts` 변경은 금지하고 필요하면 BLOCKED로 보고한다 — 사용자 확정 2026-11-26
- 데이터 격리: 테스트마다 새로 렌더하고 `cleanup`으로 DOM을 비운다

### T-10 — 컴포넌트 테스트: 익절·손절

- 사이드: 테스트
- 상태: 완료
- 목적: 익절가↔목표 수익률 연동, 익절·손절 패널 결과와 경고를 컴포넌트 테스트로 고정한다
- 선행: T-4
- 연결 항목: DoD-19, DoD-22, DoD-23, DoD-24, DoD-25, DoD-26, EC-20, EC-21, EC-22, EC-23, EC-24, EC-25, EC-26, EC-27, EC-28, EC-29, EC-32
- 수정 대상: `__tests__/components/pyramid-exits.test.tsx` — 신규
- 따라야 할 패턴: region 범위 조회, `SignedDecimalField` 입력 — 근거: 삭제 전 `__tests__/components/target-price-calculator.test.tsx`
- 완료 조건: 연결 항목 충족. 추가로 (1) DoD-22·DoD-23은 입력란 값 문자열을 정확히 비교한다 (2) EC-25·EC-27은 틱 청산가 경계 표본을 쓴다 (3) `NaN`·`Infinity`·`console.error`가 없다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/components/pyramid-exits.test.tsx`, `bunx oxfmt --check __tests__/components/pyramid-exits.test.tsx`, `bunx oxlint __tests__/components/pyramid-exits.test.tsx`, `bun run typecheck`
- 수정 금지: components/, lib/, app/, 다른 테스트 파일, vitest.setup.ts, vitest.config.mts
- 구현 기록: seongho:test-dev(T-10 골격 인스턴스, 살 모드) — __tests__/components/pyramid-exits.test.tsx. 수정 0/3. 실행 통과
- 테스트 파일·runner: `__tests__/components/pyramid-exits.test.tsx` — Vitest(jsdom) + Testing Library + user-event
- mock 허용 경계: `console.error`의 `vi.spyOn`(관찰만)만 허용한다. 차트는 mock 없이 실제로 렌더하고 선 렌더는 판정하지 않는다(차트 데이터는 T-7, 실제 선·범례·툴팁은 T-12). `vi.mock`, jsdom 폴리필, `vitest.setup.ts` 변경은 금지하고 필요하면 BLOCKED로 보고한다 — 사용자 확정 2026-11-26
- 데이터 격리: 테스트마다 새로 렌더하고 `cleanup`으로 DOM을 비운다

### T-11 — 저장소·메타데이터 테스트

- 사이드: 테스트
- 상태: 완료
- 목적: 삭제 대상 부재, 남는 공용 모듈 규칙, title을 원문·단위 테스트로 고정한다
- 선행: T-4
- 연결 항목: DoD-31, DoD-42, DoD-43
- 수정 대상: `__tests__/repo/removed-modules.test.ts` — 신규 / `__tests__/repo/shared-modules.test.ts` — 남는 모듈 기준으로 수정(fields 5종, 소비자 검사를 `components/pyramid/`로, `cn` 검사 대상 갱신) / `__tests__/app/page-metadata.test.ts` — 신규
- 따라야 할 패턴: `@vitest-environment node` 원문 검사 — 근거: `__tests__/repo/shared-modules.test.ts`, `__tests__/repo/ports.test.ts`
- 완료 조건: 연결 항목 충족. 추가로 (1) 삭제 목록은 T-4 수정 대상과 일치한다 (2) `app/layout.tsx`를 import하지 않는다 — 검증: 테스트
- 실행 명령: `bun run test __tests__/repo __tests__/app`, `bunx oxfmt --check __tests__/repo __tests__/app`, `bunx oxlint __tests__/repo __tests__/app`
- 수정 금지: 소스 파일, 다른 테스트 파일
- 구현 기록: seongho:test-dev(T-11 골격 인스턴스, 살 모드) — __tests__/repo/removed-modules.test.ts, __tests__/repo/shared-modules.test.ts, __tests__/app/page-metadata.test.ts. 수정 0/3. 실행 통과
- 테스트 파일·runner: `__tests__/repo/removed-modules.test.ts`, `__tests__/repo/shared-modules.test.ts`, `__tests__/app/page-metadata.test.ts` — Vitest(node 환경 지시문)
- mock 허용 경계: 없음(실제 파일 시스템 읽기) — 테스트 설계 단계에서 사용자 확정
- 데이터 격리: 읽기만 하고 파일을 쓰지 않는다

### T-12 — E2E

- 사이드: E2E
- 상태: 완료
- 목적: 프로덕션 빌드에서 차트 렌더·반응형·다크 고정·폰트·기본 흐름을 고정한다
- 선행: T-4
- 연결 항목: DoD-21, DoD-37, DoD-38, DoD-39, DoD-40, DoD-41
- 수정 대상: `e2e/pyramid-terminal.spec.ts` — 신규
- 따라야 할 패턴: region 범위 locator, 너비마다 `browser.newContext({ viewport })`와 `try/finally` — 근거: 삭제 전 `e2e/average-entry-calculator.spec.ts`, `e2e/pnl-calculator.spec.ts`(레이아웃·다크 판정)
- 완료 조건: 연결 항목 충족. 추가로 (1) 1280·768·375px에서 region 배치를 boundingBox로 판정한다 (2) DoD-39는 `colorScheme: "light"` 컨텍스트에서 판정한다 (3) DoD-40은 `document.fonts` 로드 상태와 계산된 font-family로 판정한다 (4) URL·포트를 하드코딩하지 않는다 (5) `e2e/home.spec.ts`와 함께 통과한다 — 검증: E2E
- 실행 명령: `E2E_PORT=3261 bun run test:e2e e2e/pyramid-terminal.spec.ts`, `bunx oxfmt --check e2e`, `bunx oxlint e2e/pyramid-terminal.spec.ts`
- 수정 금지: e2e/home.spec.ts, playwright.config.ts, app/, components/, lib/
- 구현 기록: seongho:e2e-dev(T-12 골격 인스턴스, 살 모드) — e2e/pyramid-terminal.spec.ts. 수정 1/3 — 원인: 본문 선택자 결함(Chromium에서 definition 접근 이름 미노출, recharts x축 눈금 클래스 불일치). 7단계 e2e-runner 1회차 11건 중 6건 실패. 재위임 중
- 테스트 파일·runner: `e2e/pyramid-terminal.spec.ts` — Playwright(chromium)
- mock 허용 경계: 없음(프로덕션 빌드를 실제 브라우저로) — 테스트 설계 단계에서 사용자 확정
- 데이터 격리: 테스트마다 새 페이지 또는 새 브라우저 컨텍스트를 쓰고 저장 상태가 없다
- 실행 환경: `http://localhost` + `E2E_PORT=3261`. Playwright webServer가 `bun run build && bun run start`로 띄우고 기존 서버를 재사용하지 않는다(3261이 비어 있어야 한다). 로그인·사전 데이터 없음. 필요하면 `bunx playwright install chromium`을 먼저 실행한다

### T-13 — 전체 정합성 검사

- 사이드: 검사
- 상태: 완료
- 목적: 남은 테스트를 포함한 저장소 전체 정합성 명령이 통과하는지 확인한다
- 선행: T-1, T-2, T-3, T-4, T-5, T-6, T-7, T-8, T-9, T-10, T-11, T-12
- 연결 항목: DoD-46
- 수정 대상: 없음(실행만)
- 따라야 할 패턴: CI 명령 순서 — 근거: `.github/workflows/ci.yml`
- 완료 조건: 연결 항목 충족. 추가로 (1) `__tests__/lib/`의 기존 10개 파일, `__tests__/page.test.tsx`, `ports`·`gitignore` 검사, `e2e/home.spec.ts`가 수정 없이 통과한다 (2) 실패하면 원인 Task로 돌려보낸다 — 검증: 명령
- 실행 명령: `bun install --frozen-lockfile`, `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `E2E_PORT=3261 bun run build`, `E2E_PORT=3261 bun run test:e2e`(순차)
- 수정 금지: 모든 파일
- 구현 기록: 7단계 독립 검증의 seongho:test-runner(정합성 명령·단위 테스트)·seongho:e2e-runner(E2E)가 실행했다(수정 없음)

## 3. 항목 coverage

- DoD-1: T-1, T-6
- DoD-2: T-1, T-6
- DoD-3: T-1, T-6
- DoD-4: T-1, T-6
- DoD-5: T-1, T-6
- DoD-6: T-1, T-6
- DoD-7: T-1, T-6
- DoD-8: T-3, T-8
- DoD-9: T-3, T-8
- DoD-10: T-3, T-8
- DoD-11: T-3, T-8
- DoD-12: T-3, T-8
- DoD-13: T-3, T-8
- DoD-14: T-3, T-8
- DoD-15: T-3, T-8
- DoD-16: T-3, T-8
- DoD-17: T-3, T-8
- DoD-18: T-3, T-7, T-8
- DoD-19: T-3, T-8, T-10
- DoD-20: T-3, T-8
- DoD-21: T-3, T-8, T-12
- DoD-22: T-3, T-7, T-10
- DoD-23: T-3, T-7, T-10
- DoD-24: T-3, T-10
- DoD-25: T-3, T-10
- DoD-26: T-3, T-10
- DoD-27: T-3, T-9
- DoD-28: T-3, T-9
- DoD-29: T-3, T-9
- DoD-30: T-3, T-9
- DoD-31: T-4, T-8, T-11
- DoD-32: T-3, T-8
- DoD-33: T-3, T-8
- DoD-34: T-3, T-8
- DoD-35: T-3, T-8
- DoD-36: T-3, T-8
- DoD-37: T-3, T-12
- DoD-38: T-3, T-12
- DoD-39: T-2, T-12
- DoD-40: T-2, T-12
- DoD-41: T-4, T-12
- DoD-42: T-4, T-11
- DoD-43: T-11
- DoD-44: T-5
- DoD-46: T-13
- EC-1: T-3, T-8
- EC-2: T-3, T-8
- EC-3: T-3, T-8
- EC-4: T-3, T-8
- EC-5: T-1, T-6
- EC-6: T-3, T-8
- EC-7: T-3, T-8
- EC-8: T-3, T-7, T-8
- EC-9: T-3, T-8
- EC-10: T-3, T-8
- EC-11: T-1, T-6
- EC-12: T-1, T-3, T-6, T-9
- EC-13: T-1, T-3, T-6, T-9
- EC-14: T-1, T-3, T-6, T-9
- EC-15: T-1, T-6
- EC-16: T-3, T-9
- EC-17: T-1, T-6
- EC-18: T-3, T-9
- EC-19: T-3, T-9
- EC-20: T-3, T-10
- EC-21: T-3, T-10
- EC-22: T-3, T-10
- EC-23: T-3, T-10
- EC-24: T-3, T-10
- EC-25: T-3, T-10
- EC-26: T-3, T-10
- EC-27: T-3, T-10
- EC-28: T-3, T-10
- EC-29: T-3, T-10
- EC-30: T-3, T-8
- EC-31: T-3, T-9
- EC-32: T-3, T-10
- EC-33: T-3, T-8
- EC-34: T-1, T-3, T-6, T-8
- EC-35: T-3, T-9

## 4. 실행 순서

- 0: 테스트 설계 단계에서 T-6·T-7·T-8·T-9·T-10·T-11·T-12의 골격을 동결한다(차트 mock 경계 확정 포함).
- 1 (병렬): T-1, T-2, T-6 본문 — 수정 파일이 겹치지 않는다.
- 2 (순차): T-3 → T-4.
- 3 (병렬): T-5, T-7, T-8, T-9, T-10, T-11, T-12 본문(T-4 뒤) — 수정 파일이 겹치지 않는다. build·test:e2e는 한 번에 하나만 돌린다.
- 4: T-13.

## 5. 차단 사항

- T-2의 `shadcn add`는 레지스트리 네트워크가 필요하다. 접속할 수 없으면 chart를 받지 못해 BLOCKED가 된다.

## 테스트 설계 증거

- 상태: PASS(동결) — 사람 승인 2026-11-26
- 기준 스펙: docs/specs/pyramid-terminal.md (상태 확정, EC-14·EC-35·DoD-25 테스트 설계 중 사용자 결정으로 갱신)
- 골자 digest: `fe1074ca7185dc31`
- 확인 명령: `python3 /root/study/skills/dev-pipeline/skills/test-design/scripts/check-skeleton.py --spec docs/specs/pyramid-terminal.md --files __tests__/lib/pyramid.test.ts __tests__/components/pyramid-display.test.ts __tests__/components/pyramid-terminal.test.tsx __tests__/components/pyramid-steps.test.tsx __tests__/components/pyramid-exits.test.tsx __tests__/repo/removed-modules.test.ts __tests__/repo/shared-modules.test.ts __tests__/app/page-metadata.test.ts e2e/pyramid-terminal.spec.ts --exempt EC-14,DoD-44,DoD-46 --frozen fe1074ca7185dc31`
- 골격 파일: 항목 80개 중 case 연결 77개, 제외 3개, case 123개
  - `__tests__/lib/pyramid.test.ts` 21 — T-6, seongho:test-dev
  - `__tests__/components/pyramid-display.test.ts` 7 — T-7, seongho:test-dev(T-6과 같은 인스턴스)
  - `__tests__/components/pyramid-terminal.test.tsx` 37 — T-8, seongho:test-dev
  - `__tests__/components/pyramid-steps.test.tsx` 18 — T-9, seongho:test-dev
  - `__tests__/components/pyramid-exits.test.tsx` 22 — T-10, seongho:test-dev
  - `__tests__/repo/removed-modules.test.ts` 1, `__tests__/repo/shared-modules.test.ts` 4, `__tests__/app/page-metadata.test.ts` 2 — T-11, seongho:test-dev
  - `e2e/pyramid-terminal.spec.ts` 11 — T-12, seongho:e2e-dev
- 기계 검사: PASS(위 명령, 최종 digest)
- reviewer(매 회 새 general-purpose, 파일 무변경 확인):
  - 1회 digest `0661b9fa28800bd2` NEEDS-FIX 8건(경로 표 숫자 칸 누락, EC-8 도달 불가 표본, DoD-14 리터럴 없음, 리터럴 중복 등)
  - 2회 digest `7e573f2d4cd9499d` NEEDS-FIX 5건(같은 요청 case 분리, 패널 중복, 목표 수익률 원문 유지 미판정, 스펙 밖 selector)
  - 3회 digest `89881bc13f40e882` NEEDS-FIX 4건(색 방향, 숏 차트 점 틱, 초기화 시 목표 수익률, 마커 오차) — 자동 3회 상한 도달(REVIEW-BLOCKED), 사용자 결정으로 4회 진행
  - 4회 digest `bed02b4c958a7b88` NEEDS-FIX 3건(P2 경로 표 숏 틱, EC-9 최초/최종 포지션 가치 판별, 재투입 끝자리 0 표본) — 반영 후 사용자 결정으로 재검토 없이 동결
  - 매 회 숫자 리터럴 유리수 재검산에서 오류 0건
- 사람 확정:
  - 제외: EC-14(EC-13 통과 단계는 정확한 산술에서 가용 수익이 항상 양수, 방어 분기 — 7단계 코드 대조로 분기 존재만 확인), DoD-44(확인 절차: 문서 대조), DoD-46(명령: 정합성 명령 실행)
  - mock 경계: lib·display·저장소 테스트와 E2E는 mock 없음. 컴포넌트 테스트(T-8~T-10)는 `console.error` `vi.spyOn`(관찰만)만 허용, 차트는 mock 없이 렌더하고 선 렌더는 판정하지 않는다. `vi.mock`·jsdom 폴리필·`vitest.setup.ts` 변경 금지
  - 표시 결정: 경로 표 시점 수익은 부호·손익 색, 제외 행 숫자 입력은 포함 행 형식, DoD-25 마커는 `data-slot="stop-marker"`의 inline `style.left`를 ±0.01%p로 비교
- 본문 단계 주의:
  - `vitest list --json` 뒤에 테스트 경로를 주면 그 경로를 출력 파일로 덮어쓴다(골격 단계에서 2회 사고). 쓰지 않는다
  - 골격 `it.todo`는 oxlint `vitest(warn-todo)` error를 낸다. 본문을 채우면 사라진다
  - EC-30 "차트가 그려지지 않는다"는 jsdom에서 차트 컨테이너 부재로 판정한다
  - E2E DoD-21 점 개수는 Recharts Line이 점을 렌더해야 판정할 수 있다
- 미검증·검증 불가:
  - 컴포넌트 테스트는 차트 실제 렌더를 증명하지 않는다(E2E만 증명)
  - DoD-21 "Recharts 사용", DoD-40 "npm `pretendard` + `next/font/local` 출처"는 E2E로 판정할 수 없다 — 7단계 코드 대조로 보완
  - E2E는 Chromium만, 다른 브라우저·실기기 폰트 렌더는 확인하지 않는다

### 검증 기록

- 코드 기준: 5e4964b + 작업 트리(미커밋). 검증 중 파일 변경 없음(스냅샷 대조)
- 스펙 대조(새 general-purpose + seongho:verify, 읽기 전용): 80개 중 충족 78, 검증 불가 2(DoD-38·DoD-46 — 실행 항목), 부분·미충족 0. 골자 digest `fe1074ca7185dc31` 동결 유지, 테스트 변조 없음. 스코프 초과 10건(시안 부가 문구·장식), 드리프트 3건(ui/slider 미사용, simulatePyramid 비유한 결과 null, 손익비 천 단위 구분) — 8단계 사용자 판단
- 테스트 실행(seongho:test-runner): Task별 테스트 전부 통과. 정합성 명령 frozen-lockfile·format:check·lint·typecheck·test(21 files, 262 passed, todo/skip 0)·build(○ / 정적) 모두 exit 0
- E2E(seongho:e2e-runner):
  - 1회차: pyramid-terminal 11건 중 5건 통과, 6건 실패 — 본문 선택자 결함(Chromium에서 dd 접근 이름 미노출, recharts 3.8 x축 눈금 층 클래스 불일치)으로 분류해 T-12 작성자에게 재위임(수정 1/3)
  - 2회차(새 인스턴스): pyramid-terminal 11/11, 전체 12/12 통과
- 컴포넌트 테스트 1차 실행에서 T-8 3건 실패 — 본문 선택자 결함(심볼 ▼ 아이콘, 차트 style useId)으로 분류해 재위임(수정 1/3), 이후 37/37 통과
- 항목별 종합: DoD-1~DoD-44·DoD-46(DoD-45 삭제), EC-1~EC-35 전부 충족. 단 EC-14는 테스트 제외(코드 대조로 방어 분기 존재만 확인), DoD-44는 문서 대조, DoD-21 Recharts 사용·DoD-40 pretendard 출처는 코드 대조로 보완
- 미검증: Chromium 외 브라우저, 실기기 폰트 렌더, 컴포넌트 테스트의 차트 실제 렌더(E2E만 증명)
- 8단계 사용자 결정(2026-11-27): 시안 부가 문구는 푸터 "교육용 시뮬레이터" 줄만 제거하고 나머지 수용, 미사용 `components/ui/slider.tsx` 유지, EC-20 한 글자 입력 중간값 동작 수용(스펙 EC-20에 명시)
- 재검증(푸터 수정 후): 변경분 스펙 재대조(새 general-purpose + seongho:verify) 새 finding 없음·DoD-36 유지·digest 동결 / test-runner 정합성 명령 전부 exit 0, test 262 passed, build ○ / / e2e-runner 전체 12/12 통과
