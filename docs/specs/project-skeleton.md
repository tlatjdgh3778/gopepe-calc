# 스펙: F-0 프로젝트 골격

- 상태: 완료
- 최종 갱신: 2026-11-20

## 1. 목표
이후 모든 기능의 테스트가 실행될 바탕(빌드, 단위 테스트, E2E, 정적 검사, CI)을 만들고 그 명령을 CLAUDE.md에 기록한다. 범위는 Next.js 앱 골격, 정적 검사(oxlint·oxfmt·tsc), Tailwind 4·shadcn 초기화, 환경 고정(.gitignore, .nvmrc v24.21.0, packageManager bun@1.4.2, bun.lock), GitHub Actions CI다. 의존성은 설치 시점의 최신 안정판을 쓰고 bun.lock으로 고정한다. 세부 설정 요구(E2E 서버 재사용 금지, 테스트 0건이면 실패, 두 러너의 수집 범위 분리, CI의 브라우저 설치, `next dev`의 AGENTS.md 자동 생성 끄기, cacheComponents 켜짐(create-next-app 기본값) 유지, `start` 포트 3201 고정, README.md 미포함, oxfmt 대상에서 docs/ 제외)는 계획의 Task 완료 조건으로 확인한다. [사용자 결정]

## 2. 비목표
- 순수 계산 모듈과 심볼 데이터의 위치·내용 — F-1에서 정한다. [제안 후 승인]
- 홈 페이지 제목 한 줄 외의 화면과 shadcn 개별 컴포넌트 추가 — 초기화만 한다. [제안 후 승인]
- 배포 설정. [제안 후 승인]
- CI 실제 실행 결과를 완료 판정에 넣는 것 — push 후에만 확인할 수 있다. [사용자 결정]
- 엣지 케이스 재현 검증. [사용자 결정]
- 다른 프로젝트(gopepe-swap)의 설정 참고·공유. [사용자 결정]

## 3. 완료의 정의
- DoD-1: `bun install --frozen-lockfile` 후 `bun run build`, `bun run lint`, `bun run format:check`, `bun run typecheck`가 모두 종료 코드 0으로 끝난다 — 검증: 명령 [사용자 결정]
- DoD-2: `bun run test`가 종료 코드 0으로 끝나고, jsdom에서 홈 페이지를 렌더링해 heading role이 있음을 확인하는 단위 테스트 1건이 통과한다 — 검증: 명령 [사용자 결정]
- DoD-3: `bun run test:e2e`가 종료 코드 0으로 끝나고, 프로덕션 빌드(`build` 후 `start`)로 포트 3201에 띄운 앱의 `/`에서 heading이 보임을 확인하는 E2E 1건이 통과한다 — 검증: 명령 [사용자 결정]
- DoD-4: `bun run dev`로 띄운 개발 서버가 포트 3200에서 `/` 요청에 HTTP 200으로 응답한다 — 검증: 명령(기동 후 요청) [사용자 결정]
- DoD-5: CLAUDE.md에 명령(`dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:watch`, `test:e2e`), 포트(dev 3200, E2E 3201), 테스트 위치·이름 규칙(단위 `__tests__/**/*.test.ts(x)`, E2E `e2e/*.spec.ts`), 경로 별칭(`@/*` → 루트, `src/` 없음), Playwright 브라우저 설치 안내(`bunx playwright install chromium`, 시스템 라이브러리 오류 시 `bunx playwright install-deps chromium`)가 적혀 있다 — 검증: 문서 확인 [사용자 결정]
- DoD-6: `.github/workflows/ci.yml`이 main push와 PR에서 실행되고, check 잡(`format:check`, `lint`, `typecheck`, `test`, `build`)과 e2e 잡(Chromium·시스템 의존성 설치 후 `test:e2e`, 실패 시 `test-results/` 아티팩트 7일 보관)을 가진다. Node 버전은 `.nvmrc`, bun 버전은 `packageManager`에서 읽고 권한은 `contents: read`다 — 검증: 파일 확인 [사용자 결정]

## 4. 인터페이스 계약
- 해당 없음 — 다른 코드가 호출하는 API·스키마·함수 경계면이 없는 개발 환경 기능이다. [사용자 결정]

## 5. 엣지 케이스와 실패 시나리오
F-0에서는 다루지 않는다. 실패 대비 설정은 1장의 세부 설정 요구로 계획에서 확인한다. [사용자 결정]

## 미결정 사항
없음
