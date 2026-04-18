# Rules Index — 하네스 ruleId ↔ 가이드 문서 매핑

하네스(`harness/evaluators/rules/`)가 검출하는 각 규칙의 **ruleId → 관련 가이드 문서 / checklist STEP** 매핑이다.
하네스 리포트에서 ruleId를 본 직후 이 표에서 **수정할 때 읽을 문서**를 바로 찾는 용도.

형식: `ruleId` — 의미 — 참고 문서

## structure — 4레이어·공용 모듈 구조

| ruleId | 의미 | 참고 |
|--------|------|------|
| `structure.layer.missing` | `domain/`·`application/`·`interface/`·`infrastructure/` 중 누락 | [directory-structure.md](./architecture/directory-structure.md) · [layer-architecture.md](./architecture/layer-architecture.md) · `checklist.md` STEP 3 |
| `structure.task-queue.missing` | `@TaskConsumer` 사용되는데 `src/task-queue/` 공용 모듈 없음 | [scheduling.md](./architecture/scheduling.md) · [shared-modules.md](./architecture/shared-modules.md) |

## layer-dependency — 레이어 간 의존 위반

| ruleId | 의미 | 참고 |
|--------|------|------|
| `layer.domain.no-framework` | Domain 레이어에 `@nestjs/*` / `typeorm` import | [layer-architecture.md](./architecture/layer-architecture.md) · `checklist.md` STEP 2 |
| `layer.application.no-direct-orm` | Application 레이어에 `typeorm` 직접 사용 | [layer-architecture.md](./architecture/layer-architecture.md) · [database-queries.md](./architecture/database-queries.md) · `checklist.md` STEP 3 |
| `ast.layer.violation` | import-graph 상 domain → infrastructure 위반 | [layer-architecture.md](./architecture/layer-architecture.md) |

## repository-pattern

| ruleId | 의미 | 참고 |
|--------|------|------|
| `repository.abstract-class` | Repository가 `abstract class`가 아님 | [repository-pattern.md](./architecture/repository-pattern.md) · `checklist.md` STEP 4 |
| `repository.no-direct-instantiation` | Application에서 Repository 구현체 직접 생성 | [repository-pattern.md](./architecture/repository-pattern.md) · [module-pattern.md](./architecture/module-pattern.md) |

## cqrs-pattern

| ruleId | 의미 | 참고 |
|--------|------|------|
| `checklist.step3.application.command-directory-missing` | `application/command/` 디렉토리 없음 | [layer-architecture.md](./architecture/layer-architecture.md) · [cqrs-pattern.md](./architecture/cqrs-pattern.md) |
| `checklist.step3.application.query-directory-missing` | `application/query/` 디렉토리 없음 | [layer-architecture.md](./architecture/layer-architecture.md) · [cqrs-pattern.md](./architecture/cqrs-pattern.md) |
| `checklist.step3.query.no-repository-direct-use` | Query Service가 Repository를 직접 사용 (Query 인터페이스를 써야 함) | [layer-architecture.md](./architecture/layer-architecture.md) · [cqrs-pattern.md](./architecture/cqrs-pattern.md) |
| `checklist.step9.query-service-uses-repository` | 위와 동일 검증 (파일명 패턴 기반) | 위와 동일 |

## controller-path / ast.controller

| ruleId | 의미 | 참고 |
|--------|------|------|
| `controller.path.no-verb-prefix` | `@Controller('create/get/update/delete/set/add/remove/...')` 동사 prefix | [conventions.md](./conventions.md) (URL 네이밍 규칙) · `checklist.md` STEP 8 |

## error-handling

| ruleId | 의미 | 참고 |
|--------|------|------|
| `checklist.step7.domain.no-http-exception` | Domain에 `HttpException` 사용 | [error-handling.md](./architecture/error-handling.md) · [layer-architecture.md](./architecture/layer-architecture.md) |
| `checklist.step7.application.no-generic-error` | Application에서 `throw new Error(...)` 직접 사용 | [error-handling.md](./architecture/error-handling.md) |

## checklist — 파일명 / 네이밍

| ruleId | 의미 | 참고 |
|--------|------|------|
| `checklist.step1.file-kebab-case` | 파일명이 kebab-case가 아님 | [conventions.md](./conventions.md) · `checklist.md` STEP 1 |
| `checklist.step1.service-file-name` | `.service.ts` suffix 사용 (권장: `<domain>-service.ts`) | [conventions.md](./conventions.md) · `checklist.md` STEP 1 |
| `checklist.step1.module-file-name` | 모듈 파일명이 `<domain>-module.ts` 아님 | [conventions.md](./conventions.md) · `checklist.md` STEP 1 |

## checklist — 레이어 무결성

