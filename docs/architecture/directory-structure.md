# 디렉토리 구조

```
src/
  common/                              # 공용 유틸
    is-unique-violation.ts             # Postgres unique_violation(23505) 판별
  database/                            # 데이터베이스 모듈
    database-module.ts
    base.entity.ts                     # 공통 컬럼 (createdAt, updatedAt, deletedAt)
    data-source.ts                     # TypeORM DataSource 설정
    transaction-manager.ts             # 트랜잭션 매니저 (AsyncLocalStorage 기반)
  outbox/                              # Outbox 모듈
    outbox-module.ts
    outbox.entity.ts                   # Outbox 테이블 Entity
    outbox-writer.ts                   # 트랜잭션 안에서 이벤트 저장 (Repository에서 호출)
    outbox-relay.ts                    # Outbox → SQS 전송 (폴링)
    event-consumer.ts                  # SQS → EventHandler 수신 (폴링)
    event-handler-registry.ts          # eventType → Handler 라우팅
  task-queue/                          # Task Queue 모듈 (공용)
    task-queue-module.ts
    task-queue.ts                      # 인터페이스 (abstract class)
    task-queue-outbox.ts               # Outbox 기반 구현체 (task_outbox에 write)
    task-outbox.entity.ts              # task_outbox 테이블 Entity
    task-outbox-relay.ts               # task_outbox → SQS 발행 (Cron)
    task-execution-log.ts              # TaskExecutionLog 인터페이스 (abstract class)
    task-execution-log-db.ts           # DB 기반 구현체
    task-execution-log.entity.ts       # task_execution_log 테이블 Entity (멱등성 ledger)
    task-execution-log-cleaner.ts      # ledger cleanup (Cron)
    task-consumer.decorator.ts         # @TaskConsumer 데코레이터 (heartbeat 옵션 포함)
    task-consumer-registry.ts          # taskType → Handler 라우팅
    task-queue-consumer.ts             # SQS → Task Controller 디스패치 (폴링)
  config/
    <concern>.config.ts              # 관심사별 설정 팩토리 (database, jwt 등)
    config-validator.ts              # 환경 변수 검증
  <domain>/
    domain/                          # 도메인 레이어
      <aggregate-root>.ts
      <entity>.ts
      <value-object>.ts
      <domain-event>.ts
      <aggregate>-repository.ts      # Repository 인터페이스 (abstract class)
    application/
      adapter/
        <external-domain>-adapter.ts    # 외부 도메인 호출 인터페이스 (abstract class)
      service/
        <concern>-service.ts            # 기술 인프라 인터페이스 (abstract class)
      command/
        <domain>-command-service.ts     # Command Service (쓰기 — Repository 사용)
        <verb>-<noun>-command.ts
      query/
        <domain>-query-service.ts       # Query Service (읽기 — Query 인터페이스 사용)
        <domain>-query.ts               # Query 인터페이스 (abstract class)
        <verb>-<noun>-query.ts
        <verb>-<noun>-result.ts
    interface/
      <domain>-controller.ts              # HTTP Controller
      <domain>-task-controller.ts         # Task Controller (@TaskConsumer 메서드 보유)
      dto/
        <verb>-<noun>-request-body.ts     # 요청 DTO
        <verb>-<noun>-request-param.ts
        <verb>-<noun>-request-querystring.ts
        <verb>-<noun>-response-body.ts    # 응답 DTO
    infrastructure/
      <aggregate>-repository-impl.ts    # Repository 구현체
      <domain>-query-impl.ts            # Query 구현체 (읽기 전용 DB 접근)
      <external-domain>-adapter-impl.ts # 외부 도메인 Adapter 구현체
      <concern>-service-impl.ts         # 기술 인프라 Service 구현체
      <concern>-scheduler.ts            # Scheduler (@Cron → TaskQueue.enqueue)
    <domain>-module.ts
    <domain>-error-message.ts
    <domain>-enum.ts
    <domain>-constant.ts
```
