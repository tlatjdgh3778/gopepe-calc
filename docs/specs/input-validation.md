# 스펙: F-7 입력 검증·단위 반올림

- 상태: 완료
- 최종 갱신: 2026-11-22

## 1. 목표
손익 계산기에서 레버리지가 심볼 최대치를 넘거나 수량이 최소 주문 수량보다 작거나 수량 단위의 배수가 아니면 해당 입력란 아래에 경고하고, USDT 모드의 환산 수량을 수량 단위로 내려 표시·계산하며, 심볼 정보 기준일을 표시한다. 함께 F-2·F-3·F-4·F-5를 git worktree에서 병렬로 개발할 공통 기반(확장된 심볼 데이터, 가격 반올림·표시 헬퍼, 탭 화면 구조, 공용 입력 컴포넌트, 범위를 좁힌 F-1 E2E, 포트 환경변수, worktree 위치)을 만들어 이후 기능은 새 lib·컴포넌트·테스트 파일과 `app/page.tsx`의 자기 자리 한 곳만 바꾸면 되게 한다. [사용자 결정]

## 2. 비목표
- 진입가·종료가가 가격 틱의 배수인지 검사하지 않는다. F-1 스펙 EC-12 동작을 그대로 둔다. [사용자 결정]
- F-1의 필요 증거금·손익·ROE 표시 규칙(F-1 스펙 DoD-18 버림, DoD-20 자릿수)을 바꾸지 않는다. `marginDecimals`를 틱이나 `priceScale`에서 유도하지 않는다. [사용자 결정]
- 선택한 탭을 URL에 반영하지 않는다. 새로고침하면 입력값이 초기화되는 동작을 유지한다. [사용자 결정]
- `lib/pnl.ts`(`calculatePnl`, `qtyFromValue`)를 바꾸지 않는다. [사용자 결정]
- F-2·F-3·F-4·F-5 계산기와 청산가 계산을 만들지 않는다. 유지증거금률은 첫 단계 값만 기록하고, 전체 단계와 심볼 확대는 F-10에서 한다. [제안 후 승인]
- 경고가 떠도 입력을 막거나 결과를 숨기지 않는다. [사용자 결정]
- 소수 레버리지(Bybit `leverageStep` 0.01)를 받지 않는다. 레버리지 입력 규칙은 F-1 스펙 EC-1 그대로다. [제안 후 승인]
- 최소 주문 금액(Bybit `minNotionalValue`)을 기록하거나 검사하지 않는다. [제안 후 승인]

