# Contributing to the harness

## 구성 요소

```
harness/
  baseline/       에이전트가 시작하는 NestJS 최소 프로젝트
  tasks/          과제 정의 (metadata + task.md + assertions)
  evaluators/     자동 평가기 (rules/, shared/)
  golden/         과제별 "정답" 샘플 (harness 자체 회귀 방어)
  tests/          evaluator 회귀 fixture + 러너
  sandbox/        실행 시 agent가 작업하는 임시 디렉토리 (gitignored)
  scripts/        agent runner, sandbox 관리, golden 검증
```

## 새 evaluator 추가하기

1. `evaluators/rules/<name>.evaluator.ts` 작성.
   - `export function evaluate<Name>(root: string): EvaluatorResult` 시그니처.
   - 적용 대상 없으면 `{ score: 0, maxScore: 0, failures: [] }` 반환 (applicability gate).
   - 감점은 가능하면 `shared/penalty.ts`의 `penaltyFor(severity)` 사용.
   - 가능하면 `shared/ast-utils.ts`의 AST 헬퍼 사용 (regex는 fragile).
2. `evaluators/cli/run.ts`의 `EVALUATORS` map에 등록.
3. `evaluators/shared/score.ts`의 breakdown 라우팅에 카테고리 매핑 추가.
4. `tests/fixtures/<name>/<case>/` fixture 추가 (`good` + 최소 1개 `bad-*`).
5. `npm run typecheck && npm run test:evaluators`로 검증.

## 새 task pack 추가하기

1. `tasks/<category>/<taskId>/` 디렉토리 생성.
2. 필수 파일:
   - `metadata.json` — id, category, difficulty, workflow, requires, scoringProfile.
   - `task.md` — 목표 / 요구사항 / 제약 / 평가 포인트.
   - `assertions/structure.json` — `requiredPaths`.
   - `assertions/architecture.json` — 아키텍처 플래그.
   - `assertions/api.json` — API 관련 플래그.
3. 카테고리:
   - `new-domain/` — 새 bounded context 구현.
   - `bugfix/` — 버그 수정.
   - `legacy-refactor/` — 리팩토링.
   - 더 추가 가능 (runtime/, performance/, security/).
4. (선택) `golden/<category>/<taskId>/src/` 에 정답 샘플 추가.
5. `scripts/verify-golden.sh <category/taskId>`로 golden이 ≥90점을 받는지 확인.

## 새 fixture 추가하기

```
tests/fixtures/<evaluator>/<case>/
  src/                      (NestJS 소스 — 실제 컴파일 불필요)
  expected.json             { name, applicable, expectedFailureRuleIds }
```

`npm run test:evaluators`가 러너를 실행해 결과를 expected와 비교한다.

## Submission 포맷 계약

Agent가 sandbox에 남겨야 하는 것:

- `src/**/*.ts` — 제출 코드
- (선택) `src/**/*.spec.ts` 또는 `test/**` — 테스트 코드
- 외부 파일 (README, docs 등) 은 평가 대상이 아님

Harness가 평가 후 sandbox에 남기는 것:

- `RESULT.json` — 최종 round 평가 리포트 (symlink)
- `RESULT-roundN.json` — 각 라운드 리포트
- `AGENT_LOG.txt` — agent 실행 stdout/stderr

## 점수 체계

- 각 evaluator는 `score / maxScore`를 반환.
- `shared/score.ts`의 `aggregate()`는 `sumScore / sumMax * 100` 정규화.
- 적용 불가 evaluator(maxScore=0)는 제외 (통계 왜곡 방지).
- 등급 기준: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60.

## Severity → penalty 기본 매핑 (`shared/penalty.ts`)

| severity | base penalty |
|----------|--------------|
| critical | 6 |
| high     | 4 |
| medium   | 2 |
| low      | 1 |

`penaltyFor(severity, weight)`로 evaluator별 가중 가능.

## 코딩 규약

- TypeScript strict 모드 유지.
- 각 evaluator는 순수 함수 (`(root) → EvaluatorResult`). 전역 상태 금지.
- AST 순회 필요하면 `shared/ast-utils.ts` 먼저 확인하고, 필요한 유틸을 보강.
- 큰 파일 IO 반복이 예상되면 `shared/workspace.ts`의 캐시 사용.

## 실행

```bash
cd harness
npm install             # 최초 1회
npm run typecheck
npm run test:evaluators
npm run evaluate -- tasks/new-domain/domain-module-basic <submissionRoot>
```
