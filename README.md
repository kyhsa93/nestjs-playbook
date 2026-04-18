# NestJS 개발 가이드

DDD 기반 NestJS TypeScript 서버 프로젝트의 설계·구현 **참고 가이드**와 규칙을 자동 검증하는 **선택형 linter(harness)** 를 함께 제공한다.

AI 에이전트(Claude Code, Codex 등)가 자기 NestJS 프로젝트를 작업할 때 이 저장소의 `docs/`를 참조하고, 완료 후 `harness/`로 규칙 준수를 검증할 수 있다.

## 프로젝트 구조

```
docs/
  development-process.md            에이전트 역할 기반 개발 프로세스 (선택)
  conventions.md                    코딩 컨벤션
  reference.md                      전체 도메인 구현 템플릿 (Order 예시)
  checklist.md                      작업 후 자기 검토 체크리스트
  architecture/                     아키텍처 가이드 (주제별 26개)
    directory-structure.md            디렉토리 구조
    layer-architecture.md             4레이어 아키텍처
    design-principles.md              핵심 설계 원칙
    repository-pattern.md             Repository 패턴
    module-pattern.md                 NestJS 모듈 패턴
    cqrs-pattern.md                   @nestjs/cqrs
    domain-service.md                 Domain Service
    domain-events.md                  도메인 이벤트 + Outbox
    aggregate-id.md                   Aggregate ID
    cross-domain.md                   크로스 도메인 · Adapter
    shared-modules.md                 공유 모듈
    database-queries.md               DB 쿼리 · TransactionManager · 마이그레이션
    error-handling.md                 에러 처리
    authentication.md                 인증 (Bearer JWT)
    middleware-interceptor.md         Middleware / Guard / Interceptor / Pipe
    pagination.md                     Pagination · 공통 응답
    rate-limiting.md                  Rate Limiting
    testing.md                        테스트 패턴
    logging.md                        Logging · Observability 메모
    config.md                         환경 변수 검증
    secret-manager.md                 Secret 관리
    bootstrap.md                      앱 부트스트랩
    graceful-shutdown.md              Graceful Shutdown · 헬스체크
    local-dev.md                      로컬 개발 (docker-compose · LocalStack)
    dockerfile.md                     Dockerfile
    scheduling.md                     Scheduling · Task Queue 구현 예시

harness/                            규칙 자동 검증 linter (선택적 사용)
  evaluators/rules/                   18개 evaluator (AST 기반 포함)
  tests/fixtures/                     evaluator 회귀 테스트
  README.md                           사용법 · 기여 가이드

CLAUDE.md                           ← Claude Code 진입점 (작업/키워드 → 문서 인덱스)
.cursor/rules/nestjs-guide.mdc      ← Cursor 진입점
.github/copilot-instructions.md     ← GitHub Copilot 진입점
```

## 사용 방법

### 간단 경로 — 개별 작업에 바로 활용 (권장)

1. **키워드로 문서 찾기**: `CLAUDE.md`의 매핑 표에서 작업 키워드 → `docs/architecture/<주제>.md` 참조.
2. **템플릿 참고**: `docs/reference.md`의 Order 도메인 예시를 복사 후 도메인명만 바꿔 시작.
3. **작성 후 자기 검토**: `docs/checklist.md` 체크.
4. **자동 검증 (선택)**:
   ```bash
   cd harness && npm install
   npm run evaluate -- /path/to/your-project
   ```
   실패 항목의 `ruleId`·`message`·`docRef`로 수정 위치 즉시 파악.

### 전체 프로세스 — 설계부터 구현까지 에이전트 체인으로

1. `docs/development-process.md`의 Orchestrator가 전체 흐름을 조율.
2. 각 에이전트(RA → SD → DM → TD → IM → VA)가 순서대로 독립 수행, 산출물을 다음 에이전트에게 전달.
3. Implementer는 `docs/architecture/` 하위 문서와 `docs/conventions.md` 규칙을 따라 코드 작성.
4. `docs/reference.md`의 템플릿으로 구조 일관성 유지.
5. Validator가 `docs/checklist.md` + `harness/`로 자기 검토.

## 핵심 아키텍처 요약

```
src/
  <domain>/
    domain/           도메인 레이어 (Aggregate, Repository 인터페이스) — 프레임워크 무의존
    application/      애플리케이션 레이어 (Command/Query Service) — 조율자
    interface/        인터페이스 레이어 (Controller, DTO)
    infrastructure/   인프라 레이어 (Repository 구현체, 외부 연동)
```

- **도메인 우선 디렉토리**: `src/<domain>/` 하위에 4레이어 배치.
- **Aggregate Root 단위 Repository**: 인터페이스는 domain에, 구현체는 infrastructure에.
- **CQRS 분리**: Command Service는 Repository 사용, Query Service는 `Query` 추상 인터페이스 사용.
- **Application Service는 조율**: 비즈니스 로직은 도메인 객체에 위임.

자세한 내용은 [`docs/architecture/layer-architecture.md`](docs/architecture/layer-architecture.md)와 [`docs/architecture/design-principles.md`](docs/architecture/design-principles.md).

## 가이드 관리 원칙

### 작성 언어
- 설명과 본문은 한글로 작성.
- 코드 식별자(변수명, 클래스명, 메서드명)와 TypeScript 키워드는 영문 유지.

### 예시 작성·검토 의무
가이드에 규칙을 추가하거나 수정할 때는:
1. 올바른 예시(`// 올바른 방식`)와 잘못된 예시(`// 잘못된 방식`)를 함께 작성.
2. 예시가 가이드 전체 규칙과 모순되지 않는지 검토.
3. 위반 발견 시 예시를 수정한 뒤 규칙 확정.

### 변경 반영 절차
1. `main`에서 Conventional Branch 규칙으로 새 브랜치 생성.
2. Conventional Commits 형식으로 commit.
3. `main`으로 Pull Request.
4. 상세 규칙은 [`docs/conventions.md`](docs/conventions.md) 섹션 10~11.

### 하네스 기여
새 evaluator 규칙·fixture 추가는 [`harness/README.md`](harness/README.md)의 "기여" 섹션 참조.
