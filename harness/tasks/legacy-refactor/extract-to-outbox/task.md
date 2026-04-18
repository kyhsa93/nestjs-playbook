# Task: Application 레이어의 SQS 직접 호출을 TaskQueue Outbox 경로로 전환

레거시 코드에서 Application Service(Command Service)가 **SQS `SendMessageCommand`를 직접 호출**하며 비동기 작업을 트리거하고 있다. 이 구조는 Command 트랜잭션과 SQS 발행 사이에 dual-write 문제를 유발한다(DB commit 실패 시 이미 전송된 메시지가 남거나, SQS 전송 실패 시 DB만 커밋되고 Task는 소실).

가이드: [docs/architecture/scheduling.md](../../../../docs/architecture/scheduling.md)의 **5단계 `TaskQueue` — Outbox 기반 구현**과 **Ad-hoc Task 적재 (트랜잭션 안에서)** 섹션.

## 목표

SQS 직접 호출을 **`TaskQueue.enqueue` + `task_outbox` + `TaskOutboxRelay`** 경로로 리팩토링하여 원자성을 확보하고, Task 소비를 **Task Controller**로 이관한다.

## 요구사항

1. Application Service의 `@aws-sdk/client-sqs` import를 제거한다. Application은 `TaskQueue` **abstract class**에만 의존하도록 수정.
2. 적재 호출을 `transactionManager.run(async () => { repo.save(...); taskQueue.enqueue(...) })` 형태로 묶어 DB 변경과 Task 적재를 원자적으로 만든다.
3. 기존 SQS 수신 처리 코드(핸들러/폴링)는 `src/<domain>/interface/<domain>-task-controller.ts`로 이동하고 `@TaskConsumer('<taskType>')` 데코레이터로 구독한다.
4. Task Controller에서 `.catch + generateErrorResponse` 패턴이 있다면 제거하고 예외를 그대로 throw한다.
5. 엔티티 단위 멱등성이 필요한 Task는 `@TaskConsumer(..., { idempotencyKey: (payload) => ... })` 옵션을 지정한다.
6. `AppModule`에 `ScheduleModule.forRoot()`·`TaskQueueModule`이 포함되어 있는지 확인한다(없으면 추가).

## 제약

- 기존 도메인 로직(Aggregate/Repository/Command Service)은 시그니처를 유지한다. 내부 구현만 수정.
- Application 레이어에 `SQSClient`·`SendMessageCommand` 등 `@aws-sdk/client-sqs` symbol이 남아있지 않아야 한다.
- Task Controller는 `CommandService`만 주입받는다.
- 모든 기존 테스트가 통과해야 한다(또는 신규 어댑터 변경에 맞게 업데이트).

## 평가 포인트

- Application에서 AWS SDK import 제거 완료 여부
- `TaskQueue` abstract class 주입 사용
- 트랜잭션 내 `enqueue` 호출
- Task Controller의 올바른 위치(`interface/`), 주입 구성, 에러 처리
- `taskType` 전역 유일성
- Scheduler가 존재한다면 try-catch + logger.error 포함
- 테스트 유지