## 3. 완료의 정의
- DoD-1: `SYMBOLS`의 세 심볼 값과 `SYMBOLS_AS_OF`가 아래 심볼 정보 표와 같다 — 검증: 단위 테스트 [사용자 결정]
- DoD-2: 모든 심볼에서 `maxLeverage`·`tickSize`·`qtyStep`·`minOrderQty`·`maintenanceTier.mmr`·`maintenanceTier.riskLimitValue`는 0보다 크고, `minOrderQty`는 `qtyStep`의 배수다 — 검증: 단위 테스트 [제안 후 승인]
- DoD-3: `roundToStep(value, step, "up")`은 `value` 이상인 `step`의 배수 중 가장 작은 값을, `"down"`은 `value` 이하인 배수 중 가장 큰 값을 부동소수점 오차 없이 돌려준다(예: `roundToStep(0.3, 0.1, "down") === 0.3`). 이미 배수인 값은 그대로다. 부동소수점 오차는 단위 수(`value ÷ step`)와 가장 가까운 정수의 차가 `1e-12 × max(1, |value ÷ step|)` 이하인 경우로 정의하고, 이때 값은 그 정수 배로 본다(예: `roundToStep(262.441, 0.001, "down") === 262.441`, `roundToStep(0.00199999999999, 0.001, "down") === 0.001`) — 검증: 단위 테스트 [사용자 결정]
- DoD-4: `formatPrice(value, priceScale)`는 `priceScale` 소수 자릿수, 천 단위 구분, 음수 부호 `−`(U+2212)로 표시하고 단위를 붙이지 않는다(예: `formatPrice(60274, 2)` → `60,274.00`) — 검증: 단위 테스트 [사용자 결정]
- DoD-5: `formatPrice`에 `priceScale`보다 소수 자릿수가 많은 값이 오면 F-1 스펙 DoD-18과 같이 소수 10자리에서 오차를 정리한 뒤 0 방향으로 버린다 — 검증: 단위 테스트 [제안 후 승인]
- DoD-6: `formatCoinQty(value, qtyStep)`는 `qtyStep`의 소수 자릿수로 F-1 스펙 DoD-18 규칙(오차 정리 후 0 방향 버림)에 따라 표시한다(예: `formatCoinQty(0.2, 0.001)` → `0.200`) — 검증: 단위 테스트 [사용자 결정]
- DoD-7: `checkLeverage(leverage, symbol)`는 레버리지가 `maxLeverage`보다 크면 `"exceedsMax"`, 아니면 `null`을 돌려준다 — 검증: 단위 테스트 [사용자 결정]
- DoD-8: `checkQty(qty, symbol)`는 수량이 `minOrderQty`보다 작으면 `"belowMin"`, `minOrderQty` 이상이지만 `qtyStep`의 배수가 아니면 `"notStepMultiple"`, 그 외에는 `null`을 돌려준다. 배수 판정은 DoD-3의 부동소수점 오차 정의를 따른다(예: BTCUSDT에서 `262.441`은 `null`, `0.00100000000001`은 `"notStepMultiple"`) — 검증: 단위 테스트 [사용자 결정]
- DoD-9: 레버리지가 심볼 최대치를 넘으면 레버리지 입력란 아래에 `⚠ {심볼}의 최대 레버리지는 {maxLeverage}배입니다.`(예: `⚠ BTCUSDT의 최대 레버리지는 150배입니다.`)가 표시되고 입력란과 `aria-describedby`로 연결된다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-10: DoD-9의 경고가 떠 있어도 필요 증거금·손익·ROE는 계속 계산·표시된다. F-1 스펙 EC-4를 대체한다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-11: 수량이 최소 주문 수량보다 작으면 수량 입력란 아래에 `⚠ 최소 주문 수량은 {minOrderQty} {기초 코인}입니다.`(예: `⚠ 최소 주문 수량은 0.001 BTC입니다.`)가 표시되고 입력란과 `aria-describedby`로 연결된다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-12: 코인 모드에서 수량이 `qtyStep`의 배수가 아니면 수량 입력란 아래에 `⚠ 수량 단위는 {qtyStep} {기초 코인}입니다.`(예: `⚠ 수량 단위는 0.001 BTC입니다.`)가 표시되고 입력란과 `aria-describedby`로 연결된다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-13: 코인 모드에서 `qtyStep`의 배수가 아닌 수량은 입력값 그대로 계산에 쓰인다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-14: USDT 모드의 참고 수량은 금액 ÷ 진입가를 `qtyStep` 기준으로 내린 값을 `qtyStep` 자릿수로 표시한다(예: 20000 USDT, 진입가 100000 → `≈ 0.200 BTC`). F-1 스펙 DoD-14의 표시 부분을 대체한다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-15: USDT 모드의 필요 증거금·손익·ROE는 DoD-14의 내린 수량으로 계산된다. F-1 스펙 DoD-14의 "계산에는 반올림 전 원값" 부분을 대체한다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-16: 수량 단위를 USDT → 코인으로 바꾸면 수량 입력란이 DoD-14의 내린 수량을 F-1 스펙 DoD-13의 입력란 형식(지수 표기·천 단위 구분 없음, 끝의 0 제거)으로 쓴 값(예: `0.2`)으로 채워진다. 코인 → USDT 전환은 F-1 스펙 DoD-13 그대로다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-17: 심볼 선택 아래에 `심볼 정보 기준일 {SYMBOLS_AS_OF} (Bybit)`(예: `심볼 정보 기준일 2026-11-22 (Bybit)`)가 표시된다 — 검증: 컴포넌트 테스트 [사용자 결정]
- DoD-18: `/`에 탭 목록이 있고, 처음 열면 `손익` 탭이 선택되어 이름이 `손익`인 탭 패널에 손익 계산기가 보인다 — 검증: 컴포넌트 테스트 + E2E(Playwright) [사용자 결정] (검증 방법은 [제안 후 승인])
- DoD-19: 손익 계산기의 두 카드 제목과 region 접근 이름은 `손익 입력`, `손익 결과`다. F-1 스펙 DoD-21·DoD-22의 카드 제목 `입력`·`결과`를 대체한다 — 검증: 컴포넌트 테스트 + E2E(Playwright) [사용자 결정]
- DoD-20: 다른 탭으로 갔다가 돌아오면 이전 탭의 입력값과 결과가 그대로 남아 있다(비활성 탭 패널을 unmount하지 않는다) — 검증: 컴포넌트 테스트(`CalculatorTabs`에 테스트용 더미 계산기 2개를 넣어 탭 전환) [사용자 결정] (검증 방법은 [제안 후 승인])
- DoD-21: `app/page.tsx`에 F-2·F-3·F-4·F-5 각각의 자리 주석이 import 영역과 탭 항목 영역 양쪽에 있고, 인접한 자리 사이에 바뀌지 않는 줄이 하나 이상 있다 — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-22: `lib/input.ts`, `components/fields/`(`SymbolSelect`, `SideToggle`, `LeverageField`, `DecimalField`, `FieldWarning`), `components/calculator-layout.tsx`(입력·결과 2단 카드, `ResultRow`), `components/calculator-tabs.tsx`(`CalculatorTabs`)가 있고 `PnlCalculator`가 이를 사용하며, `cn`은 `@/lib/utils`에서 가져온다 — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-23: 공용 모듈 추출 후에도 F-1의 접근 이름, `data-tone`, `aria-live` 계약이 유지된다 — 검증: 기존 F-1 단위·컴포넌트 테스트 통과(region 이름 갱신, 이 스펙이 대체한 항목의 갱신, 대체한 항목 때문에 표시값이 바뀌는 기존 기대값(예: F-1 스펙 EC-10의 `≈ 0.2000 BTC` → `≈ 0.200 BTC`)의 갱신만 허용) [사용자 결정] (허용 범위 보충은 [제안 후 승인])
- DoD-24: F-1 E2E는 이름이 `손익`인 탭 패널 범위의 locator와, 심볼 옵션은 열린 listbox 범위의 locator로 찾고 모두 통과한다 — 검증: E2E(Playwright) [사용자 결정]
- DoD-25: `DEV_PORT`·`E2E_PORT`를 지정하지 않으면 `bun run dev`는 3200, `bun run start`와 Playwright는 3201을 쓴다 — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-26: `DEV_PORT`를 지정하면 `bun run dev`가 그 포트로 뜬다 — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-27: 3201이 아닌 `E2E_PORT`를 지정해도 `bun run test:e2e`가 그 포트로 `bun run start`를 띄우고 통과한다 — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-28: `.claude/worktrees/` 아래 파일은 git 추적 대상이 아니고, `.gitignore`는 `.claude/` 전체가 아니라 `.claude/worktrees/`만 무시한다 — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-29: `.claude/worktrees/` 아래 파일은 저장소 루트의 `bun run lint`·`bun run format:check`·`bun run typecheck` 대상이 아니다 — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-30: `.claude/worktrees/` 아래 worktree 안에서 `bun run build`가 성공한다(필요하면 `next.config.ts`에 `turbopack.root`를 고정한다) — 검증: 테스트 설계 단계에서 확정 [사용자 결정]
- DoD-31: `docs/specs/pnl-calculation.md`의 EC-4, DoD-13, DoD-14, DoD-21·DoD-22의 카드 제목, 4장 `lib/symbols.ts` 항목, 1장 통합 요구(`"use client"` 한 파일·동기 page), 2장 탭 비목표에 이 스펙이 대체·이관했다는 표기가 있다 — 검증: 스펙 대조(verify) [제안 후 승인]
- DoD-32: `docs/specs/project-skeleton.md`의 포트 고정 문장과 DoD-3·DoD-4·DoD-5에 `DEV_PORT`·`E2E_PORT`와 기본값이 반영된다 — 검증: 스펙 대조(verify) [제안 후 승인]
- DoD-33: `docs/product/tech-stack.md` 26행이 F-7로 고쳐지고, 심볼 정보 출처가 "Bybit 공개 API 조회 + 화면 대조"로 바뀐다 — 검증: 스펙 대조(verify) [사용자 결정]
- DoD-34: `CLAUDE.md`에 포트 환경변수, worktree 위치, 새 계산기 추가 절차(자기 F-ID 자리 바꾸기), worktree 운용 규칙 4가지((1) `.claude/worktrees/{F-ID}`에 만들고 만든 직후 `bun install` (2) 동시에 E2E·dev를 돌리는 worktree마다 서로 다른 `E2E_PORT`·`DEV_PORT` 지정 (3) 같은 worktree 안에서 `build`와 `test:e2e`를 동시에 돌리지 않음 (4) 끝나면 `git worktree remove`로 정리)가 기록된다 — 검증: 스펙 대조(verify) [사용자 결정]
- DoD-35: `docs/product/roadmap.md`의 F-7 요청 한 줄에 공통 기반이 명시된다 — 검증: 스펙 대조(verify) [제안 후 승인]

