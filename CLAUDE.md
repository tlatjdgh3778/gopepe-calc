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

## 화면 구조(F-6 피라미딩 터미널)

- `app/page.tsx`는 `metadata`(title `피라미딩 계산기`)와 `<PyramidTerminal />` 하나만 렌더한다. 탭·계산기별 카드는 없다.
- 진입점: `components/pyramid/pyramid-terminal.tsx`의 `PyramidTerminal`. 유일한 상태 소유자이고 입력 원문으로 렌더 때 계산한다.
- 패널(`components/pyramid/`):
  - `market-strip.tsx`: `MarketStrip`(`SymbolSelect`·`MethodDialog` 포함), `method-dialog.tsx`: `MethodDialog`(`계산 기준` 버튼과 다이얼로그)
  - `setup-panel.tsx`: `SetupPanel`(레버리지는 `leverage-control.tsx`의 `LeverageControl`)
  - `step-editor.tsx`: `StepEditor`, `StepDraft`, `MAX_STEPS`
  - `summary-panel.tsx`: `SummaryPanel`
  - `path-panel.tsx`: `PathPanel`(차트는 `path-chart.tsx`의 `PathChart`)
  - `take-profit-panel.tsx`: `TakeProfitPanel`, `stop-loss-panel.tsx`: `StopLossPanel`
  - `panel.tsx`: `Panel`(이름이 제목 `h2`인 `section`), `PanelTag`, `WithUnit`
  - `display.ts`: 터미널 표시 문자열·차트 데이터(`EMPTY`, `formatLeverage`, `formatRiskReward`, `pathChartPoints` 등)
- region 이름(`Panel`의 `title`): `포지션 설정`·`추가 진입`·`포지션 요약`·`포지션 경로`·`익절`·`손절`.
- 공용 모듈:
  - `lib/pyramid.ts`: `simulatePyramid`, `netPnl`, `baselinePnl`, `priceForRoe`, `PyramidInput`·`PyramidResult`·`PyramidRow`·`PyramidExclusion`
  - `lib/liquidation.ts`: `liquidationPrice`, `roundLiquidation`, `distancePercent`, `isStopBeforeLiquidation`, `exceedsFirstTier`, `formatDistance` 등
  - `lib/input.ts`: `toNumber`, `isPositive`, `LEVERAGE_PATTERN`, `DECIMAL_PATTERN`, `filtered(pattern, set)`
  - `lib/symbols.ts`: `SYMBOLS`, `SYMBOLS_AS_OF`, `SymbolInfo`
  - `lib/format.ts`: `roundToStep`, `formatPrice`, `formatCoinQty`, `formatUsdt`, `formatPercent` 등 표시 형식
  - `components/fields/`: `SymbolSelect`, `SideToggle`(`Side`), `DecimalField`, `SignedDecimalField`(맨 앞 `-` 하나를 허용하는 숫자 입력란), `FieldWarning`
  - `components/result-row.tsx`: `ResultRow`, `toneOf`, `TONE_CLASS`, `Tone`
  - `components/ui/`: shadcn 컴포넌트. F-6에서 `button`·`slider`·`dialog`·`chart` 추가
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
