# Harness — nestjs-playbook 가이드 규칙 linter

`docs/`의 가이드 규칙 중 **기계 검증 가능한 항목**을 외부 NestJS 프로젝트에 적용하는 정적 분석 도구.
각 evaluator는 TypeScript AST·파일 경로·정규식을 조합해 규칙 위반을 검출한다.

## 구조

```
harness/
  evaluators/
    rules/              18개 evaluator (structure, layer-dependency, ...)
    shared/             types, score, ast-utils, penalty, workspace
    cli/run.ts          CLI 엔트리
  tests/
    fixtures/<name>/<case>/   회귀 fixture (expected.json 기반)
    run-fixtures.ts           러너
  package.json · tsconfig.json
```

## 설치

```bash
cd harness
npm install
```

## 사용

```bash
# 대상 NestJS 프로젝트 전체 평가
npm run evaluate -- /path/to/your-nestjs-project

# 특정 evaluator만
npm run evaluate -- /path/to/project --only=structure,layer-dependency,task-queue

# 파일 출력
npm run evaluate -- /path/to/project --out=report.json
```

출력(JSON):
```json
{
  "projectRoot": "/abs/path",
  "totalScore": 87,
  "grade": "B",
  "rawScore": 267,
  "rawMax": 305,
  "runEvaluators": ["structure", "layer-dependency", "..."],
  "skippedEvaluators": ["task-queue", "scheduler"],
  "failures": [
    {
      "ruleId": "repository.abstract-class",
      "severity": "high",
      "message": "repository는 abstract class여야 함: src/order/domain/order-repository.ts",
      "docRef": "docs/architecture/repository-pattern.md"
    }
  ]
}
```

각 failure의 `docRef`는 해당 규칙을 설명하는 가이드 문서 상대 경로. 에이전트·개발자는 이 링크를 열어 수정 방향을 확인한다.

## Evaluator 목록

| 이름 | 역할 | maxScore |
|------|------|----------|
| `structure` | 4레이어 디렉토리 + `src/task-queue/` 조건부 | 25 |
| `layer-dependency` | Domain에 NestJS/TypeORM 금지 등 | 25 |
| `repository-pattern` | abstract class 여부, 직접 인스턴스화 금지 | 25 |
| `controller-path` | `@Controller('create…')` 같은 동사 prefix 금지 | 25 |
| `checklist` | `docs/checklist.md` 기반 기계 룰 모음 | 100 |
| `cqrs-pattern` | `command/`·`query/` 분리, Query에서 Repository 미사용 | 25 |
| `error-handling` | Domain HttpException 금지, Application throw new Error 금지, `<domain>-error-code.ts` 존재/네이밍/메시지 1:1, `generateErrorResponse` 3-튜플 | 25 |
| `test-presence` | `test/` 또는 `*.spec.ts` 존재 | 25 |
| `dto-validation` | DTO에 `class-validator` 데코레이터 부착 | 25 |
| `task-queue` | `@TaskConsumer` 사용 시 Interface 레이어, CommandService 주입 등 | 20 *(auto-gated)* |
| `scheduler` | `@Cron` 사용 시 Infrastructure 레이어, try-catch | 15 *(auto-gated)* |
| `deprecated-api` | deprecated/legacy 경로에 `@ApiOperation({ deprecated: true })` | 10 *(auto-gated)* |
| `module-di-ast` | `@Module`에 providers 배열 존재 | 25 |
| `import-graph` | domain → infrastructure import 금지 | 25 |
| `domain-event-outbox` | Aggregate 이벤트 발행 시 Outbox 모듈/Repository saveAll/clearEvents 준수, Application(단 `application/event/` 예외)에서 이벤트 직접 생성·OutboxWriter 참조 금지, `@HandleEvent`는 `application/event/<event>-handler.ts`, `@HandleIntegrationEvent`는 `interface/integration-event/<domain>-integration-event-controller.ts`, `EventBus.publish()` 직접 호출 금지 | 15 *(auto-gated)* |
| `build` | `tsc --noEmit` 실행 (tsconfig 존재 시) | 25 *(auto-gated)* |
| `test-run` | `npm test` 실행 (`HARNESS_ENABLE_TEST_RUN=1`) | 20 *(opt-in)* |

*auto-gated*: 해당 기능을 사용하는 코드가 없으면 `maxScore=0`으로 집계에서 제외.
*opt-in*: 환경 변수 명시 시에만 실행.

## Type 체크 / 회귀 테스트

```bash
npm run typecheck          # evaluator TypeScript 검증
npm run test:evaluators    # tests/fixtures/ 기반 회귀
```

회귀 fixture 구조:
```
tests/fixtures/<evaluator>/<case>/
  src/                   (최소 NestJS 소스 — 컴파일 안 해도 됨)
  expected.json          { name, applicable, expectedFailureRuleIds }
```

## 점수 산정

- 각 evaluator는 `{ score, maxScore }` 반환.
- `aggregate()`가 `sumScore / sumMax * 100`으로 **0–100 정규화**.
- 적용 불가(maxScore=0) evaluator는 집계에서 제외.
- 등급: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60.

Severity → 감점 기본 매핑 (`shared/penalty.ts`):

| severity | base penalty |
|----------|--------------|
| critical | 6 |
| high     | 4 |
| medium   | 2 |
| low      | 1 |

## CI 통합

프로젝트 `.github/workflows/`에 추가:

```yaml
- run: |
    cd /path/to/harness
    npm ci
    npm run evaluate -- ${{ github.workspace }} --out=report.json
    # 점수 임계 검사
    node -e "if (JSON.parse(require('fs').readFileSync('report.json')).totalScore < 80) process.exit(1)"
```

## 기여

### 새 evaluator 추가

1. `evaluators/rules/<name>.evaluator.ts` 작성
   - `export function evaluate<Name>(root: string): EvaluatorResult` 시그니처
   - 적용 대상 없으면 `{ score: 0, maxScore: 0, failures: [] }` 반환 (auto-gate)
   - 실패엔 가능하면 `docRef`(가이드 경로) 포함
   - 감점은 `shared/penalty.ts`의 `penaltyFor(severity)` 권장
   - AST가 필요하면 `shared/ast-utils.ts`(`listMethodDecorators`, `listConstructorParams`, `findClassDecorator` 등)
2. `evaluators/cli/run.ts`의 `EVALUATORS` map에 등록
3. `evaluators/shared/score.ts`의 breakdown 라우팅에 카테고리 추가 (`architecture` / `api` / `testing` / `runtime`)
4. `tests/fixtures/<name>/<case>/` fixture 작성 (`good` + 최소 1개 `bad-*`)
5. `npm run typecheck && npm run test:evaluators`

### docRef 규약

- 실패가 특정 문서에 대응될 때 `docRef: 'docs/architecture/<file>.md#<anchor>'` 형식.
- 앵커는 GitHub 생성 규칙(소문자, 공백 → `-`). 한글 지원되지만 em-dash(—)는 제거되어 이중 `--` 발생 가능.
- 작성 후 실제 렌더링 링크가 유효한지 반드시 로컬에서 확인.

## 관련

- 가이드 진입점: [`CLAUDE.md`](../CLAUDE.md) (상위 루트) — 작업/키워드 → 문서 매핑.
- 규칙 설명: `docs/architecture/*.md` — evaluator가 검증하는 원리.
