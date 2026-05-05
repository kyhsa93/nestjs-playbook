# Harness Coverage Matrix

`harness/`가 `docs/`의 가이드 규칙을 어느 수준까지 자동 검증하는지 추적한다.

## 상태 기준

| Status | 의미 |
|---|---|
| Covered | 현재 evaluator가 주요 규칙을 자동 검증함 |
| Partial | 일부 핵심 규칙만 자동 검증함 |
| Manual | 정적 분석보다 코드 리뷰/설계 리뷰가 적합함 |
| Gap | 가이드에는 있으나 하네스 검증이 없음 |

## Architecture guide coverage

| Guide | 주요 규칙/관심사 | Auto-check | Evaluator | Status | Gap / Next action |
|---|---|---:|---|---|---|
| `directory-structure.md` | `src/<domain>/` 하위 4레이어 구조 | ✅ | `structure` | Covered | - |
| `layer-architecture.md` | Domain 레이어의 NestJS/TypeORM 의존 금지, 레이어 방향성 | ✅ | `layer-dependency`, `import-graph` | Covered | 더 세밀한 application/interface/infrastructure 의존 규칙은 필요 시 확장 |
| `design-principles.md` | Application Service는 조율, 비즈니스 로직은 Domain에 위치 | ⚠️ | `checklist`, `layer-dependency` | Partial | 비즈니스 로직 위치는 정적 분석 한계가 있어 Manual 리뷰 병행 |
| `repository-pattern.md` | Repository abstract class, 직접 인스턴스화 금지 | ✅ | `repository-pattern` | Covered | transaction 관련 규칙은 `transaction` evaluator 후보 |
| `module-pattern.md` | `@Module` providers 구성, DI 등록 | ✅ | `module-di-ast` | Partial | imports/exports 경계 검증 추가 가능 |
| `cqrs-pattern.md` | command/query 분리, Query에서 Repository 미사용 | ✅ | `cqrs-pattern` | Covered | handler 단위 CQRS 규칙은 추후 확장 가능 |
| `domain-service.md` | Domain Service 위치/책임/네이밍 | ❌ | - | Gap | `domain-service` evaluator 후보 |
| `domain-events.md` | Aggregate event, Outbox, handler 위치, EventBus 직접 호출 금지 | ✅ | `domain-event-outbox` | Covered | integration event 세부 정책은 fixture 확장 필요 |
| `aggregate-id.md` | Aggregate ID value object, primitive id 직접 사용 제한 | ❌ | - | Gap | `aggregate-id` evaluator 후보 |
| `cross-domain.md` | 도메인 간 직접 의존 금지, Adapter 경유 | ⚠️ | `import-graph` | Partial | `cross-domain-adapter` evaluator 후보 |
| `shared-modules.md` | Shared module 범위, 공통 모듈 남용 방지 | ❌ | - | Gap | `shared-module` evaluator 후보 |
| `database-queries.md` | Query/TransactionManager/Migration 규칙 | ⚠️ | `layer-dependency`, `repository-pattern` | Partial | `transaction` evaluator 후보 |
| `error-handling.md` | Domain HttpException 금지, ErrorCode/응답 tuple 규칙 | ✅ | `error-handling` | Covered | - |
| `authentication.md` | Bearer JWT, Guard, public route 명시 | ❌ | - | Gap | `auth` evaluator 후보 |
| `middleware-interceptor.md` | Middleware/Guard/Interceptor/Pipe 위치와 적용 | ❌ | - | Gap | `auth`, `bootstrap`, `middleware` evaluator 후보 |
| `pagination.md` | Pagination DTO, 공통 응답 포맷, limit 제한 | ❌ | - | Gap | `pagination-response` evaluator 후보 |
| `rate-limiting.md` | Rate limit guard/interceptor/module 설정 | ❌ | - | Gap | `rate-limiting` evaluator 후보 |
| `testing.md` | 테스트 존재, 테스트 실행 | ✅ | `test-presence`, `test-run` | Partial | 테스트 품질/계층별 테스트 패턴은 Manual 리뷰 병행 |
| `logging.md` | Logger 사용, console 금지, observability | ❌ | - | Gap | `logging` evaluator 후보 |
| `config.md` | 환경 변수 validation, ConfigModule 설정, process.env 직접 참조 제한 | ⚠️ | `secret-manager` | Partial | `config-validation` evaluator 후보 |
| `secret-manager.md` | 민감 값 직접 env 사용 방지, SecretService/SecretsManager 사용 | ✅ | `secret-manager` | Partial | secret 사용 경로 fixture 확장 필요 |
| `bootstrap.md` | ValidationPipe, bootstrap 설정 | ❌ | - | Gap | `healthcheck-bootstrap` evaluator 후보 |
| `graceful-shutdown.md` | shutdown hook, health/readiness/liveness | ❌ | - | Gap | `healthcheck-bootstrap` evaluator 후보 |
| `local-dev.md` | docker-compose, LocalStack, 로컬 실행 구성 | ❌ | - | Gap | `local-dev` evaluator 후보 |
| `dockerfile.md` | Dockerfile 보안/멀티스테이지/빌드 규칙 | ❌ | - | Gap | `dockerfile` evaluator 후보 |
| `scheduling.md` | Cron 위치/try-catch, TaskConsumer 위치/CommandService 주입 | ✅ | `scheduler`, `task-queue` | Covered | - |

