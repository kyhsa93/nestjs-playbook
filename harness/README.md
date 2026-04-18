# Harness

이 디렉토리는 `nestjs-playbook`의 평가 하네스를 담는다.

## 목적

- AI Agent에게 NestJS DDD 과제를 부여한다.
- 산출물을 구조/규칙/실행/아키텍처 기준으로 평가한다.
- 0~100 점수 리포트를 생성한다.

## 핵심 원칙

- 하네스는 특정 비즈니스 도메인을 평가하지 않는다.
- 과제는 도메인 중립적으로 설계한다.
- 문서 내 비즈니스 예시는 설명용일 뿐이다.

## 디렉토리

```text
package.json   의존성(tsx, typescript, @types/node)
tsconfig.json  TypeScript 설정
tasks/         과제 정의 (metadata + task.md + assertions)
evaluators/    자동 평가기 (rules/, ast 기반 유틸 shared/)
tests/         evaluator 회귀 fixture & 러너
```

## 설치

```bash
cd harness
npm install
```

## 실행

과제 루트와 제출물 루트를 지정하여 평가를 실행한다.

```bash
# tsx로 직접 실행
npm run evaluate -- <taskRoot> <submissionRoot>

# 예: 현재 프로젝트 자체를 평가
npm run evaluate -- tasks/new-domain/domain-module-basic ..
```

출력은 0-100 정규화 점수, 등급(A–F), 카테고리별 breakdown, 실패 항목, 해당 제출물에 적용되지 않아 평가에서 제외된 evaluator 목록을 JSON으로 담는다.

```json
{
  "taskId": "new-domain/domain-module-basic",
  "totalScore": 87,
  "grade": "B",
  "rawScore": 275,
  "rawMax": 315,
  "breakdown": { "structure": 25, "architecture": 190, "api": 25, "testing": 25, "semantics": 25, "runtime": 0 },
  "breakdownMax": { "structure": 25, "architecture": 215, "api": 25, "testing": 25, "semantics": 25, "runtime": 0 },
  "skippedEvaluators": ["task-queue", "scheduler", "deprecated-api"],
  "failures": [ /* ... */ ]
}
```

- **totalScore**: `rawScore / rawMax * 100` 정규화. 등급 매핑은 `grade()`에서 0-100 기준.
- **skippedEvaluators**: 제출물에 해당 관심사 관련 코드가 없어 maxScore=0으로 평가에서 제외된 evaluator (예: `@TaskConsumer`가 없으면 task-queue 제외).

## Type 체크

```bash
npm run typecheck
```

## Evaluator 회귀 테스트

```bash
npm run test:evaluators
```

`tests/fixtures/<evaluator>/<case>/` 에 준비된 미니 NestJS 프로젝트에 대해 각 evaluator를 호출하고, `expected.json`과 실패 목록을 비교한다.
