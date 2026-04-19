# NestJS 개발 가이드

DDD 기반 NestJS TypeScript 서버 프로젝트의 설계/구현 가이드이다.
`src/<domain>/{domain,application,interface,infrastructure}/` 4레이어 구조를 따른다.

이 가이드를 참고하여 에이전트 또는 개발자가 **자기 프로젝트에 NestJS 코드를 작성**한다.
부속 하네스(`harness/`)는 작성한 코드가 규칙을 따르는지 확인하는 **선택형 linter**이다.

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
| Integration Event, 크로스 BC 이벤트, 공개 계약, 이벤트 버저닝, @HandleIntegrationEvent | `docs/architecture/domain-events.md` |
| Integration Event Controller, interface/integration-event/ | `docs/architecture/domain-events.md` |
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
| 에러 처리, generateErrorResponse, 에러 메시지 enum, 에러 코드 enum, 고유 오류 코드, HttpException | `docs/architecture/error-handling.md` |

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
| 메트릭·트레이싱·알람 (상위 메모) | `docs/architecture/logging.md` (메트릭·트레이싱 메모 섹션) |

### 비동기 / Task Queue / Scheduling

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| Scheduling, @Cron, @Interval, @Timeout, ScheduleModule | `docs/architecture/scheduling.md` |
| Task Queue 구현 예시 (@TaskConsumer · Task Controller · Outbox) | `docs/architecture/scheduling.md` |
| 멱등성 (핸들러 멱등 · ledger · 원자성) | `docs/architecture/scheduling.md#멱등성` |
| SQS, FIFO, MessageDeduplicationId, MessageGroupId, DLQ | `docs/architecture/scheduling.md` |
| VisibilityTimeout, 하트비트, ChangeMessageVisibility | `docs/architecture/scheduling.md#긴-task와-visibilitytimeout-하트비트` |

### 품질 / 검증

| 작업 / 키워드 | 읽을 문서 |
|---------------|----------|
| Testing, 단위 테스트, 통합 테스트, jest 설정 | `docs/architecture/testing.md` |
| 하네스 CLI 실행, self-check, evaluator 규칙 목록 | `harness/README.md` |

## 에이전트 · CI 에서 사용

에이전트가 자기 NestJS 프로젝트에서 작업할 때:

1. **가이드 참조**: `docs/architecture/*.md`를 `Read`/`Grep`으로 탐색. 위 표가 키워드 인덱스 역할.
2. **자기 검증**: 작업 완료 후 `docs/checklist.md`로 체크. 기계 검증 가능한 항목은 하네스가 대행:
   ```bash
   cd harness && npm install
   npm run evaluate -- <projectRoot>
   ```
   → 실패 항목의 `ruleId`와 메시지에 **관련 문서 URL이 인라인**으로 포함된다. 해당 문서를 열어 수정한다.
3. **CI 통합**: `.github/workflows/`에서 `npm run evaluate -- . --only=<rules>`로 부분 검사. 자세한 플래그는 `harness/README.md`.

프로젝트 루트 구조 / baseline NestJS 기본은 `docs/reference.md`의 Order 예시를 템플릿으로 쓴다 (그대로 복사 후 도메인 명만 바꿔 시작).
