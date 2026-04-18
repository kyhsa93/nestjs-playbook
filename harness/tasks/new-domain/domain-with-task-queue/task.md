# Task: Task Queue가 포함된 도메인 모듈 구현

NestJS + TypeScript 기반 서버에서 **비동기 Task(Cron + ad-hoc)가 필요한 bounded context 하나**를 구현하라.

가이드: [docs/architecture/scheduling.md](../../../../docs/architecture/scheduling.md)

## 목표

기본 4레이어 구조를 따르면서, Scheduler + Task Controller를 Task Queue 프레임워크 규약에 맞게 구현한다.

## 요구사항

- 하나의 aggregate root를 가진 도메인 모듈을 구현한다.
- 생성·수정 Command 흐름 1개, 조회 Query 흐름 1개를 제공한다.
- Cron으로 주기적 배치 실행이 필요한 Task 1개를 `Scheduler` → `TaskQueue.enqueue` → `TaskController` 경로로 구성한다.
- 엔티티 단위 중복 실행 방어가 필요한 Task 1개를 `@TaskConsumer`의 `idempotencyKey` 옵션으로 구성한다.
- `AppModule`에 `ScheduleModule.forRoot()`와 `TaskQueueModule`을 import한다.

## 제약

- 4레이어 구조(Domain / Application / Interface / Infrastructure).
- **Task Controller는 `interface/` 레이어에 배치**하고 `<domain>-task-controller.ts`로 명명한다.
- **Scheduler는 `infrastructure/` 레이어에 배치**하고 `<concern>-scheduler.ts`로 명명한다.
- Task Controller는 `CommandService`만 주입받는다. `DataSource`·`Repository<Entity>`·`TaskExecutionLog` 직접 주입 금지(idempotencyKey 옵션으로 프레임워크에 위임).
- Task Controller는 예외를 그대로 throw한다. HTTP Controller의 `.catch + generateErrorResponse` 패턴 금지.
- Scheduler는 `TaskQueue.enqueue`만 호출하고 비즈니스 로직을 직접 실행하지 않는다. 각 `@Cron` 메서드는 try-catch + `logger.error`로 실패를 로깅한다.
- `taskType` 문자열은 전역 유일해야 한다(중복 `@TaskConsumer` 등록 금지).
- Domain은 프레임워크 무의존.

## 평가 포인트

- 4레이어 구조 준수
- Repository abstract class 패턴
- Command/Query 분리
- Task Controller의 위치·주입·에러 처리
- Scheduler의 위치·책임 분리·try-catch
- AppModule 부트스트랩 바인딩
- taskType 전역 유일성
