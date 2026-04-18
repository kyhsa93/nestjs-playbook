# NestJS 개발 가이드

DDD 기반 NestJS TypeScript 서버 프로젝트의 설계/구현 가이드이다.
`src/<domain>/{domain,application,interface,infrastructure}/` 4레이어 구조를 따른다.

## 작업 시 참조할 문서

아래 표는 **작업/키워드 → 문서** 인덱스. 문서를 grep하기 전 먼저 이 표에서 후보를 좁힌다.

### 설계 / 프로세스

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| 설계, 요구사항 분석, 전술 설계, 설계 산출물 | `docs/development-process.md` |
| 레거시 기능 수정, Vertical Slice 리팩토링 | `docs/development-process.md` (레거시 기능 수정 섹션) |
| 설계 원칙 | `docs/architecture/design-principles.md` |
| 코딩 컨벤션, 파일명 규칙, import 규칙 | `docs/conventions.md` |
| 새 도메인 추가, 도메인 모듈 템플릿, Order 예시 | `docs/reference.md` |
| 작업 완료 후 자기 검토, 체크리스트 | `docs/checklist.md` |
| Deprecated 엔드포인트 표시, @ApiOperation deprecated | `docs/conventions.md` (Deprecated 엔드포인트 섹션) |

### 레이어 · 구조

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| 프로젝트 구조, 디렉토리 레이아웃 | `docs/architecture/directory-structure.md` |
| 레이어 역할, Domain / Application / Interface / Infrastructure | `docs/architecture/layer-architecture.md` |
| Repository 인터페이스·구현, abstract class | `docs/architecture/repository-pattern.md` |
| Domain Service (여러 Aggregate 조율) | `docs/architecture/domain-service.md` |
| 크로스 도메인 호출, Adapter 패턴 | `docs/architecture/cross-domain.md` |
| Aggregate ID 생성·전파 | `docs/architecture/aggregate-id.md` |
| 공유 모듈 구조, 공용 인프라 모듈 | `docs/architecture/shared-modules.md` |
| 모듈 구성, @Module, providers, controllers, DI 바인딩 | `docs/architecture/module-pattern.md` |

### 데이터 / 트랜잭션

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| DB 쿼리, TypeORM 사용법, QueryBuilder | `docs/architecture/database-queries.md` |
| 트랜잭션 관리, TransactionManager, AsyncLocalStorage | `docs/architecture/database-queries.md` |
| 마이그레이션, synchronize, data-source | `docs/architecture/database-queries.md` |
| Domain Event, 이벤트 발행·수신, fan-out | `docs/architecture/domain-events.md` |
| Outbox 패턴, OutboxWriter, OutboxRelay, EventConsumer | `docs/architecture/domain-events.md` |
| @nestjs/cqrs, CommandBus, QueryBus, CommandHandler | `docs/architecture/cqrs-pattern.md` |

### API / Interface

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| REST 엔드포인트, Controller, DTO | `docs/architecture/module-pattern.md` |
| Swagger 문서화, @ApiProperty, @ApiOperation, @ApiTags | `docs/architecture/module-pattern.md` |
| Pagination, 공통 응답 포맷, page/take | `docs/architecture/pagination.md` |
| Rate Limiting, Throttler | `docs/architecture/rate-limiting.md` |
| Presigned URL, 파일 업로드/다운로드 | `docs/architecture/module-pattern.md` (파일 업로드/다운로드 섹션) |
| 인증, 인가, Auth Guard, JWT, Bearer 토큰 | `docs/architecture/authentication.md` |
| Middleware / Guard / Interceptor / Pipe | `docs/architecture/middleware-interceptor.md` |
| 에러 처리, generateErrorResponse, 에러 메시지 enum, HttpException | `docs/architecture/error-handling.md` |

### 운영 / 인프라

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| 환경 설정, 환경 변수 검증, ConfigModule, class-validator | `docs/architecture/config.md` |
| Secret 관리, 비밀값 주입, secret-manager | `docs/architecture/secret-manager.md` |
| 앱 부트스트랩, main.ts, NestFactory, Swagger 설정 | `docs/architecture/bootstrap.md` |
| Graceful Shutdown, OnApplicationShutdown, terminationGracePeriodSeconds | `docs/architecture/graceful-shutdown.md` |
| 헬스체크, readiness / liveness | `docs/architecture/graceful-shutdown.md` (헬스체크 섹션) |
| 로컬 개발 환경, docker-compose, LocalStack, Postgres | `docs/architecture/local-dev.md` |
| Dockerfile, 멀티스테이지 빌드, 컨테이너 이미지 | `docs/architecture/dockerfile.md` |
| Logging, 로그 레벨, logger.warn/error, structured log | `docs/architecture/logging.md` |
| Observability, 메트릭, Prometheus, 트레이싱, OpenTelemetry, traceId | `docs/architecture/observability.md` |
| 알람, 대시보드, Golden Signals, DLQ 감시, p99 지연 | `docs/architecture/observability.md` |

### 비동기 / Task Queue / Scheduling

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| Scheduling, @Cron, @Interval, @Timeout, ScheduleModule | `docs/architecture/scheduling.md` |
| Task Queue, @TaskConsumer, Task Controller | `docs/architecture/scheduling.md` |
| TaskQueue Outbox, task_outbox, TaskOutboxRelay | `docs/architecture/scheduling.md#taskqueue--outbox-기반-구현` |
| 멱등성, idempotencyKey, TaskExecutionLog, record-before-execute | `docs/architecture/scheduling.md#멱등성` |
| SQS, FIFO, MessageDeduplicationId, MessageGroupId, DLQ | `docs/architecture/scheduling.md` |
| VisibilityTimeout, 하트비트, ChangeMessageVisibility | `docs/architecture/scheduling.md#긴-task와-visibilitytimeout-하트비트` |
| Task 재시도 / DLQ redrive | `docs/architecture/scheduling.md#dlq-모니터링` |

### 품질 / 검증

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| Testing, 단위 테스트, 통합 테스트, jest 설정 | `docs/architecture/testing.md` |
| 하네스 evaluator, 규칙 자동 검증, ruleId | `docs/rules-index.md` |
| 하네스 CLI 실행, self-check | `harness/README.md` · `harness/CONTRIBUTING.md` |

## 에이전트 / 개발자 진입점

- **대화형 개발자 온보딩** → 이 문서(`CLAUDE.md`). 작업 → 문서 매핑.
- **자동 에이전트 파이프라인** → `AGENTS.md`. sandbox 기반 입출력 계약, 에이전트 실행 규약.
- **문서 기여 / 하네스 규칙 추가** → `harness/CONTRIBUTING.md`.