심볼 정보 표 — Bybit 공개 API v5(`/v5/market/instruments-info`, `/v5/market/risk-limit`, category `linear`)를 2026-11-22에 조회한 값이다. 유지증거금률 첫 단계는 `isLowestRisk: 1`인 단계다. BTCUSDT 호가창의 가격 표시 자릿수(2자리)를 화면과 대조했다. `marginDecimals`는 F-1 값 그대로다. [사용자 결정]

| 심볼 | maxLeverage | tickSize | priceScale | qtyStep | minOrderQty | maintenanceTier.mmr | maintenanceTier.riskLimitValue | marginDecimals |
|---|---|---|---|---|---|---|---|---|
| BTCUSDT | 150 | 0.1 | 2 | 0.001 | 0.001 | 0.0033 | 300000 | 2 |
| ETHUSDT | 150 | 0.01 | 2 | 0.01 | 0.01 | 0.0033 | 300000 | 2 |
| SOLUSDT | 100 | 0.01 | 3 | 0.1 | 0.1 | 0.005 | 50000 | 3 |

`SYMBOLS_AS_OF` = `2026-11-22`

## 4. 인터페이스 계약
- `lib/symbols.ts`: `type SymbolInfo = { symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT"; baseCoin: "BTC" | "ETH" | "SOL"; marginDecimals: 2 | 3; maxLeverage: number; tickSize: number; priceScale: number; qtyStep: number; minOrderQty: number; maintenanceTier: { mmr: number; riskLimitValue: number } }`. `maintenanceTier`는 `null`을 허용하지 않는다. `mmr`은 소수(0.0033 = 0.33%), `riskLimitValue`는 USDT다. [사용자 결정]
- `lib/symbols.ts`: `export const SYMBOLS_AS_OF: string`(`YYYY-MM-DD`), `export const SYMBOLS: readonly SymbolInfo[]`. 기준일은 파일에 하나다. [사용자 결정]
- `lib/format.ts`: `roundToStep(value: number | null, step: number, mode: "up" | "down"): number | null`. `up`은 +∞, `down`은 −∞ 방향이다. [사용자 결정]
- `lib/format.ts`: `formatPrice(value: number | null, priceScale: number): string`. 틱 반올림은 호출자가 `roundToStep`으로 먼저 한다. [사용자 결정]
- `lib/format.ts`: `formatCoinQty(value: number | null, qtyStep: number): string`으로 시그니처를 바꾼다(기존 소수 4자리 고정 대체). `formatUsdt`·`formatPercent`·`formatQtyInput`은 바꾸지 않는다. [사용자 결정]
- `lib/validation.ts`: `checkLeverage(leverage: number | null, symbol: SymbolInfo): "exceedsMax" | null`, `checkQty(qty: number | null, symbol: SymbolInfo): "belowMin" | "notStepMultiple" | null`. `checkQty(0, symbol)`은 `"belowMin"`이고, 두 함수 모두 입력이 `null`이면 `null`을 돌려준다. 경고 문구는 컴포넌트가 만들고, 문구 안의 `minOrderQty`·`qtyStep` 숫자는 `formatCoinQty(값, qtyStep)`으로 표기한다. [사용자 결정]
- `lib/pnl.ts`: 변경 없음. USDT 환산 수량은 `roundToStep(qtyFromValue(금액, 진입가), qtyStep, "down")`이다. [사용자 결정]
- 공용 모듈: `lib/input.ts`(`toNumber`, `isPositive`, `LEVERAGE_PATTERN`, `DECIMAL_PATTERN`, 정규식에 맞을 때만 값을 받는 onChange 헬퍼 `filtered(pattern, set)`), `components/fields/`(`SymbolSelect`·`SideToggle`·`LeverageField`·`DecimalField`·`FieldWarning`), `components/calculator-layout.tsx`(입력·결과 2단 카드 `CalculatorLayout`, `ResultRow`), `components/calculator-tabs.tsx`(`CalculatorTabs({ items: { value: string; label: string; content: ReactNode }[]; defaultValue: string })` — 항목마다 탭과 비활성 시에도 unmount하지 않는 탭 패널을 그린다). `SymbolSelect`는 기준일 문구를, `LeverageField`는 W1 경고를 포함한다. [사용자 결정]
- 화면: 탭은 shadcn Tabs(Base UI)다. 탭과 탭 패널 이름은 계산기 이름이고 순서는 손익 → 목표가 → 청산가 → 최대 수량 → 평균 진입가다. 카드 이름은 `{계산기명} 입력`·`{계산기명} 결과`다. [사용자 결정]
- 등록: `app/page.tsx`는 `CalculatorTabs`에 넘길 항목 배열을 갖고, 새 계산기는 자기 F-ID 자리 주석(import 1곳, 탭 항목 1곳)을 바꿔 등록한다. 자리 줄은 등록 전 `// F-N 자리`, 등록 후 그 줄을 F-ID 꼬리표 `// F-N`을 남긴 등록 줄(import 줄, 탭 항목 줄)로 바꾼 것이고, 인접한 자리 줄 사이에는 빈 줄이 아닌 `// ---` 구분 줄 하나를 둔다. [사용자 결정]
- URL은 `/`만 쓴다. 새 라우트·쿼리·해시는 없다. [사용자 결정]
- 환경변수: `DEV_PORT`(기본 3200)는 `bun run dev`, `E2E_PORT`(기본 3201)는 `bun run start`와 Playwright `baseURL`·`webServer`에 쓴다. [사용자 결정]
- worktree 위치: `.claude/worktrees/{이름}`. [사용자 결정]