## Non-architecture guide coverage

| Guide | 주요 규칙/관심사 | Auto-check | Evaluator | Status | Gap / Next action |
|---|---|---:|---|---|---|
| `docs/checklist.md` | 작업 후 자기 검토 체크리스트 중 기계 검증 가능한 항목 | ✅ | `checklist` | Partial | 체크리스트 변경 시 evaluator 동기화 필요 |
| `docs/conventions.md` | 네이밍, 브랜치, 커밋, 문서 작성 규칙 | ⚠️ | `file-naming`, `controller-path` | Partial | Git/PR 규칙은 CI 또는 리뷰 정책으로 보완 |
| `docs/reference.md` | Order 예시 기반 템플릿 구조 | ⚠️ | 여러 evaluator | Partial | 예시 전체 일관성은 Manual 리뷰 병행 |
| `docs/development-process.md` | 에이전트 역할 기반 개발 프로세스 | ❌ | - | Manual | 프로세스 문서는 자동 검증 대상 아님 |

## Evaluator coverage summary

| Evaluator | 주요 docRef | Coverage note |
|---|---|---|
| `structure` | `directory-structure.md` | 4레이어 디렉토리 구조 검증 |
| `layer-dependency` | `layer-architecture.md` | Domain 레이어 의존성 위반 검증 |
| `repository-pattern` | `repository-pattern.md` | Repository 형태와 직접 생성 금지 검증 |
| `controller-path` | `conventions.md`, API 관련 문서 | 동사 prefix controller path 금지 |
| `checklist` | `checklist.md` | 체크리스트 기반 복합 룰 |
| `cqrs-pattern` | `cqrs-pattern.md` | command/query 분리 검증 |
| `error-handling` | `error-handling.md` | 예외/에러 코드 규칙 검증 |
| `test-presence` | `testing.md` | 테스트 파일 존재 검증 |
| `dto-validation` | `middleware-interceptor.md`, API 관련 문서 | DTO validation decorator 검증 |
| `task-queue` | `scheduling.md` | TaskConsumer 패턴 검증 |
| `scheduler` | `scheduling.md` | Cron 위치와 예외 처리 검증 |
| `deprecated-api` | API 문서/Swagger 규칙 | deprecated API 표시 검증 |
| `module-di-ast` | `module-pattern.md` | Module providers 배열 검증 |
| `import-graph` | `layer-architecture.md`, `cross-domain.md` | domain → infrastructure import 금지 |
| `domain-event-outbox` | `domain-events.md` | Outbox/event handler 규칙 검증 |
| `build` | 전체 TypeScript 프로젝트 | `tsc --noEmit` 실행 |
| `test-run` | `testing.md` | opt-in 테스트 실행 |
| `secret-manager` | `secret-manager.md`, `config.md` | 민감 env 직접 사용 방지 |

## Guide-Harness sync policy

가이드에 `반드시`, `금지`, `해야 한다` 수준의 규칙을 추가하거나 변경할 때 PR은 다음 중 하나를 포함해야 한다.

1. 해당 규칙을 검증하는 evaluator 추가
2. 기존 evaluator에 ruleId/fixture 추가
3. 이 문서에 `Manual` 또는 `Gap`으로 명시하고 자동 검증하지 않는 이유 작성

위 항목 중 하나도 없으면 가이드와 하네스의 동기화가 불완전한 변경으로 본다.
