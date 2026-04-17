# NestJS 개발 가이드

AI Agent가 NestJS TypeScript 서버 프로젝트를 도메인 주도 설계 기반으로 설계하고 구현할 때 따라야 하는 통합 가이드입니다.

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
    domain/           ← 도메인 레이어 (비즈니스 규칙, Aggregate, Repository 인터페이스)
    application/      ← 애플리케이션 레이어 (유스케이스 조율, Service)
    interface/        ← 인터페이스 레이어 (Controller, DTO)
    infrastructure/   ← 인프라 레이어 (Repository 구현체, 외부 연동)
```

- **도메인 우선 디렉토리 구조**: `src/<domain>/` 하위에 4개 레이어를 배치한다.
- **Domain 레이어**: Aggregate Root에 비즈니스 규칙과 불변식을 캡슐화한다. 프레임워크에 의존하지 않는다.
- **Aggregate Root 단위 Repository**: Repository 인터페이스는 domain 레이어에, 구현체는 infrastructure 레이어에 배치한다.
- **Application Service는 조율자**: 비즈니스 로직은 도메인 객체에 위임하고, Service는 트랜잭션/이벤트/Repository 호출을 조율한다.

## 가이드 관리 원칙

### 작성 언어
- 가이드의 모든 설명과 본문은 한글로 작성한다.
- 코드 예시 내부의 식별자(변수명, 클래스명, 메서드명 등)와 TypeScript 키워드는 영문을 사용한다.

### 예시 작성 및 검토 의무
가이드에 새 규칙을 추가하거나 기존 규칙을 수정할 때는 반드시 아래 절차를 따른다.
1. 규칙을 보여주는 올바른 예시(`// 올바른 방식`)와 잘못된 예시(`// 잘못된 방식`)를 함께 작성한다.
2. 예시가 가이드 전체 규칙에 부합하는지 검토한다.
3. 위반이 발견되면 예시를 수정한 뒤 규칙을 확정한다.

### 변경 후 반영 절차
1. `main` 브랜치에서 Conventional Branch 규칙에 따라 새 브랜치를 생성한다.
2. 변경 사항을 commit한다 (Conventional Commits 형식).
3. `main` 브랜치로 Pull Request를 생성한다.
4. 상세한 브랜치/커밋/PR 규칙은 [docs/conventions.md](docs/conventions.md) 섹션 10~11을 참조한다.

---

## 🧪 AI Agent Evaluation Harness

이 레포는 NestJS 아키텍처 가이드에 더해, AI Agent가 생성한 코드를 구조적으로 평가할 수 있는 하네스를 제공합니다.

### What is Harness?

- task 기반 문제 정의
- 아키텍처 및 코드 규칙 평가
- 점수 및 실패 리포트 생성

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

### What is Evaluated?

- Layer dependency
- Repository pattern
- Module DI
- Controller / API 설계
- DTO validation
- Error handling
- CQRS 구조
- 테스트 존재 여부

### Note

- 일부 규칙은 AST 기반으로 부분 검증됩니다
- 비즈니스 로직의 정합성까지는 평가하지 않습니다
