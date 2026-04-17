# NestJS 개발 가이드

AI Agent가 NestJS TypeScript 서버 프로젝트를 도메인 주도 설계 기반으로 설계하고 구현할 때 따라야 하는 통합 가이드입니다.

> This repository includes a **NestJS architecture playbook + AI evaluation harness**

## 프로젝트 구조

```
docs/
  development-process.md              에이전트 역할 기반 개발 프로세스
  architecture/                          아키텍처 가이드 (주제별 분리)
    directory-structure.md                 디렉토리 구조
    layer-architecture.md                  레이어 아키텍처
    repository-pattern.md                  Repository 패턴
    module-pattern.md                      NestJS 모듈 패턴
    error-handling.md                      에러 처리
    domain-events.md                       도메인 이벤트 (Outbox + SQS)
    database-queries.md                    DB 쿼리 패턴
    authentication.md                      인증 (Bearer JWT)
    domain-service.md                      Domain Service
    shared-modules.md                      공유 모듈 구조
    cross-domain.md                        크로스 도메인 호출
    aggregate-id.md                        Aggregate ID (UUID)
    cqrs-pattern.md                        @nestjs/cqrs
    config.md                              환경 설정 (ConfigModule)
    secret-manager.md                      Secret 관리 (AWS)
    bootstrap.md                           앱 부트스트랩 (main.ts)
    local-dev.md                           로컬 개발 환경 (Docker Compose)
    dockerfile.md                          Dockerfile
    design-principles.md                   핵심 설계 원칙 요약
  conventions.md                      코딩 컨벤션
  reference.md                        전체 도메인 구현 템플릿
  checklist.md                        AI Agent 자기 검토 체크리스트

CLAUDE.md                              ← Claude Code 진입점
.cursor/rules/nestjs-guide.mdc         ← Cursor 진입점
.github/copilot-instructions.md        ← GitHub Copilot 진입점
```

각 AI 도구의 진입점 파일은 `docs/` 참조 포인터를 담는다.
아키텍처 가이드는 주제별로 분리되어 있어, 작업에 필요한 파일만 참조하면 된다.

## 🧪 AI Agent Evaluation Harness

이 레포는 단순한 NestJS 가이드가 아니라, AI Agent가 생성한 코드를 자동으로 평가할 수 있는 **하네스(harness)** 를 포함합니다.

### What is Harness?

- task 기반 코드 생성 문제 정의
- 코드 구조 및 아키텍처 평가
- 규칙 기반 점수 산출
- 실패 원인 리포트 생성

### Structure

```
harness/
  tasks/
  evaluators/
  shared/
```

### How to Run

```bash
node harness/evaluators/cli/run.js <taskRoot> <submissionRoot>
```

### Output Example

```json
{
  "taskId": "new-domain/domain-module-basic",
  "totalScore": 82,
  "grade": "B"
}
```

### What is Evaluated?

- Layer dependency
- Repository pattern
- Module DI
- Controller / API design
- DTO validation
- Error handling
- CQRS 구조
- 테스트 존재 여부

## 사용 방법

### 새 프로젝트를 시작하는 경우
1. `docs/development-process.md`의 Orchestrator가 전체 흐름을 조율한다.
2. 각 에이전트(RA → SD → DM → TD → IM → VA)가 순서대로 독립 수행하며, 산출물을 다음 에이전트에게 전달한다.
3. Implementer 에이전트는 `docs/architecture/` 하위 문서와 `docs/conventions.md`의 규칙을 따라 코드를 작성한다.
4. `docs/reference.md`의 템플릿을 참고하여 일관된 코드 구조를 유지한다.
5. Validator 에이전트가 `docs/checklist.md`로 자기 검토를 수행한다.

### 기존 프로젝트에 기능을 추가하는 경우
1. 필요에 따라 `docs/development-process.md`의 개별 에이전트를 선택적으로 활용한다. (예: Implementer + Validator만 사용)
2. Implementer 에이전트는 `docs/architecture/` 하위 문서와 `docs/conventions.md`의 규칙을 따라 코드를 작성한다.
3. `docs/reference.md`의 템플릿을 참고한다.
4. Validator 에이전트가 `docs/checklist.md`로 자기 검토를 수행한다.

## 핵심 아키텍처 요약

```
src/
  <domain>/
    domain/
    application/
    interface/
    infrastructure/
```

- 도메인 우선 구조
- Domain 레이어는 프레임워크 비의존
- Repository는 domain interface + infra 구현
- Application은 조율자

## 가이드 관리 원칙

### 작성 언어
- 가이드는 한글
- 코드 식별자는 영문

### 예시 작성 및 검토 의무
1. 올바른/잘못된 예시 작성
2. 전체 규칙과 일치 검증
3. 위반 시 수정

### 변경 후 반영 절차
1. main 기준 브랜치 생성
2. commit
3. PR 생성
4. conventions.md 참조