## 5. 엣지 케이스와 실패 시나리오

### 5.1 경고 판정
- EC-1: 한 입력란에 경고 조건이 여러 개면 하나만 표시하고 `belowMin`(W2)을 `notStepMultiple`(W3)보다 먼저 표시한다(예: 코인 모드 BTC 0.0005 → 최소 주문 수량 경고만) — 검증: 컴포넌트 테스트 [사용자 결정]
- EC-2: 심볼을 바꾸면 경고를 즉시 다시 판정한다(예: BTCUSDT 레버리지 120에서 SOLUSDT로 바꾸면 최대 레버리지 경고가 나타난다) — 검증: 컴포넌트 테스트 [사용자 결정]
- EC-3: 수량 단위(코인·USDT)를 전환하거나 USDT 모드에서 진입가가 바뀌면 그 시점의 수량(USDT 모드는 새 환산 수량)으로 수량 경고를 다시 판정한다 — 검증: 컴포넌트 테스트 [사용자 결정]
- EC-4: 레버리지 입력란, 또는 수량 입력란(USDT 모드에서는 금액 입력)의 원문이 비어 있거나 소수점 `.`만 있거나 0이면 그 입력란에 경고를 표시하지 않는다 — 검증: 컴포넌트 테스트 [사용자 결정]
- EC-5: USDT 모드에서 내린 환산 수량이 0이면(예: 19 USDT, 진입가 100000, BTCUSDT) 최소 주문 수량 경고를 표시하고 필요 증거금·손익·ROE는 `—`다 — 검증: 컴포넌트 테스트 [사용자 결정]
- EC-9: USDT 모드에서 내린 환산 수량이 0인 상태로 수량 단위를 코인으로 바꾸면 수량 입력란이 `0`으로 채워진다(EC-4에 따라 경고는 없고 결과는 `—`다) — 검증: 컴포넌트 테스트 [사용자 결정]

### 5.2 반올림·표시 입력
- EC-6: `roundToStep`은 `value`가 `null`·`NaN`·`Infinity`·`-Infinity`이면 `null`을 돌려준다 — 검증: 단위 테스트 [사용자 결정]
- EC-7: `formatPrice(null, priceScale)`는 `—`를 돌려준다 — 검증: 단위 테스트 [사용자 결정]

### 5.3 환경
- EC-8: `E2E_PORT`의 포트가 이미 사용 중이면 `bun run test:e2e`는 기존 서버를 재사용하지 않고 실패한다(`reuseExistingServer: false` 유지) — 검증: 테스트 설계 단계에서 확정 [제안 후 승인]

## 미결정 사항
없음