| ruleId | 의미 | 참고 |
|--------|------|------|
| `checklist.step2.domain.no-nest-decorator` | Domain에 `@Injectable()` 등 NestJS 데코레이터 | [layer-architecture.md](./architecture/layer-architecture.md) · `checklist.md` STEP 2 |
| `checklist.step2.domain.no-validator-import` | Domain에 `class-validator`/`class-transformer` import | [layer-architecture.md](./architecture/layer-architecture.md) · `checklist.md` STEP 2 |
| `checklist.step2.domain.no-typeorm-entity` | Domain에 `@Entity()` (TypeORM 누수) | [layer-architecture.md](./architecture/layer-architecture.md) |
| `checklist.step2.domain.no-logger` | Domain에서 NestJS `Logger` 사용 (로깅은 Application) | [logging.md](./architecture/logging.md) · [layer-architecture.md](./architecture/layer-architecture.md) |
| `checklist.step3.application.no-http-exception` | Application에 `HttpException` 사용 | [error-handling.md](./architecture/error-handling.md) |
| `checklist.step3.application.no-aws-sdk` | Application이 `@aws-sdk/*` 직접 import (Infra 어댑터 경유 필요) | [layer-architecture.md](./architecture/layer-architecture.md) · [scheduling.md](./architecture/scheduling.md#ad-hoc-task-적재-트랜잭션-안에서) |
| `checklist.step3.application.no-impl-import` | Application에서 `-impl` 직접 import (abstract class 경유) | [layer-architecture.md](./architecture/layer-architecture.md) · [repository-pattern.md](./architecture/repository-pattern.md) |
| `checklist.step4.impl-outside-infrastructure` | `*-impl.ts`가 infrastructure/ 외부 위치 | [directory-structure.md](./architecture/directory-structure.md) |

## checklist — Interface / API

| ruleId | 의미 | 참고 |
|--------|------|------|
| `checklist.step5.interface.single-controller-per-file` | 한 파일에 `@Controller()` 여러 개 | [module-pattern.md](./architecture/module-pattern.md) |
| `checklist.step6.dto.validation-missing` | DTO에 `class-validator` 데코레이터 부재 | `checklist.md` STEP 6 · [conventions.md](./conventions.md) |
| `checklist.step7.module-placement` | 모듈 파일이 도메인 루트가 아닌 레이어 하위에 위치 | [directory-structure.md](./architecture/directory-structure.md) |
| `checklist.step8.entity-placement` | `*.entity.ts`가 infrastructure/ 외부 위치 | [directory-structure.md](./architecture/directory-structure.md) · [database-queries.md](./architecture/database-queries.md) |

## checklist — 기타

| ruleId | 의미 | 참고 |
|--------|------|------|
| `checklist.step12.typeorm-synchronize-unconditional` | TypeORM `synchronize: true`가 조건 없이 설정됨 (운영 사고 위험) | [config.md](./architecture/config.md) · [database-queries.md](./architecture/database-queries.md) |
| `checklist.step13.no-hardcoded-secret` | 비밀값 하드코딩 의심 | [secret-manager.md](./architecture/secret-manager.md) · `checklist.md` STEP 13 |
| `checklist.step14.no-todo` | TODO 주석 잔존 | `checklist.md` STEP 14 |
| `checklist.step14.avoid-relative-imports` | `../` 상대경로 import 과다 | [conventions.md](./conventions.md) · `checklist.md` STEP 10 |
| `checklist.step15.tests.missing` | test/ 디렉토리 또는 `*.spec.ts` 없음 | [testing.md](./architecture/testing.md) |

## task-queue — Task Controller / 프레임워크 룰

| ruleId | 의미 | 참고 |
|--------|------|------|
| `task-queue.controller.layer` | Task Controller가 Interface 레이어 외에 위치 | [scheduling.md](./architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어) |
| `task-queue.controller.file-suffix` | Task Controller 파일명이 `*-task-controller.ts` 아님 | [scheduling.md](./architecture/scheduling.md#레이어-배치) · [directory-structure.md](./architecture/directory-structure.md) |
| `task-queue.controller.no-datasource` | Task Controller가 `DataSource` 직접 주입 | [scheduling.md](./architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어) |
| `task-queue.controller.no-repository` | Task Controller가 `Repository<Entity>` 직접 주입 | [scheduling.md](./architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어) |
| `task-queue.controller.no-http-error-response` | Task Controller가 `generateErrorResponse(...)` 사용 (예외는 throw로 위임해야 함) | [scheduling.md](./architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어) |
| `task-queue.controller.command-service-injection` | Task Controller에 CommandService 주입 부재 | [scheduling.md](./architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어) |
| `task-queue.controller.double-ledger-check` | TaskExecutionLog 주입 + idempotencyKey 옵션 동시 사용 (이중 ledger) | [scheduling.md](./architecture/scheduling.md#멱등성) |
| `task-queue.task-type.unique` | `taskType` 문자열이 여러 곳에서 중복 등록됨 | [scheduling.md](./architecture/scheduling.md#taskconsumer-데코레이터) |
| `task-queue.app-module.schedule-module` | `@Cron` 사용되는데 AppModule에 `ScheduleModule.forRoot()` 없음 | [scheduling.md](./architecture/scheduling.md#appmodule-설정) · [bootstrap.md](./architecture/bootstrap.md) |
| `task-queue.app-module.task-queue-module` | `@TaskConsumer` 사용되는데 AppModule에 `TaskQueueModule` import 없음 | [scheduling.md](./architecture/scheduling.md#appmodule-설정) |

## scheduler — @Cron 룰

| ruleId | 의미 | 참고 |
|--------|------|------|
| `scheduler.layer` | Scheduler가 infrastructure/ 외 레이어에 위치 | [scheduling.md](./architecture/scheduling.md#scheduler--cron--taskqueue) · [directory-structure.md](./architecture/directory-structure.md) |
| `scheduler.file-suffix` | `@Cron` 파일이 `*-scheduler.ts`가 아님 | [scheduling.md](./architecture/scheduling.md#scheduler--cron--taskqueue) |
| `scheduler.cron.try-catch` | `@Cron` 메서드에 try-catch(또는 runSafely) 부재 | [scheduling.md](./architecture/scheduling.md#scheduler--cron--taskqueue) |
| `scheduler.no-repository-injection` | Scheduler가 `Repository<Entity>` 주입 | [scheduling.md](./architecture/scheduling.md#scheduler--cron--taskqueue) |
| `scheduler.no-datasource-injection` | Scheduler가 `DataSource` 주입 | 동일 |
| `scheduler.no-command-service-injection` | Scheduler가 `CommandService` 주입 (비즈니스 실행 Task Controller 담당) | 동일 |

## deprecated-api

| ruleId | 의미 | 참고 |
|--------|------|------|
| `deprecated-api.missing-decorator` | `deprecated`/`legacy` 경로인데 `@ApiOperation({ deprecated: true })` 누락 | [conventions.md](./conventions.md) (Deprecated 엔드포인트 섹션) · [module-pattern.md](./architecture/module-pattern.md) |
| `deprecated-api.missing-warn-log` | Deprecated 엔드포인트에 `logger.warn` 흔적 없음 | [logging.md](./architecture/logging.md) · [conventions.md](./conventions.md) |

## domain-event-outbox — Domain Event / Outbox 연동

| ruleId | 의미 | 참고 |
|--------|------|------|
| `domain-event-outbox.module-missing` | Aggregate가 이벤트 발행하는데 `src/outbox/` 없음 | [domain-events.md](./architecture/domain-events.md) |
| `domain-event-outbox.repository-does-not-persist-events` | Repository 구현체가 `OutboxWriter`/outbox saveAll 사용 않음 | [domain-events.md](./architecture/domain-events.md) |
| `domain-event-outbox.repository-impl-missing` | Domain Event 발행되는데 Repository 구현체(`-repository-impl.ts`) 부재 | [domain-events.md](./architecture/domain-events.md) · [repository-pattern.md](./architecture/repository-pattern.md) |
| `domain-event-outbox.clear-events-missing` | Repository에서 `clearEvents()` 호출 흔적 없음 (이벤트 중복 발행 우려) | [domain-events.md](./architecture/domain-events.md) |

## build / test-run / AST

| ruleId | 의미 | 참고 |
|--------|------|------|
| `build.tsc.error` | `tsc --noEmit` 실패 (TypeScript 컴파일 에러) | [conventions.md](./conventions.md) · [testing.md](./architecture/testing.md) |
| `test-run.failure` | `npm test` 실패 | [testing.md](./architecture/testing.md) |
| `test-run.skipped` | `HARNESS_ENABLE_TEST_RUN=1`이 설정되지 않아 건너뜀 (informational) | [harness/README.md](../harness/README.md) |
| `ast.module.providers-missing` | `@Module()`에 `providers` 배열 없음 | [module-pattern.md](./architecture/module-pattern.md) |

## meta

| ruleId | 의미 | 참고 |
|--------|------|------|
| `checklist.meta.coverage` | `docs/checklist.md` 파싱 통계 (informational) | — |
| `checklist.meta.doc-missing` | `docs/checklist.md`를 찾지 못함 | — |

---

## 활용

**에이전트가 하네스 실패를 받은 경우:**
1. `failures[].ruleId` 복사
2. 이 문서에서 해당 행의 "참고" 열 링크로 점프
3. 문서 → 수정 → 재평가

**규칙 추가 시:** `harness/evaluators/rules/<name>.evaluator.ts`에 룰을 추가하면 이 표에도 한 줄 추가한다. 규약은 [harness/CONTRIBUTING.md](../harness/CONTRIBUTING.md)를 참조.
