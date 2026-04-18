# Scheduling / Batch 작업

> **이 문서 성격**: 여기 기술한 `@TaskConsumer` + `TaskQueue` + `TaskOutbox` 전체 구조는 **한 가지 구현 예시**다. 본 가이드가 강제하는 유일한 방식이 아니며, 팀 상황에 따라 더 단순하게 시작해도 된다. 단순 `@Cron` 하나·단일 SQS consumer 한 개·외부 큐 서비스(BullMQ, SideKiq 등) 사용도 모두 유효한 선택지. 이 문서는 **대규모·다중 인스턴스·트랜잭션 정합성이 중요한 케이스의 참고 설계**로 읽는다.
>
> **최소 요구**는 다음 세 가지만:
> - Scheduler는 **Infrastructure 레이어**에 둔다 (`@Cron` 데코레이터 위치).
> - Task 핸들러(어떤 형태든)는 **멱등**하다.
> - SQS를 쓴다면 **FIFO + DLQ**를 기본으로 한다.
>
> 아래 상세 구조는 이 최소 요구 위에 쌓은 **완성된 구현 예시**로 참고한다.

주기적 작업과 배치 처리는 **AWS SQS 기반 Task Queue** 방식으로 구현한다. Scheduler가 Cron 주기로 SQS에 Task 메시지를 적재(produce)하고, **Task Controller의 메서드가 `@TaskConsumer` 데코레이터로 구독**하여 해당 Task가 도착하면 메서드가 실행되는 구조다. Task Controller는 Command Service를 주입받아 Task에 해당하는 Command를 실행한다.

```
[Scheduler/CommandService] --(DB insert)--> [task_outbox 테이블]
                                                  ↓ (Cron 폴링)
                                          [TaskOutboxRelay] --(SendMessage)--> [SQS]
                                                                                  ↓
                                                                        [TaskQueueConsumer]
                                                                                  ↓ taskType 라우팅
                                                          [TaskController.method @TaskConsumer('...')]
                                                                                  ↓
                                                                    [CommandService.xxxCommand(...)]
```

적재(enqueue)는 항상 **`task_outbox` 테이블에 row를 쓰는 것**으로 정의되며, `TaskOutboxRelay`가 짧은 주기로 폴링하여 SQS에 발행한다. 이 패턴으로 Command 트랜잭션과 Task 적재가 동일 트랜잭션으로 묶여 dual-write 문제가 제거된다 (Domain Event의 Outbox 패턴과 동일한 이유).

`@nestjs/schedule`의 `@Cron`을 Application Service에 직접 걸지 않는 이유는 다음과 같다.

- **다중 인스턴스 안전성**: SQS FIFO 큐의 `MessageDeduplicationId`로 같은 시점에 여러 인스턴스가 적재해도 5분 중복 제거 윈도우 내에서는 1건만 큐에 들어간다.
- **재시도 내장**: Consumer가 예외로 메시지를 삭제하지 않으면 `VisibilityTimeout` 경과 후 자동 재수신된다. `maxReceiveCount` 초과 시 DLQ로 이동한다.
- **관찰 가능성**: CloudWatch 지표(`ApproximateNumberOfMessages`, `ApproximateAgeOfOldestMessage`)와 DLQ로 상태를 추적한다.
- **백프레셔**: 작업량이 폭증해도 큐에 쌓여 Consumer 처리 속도에 맞춰 소비된다.

기존 Outbox → SQS 구조와 동일한 SDK/인프라를 재사용한다. [domain-events.md](./domain-events.md)의 `EventConsumer`/`EventHandlerRegistry` 패턴과 같은 결의 구조다.

## 목차

- [Task vs Domain Event](#task-vs-domain-event) — 언제 Task, 언제 Event를 쓸지
- [설치](#설치) · [AppModule 설정](#appmodule-설정) · [큐 구성](#큐-구성) · [레이어 배치](#레이어-배치)
- 구성 요소 (구현 순서):
  - [`@TaskConsumer` 데코레이터](#taskconsumer-데코레이터)
  - [`TaskConsumerRegistry` — 라우팅](#taskconsumerregistry--라우팅)
  - [`TaskQueueConsumer` — SQS 폴링](#taskqueueconsumer--sqs-폴링)
  - [`TaskController` — Command 실행 (Interface 레이어)](#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어)
  - [`TaskQueue` — Outbox 기반 구현](#taskqueue--outbox-기반-구현)
  - [Scheduler — Cron → TaskQueue](#scheduler--cron--taskqueue)
- [모듈 등록](#모듈-등록) · [Ad-hoc Task 적재](#ad-hoc-task-적재-트랜잭션-안에서)
- 운영 / 정책: [MessageGroupId 전략](#messagegroupid-전략) · [멱등성](#멱등성) · [payload 검증](#payload-검증) · [긴 Task와 VisibilityTimeout 하트비트](#긴-task와-visibilitytimeout-하트비트)
- [Graceful Shutdown](#graceful-shutdown) · [DLQ 모니터링](#dlq-모니터링) · [Testing](#testing) · [Interval / Timeout](#interval--timeout) · [원칙](#원칙)

## Task vs Domain Event

둘 다 SQS를 거치지만 **용도와 소비 모델이 다르다**. 혼동을 피하려면 아래 기준으로 선택한다.

| | **Task Queue** | **Domain Event** |
|---|---|---|
| 목적 | 필요에 따라 구현하여 사용하는 비동기 작업 (배치, Cron, 분리된 후속 처리) | Command 실행의 **결과(사실)** 를 수신하여 처리 |
| 의미 단위 | 명령(imperative): "X를 수행하라" | 사실(declarative past): "X가 일어났다" |
| 핸들러 수 | **1:1** — `taskType`당 정확히 하나의 Task Controller 메서드 | **1:N** — 하나의 이벤트를 여러 EventHandler가 fan-out 구독 |
| 생산자 | Scheduler (Cron) / Application Service가 `TaskQueue.enqueue` 호출 → `task_outbox` 저장 → `TaskOutboxRelay`가 SQS로 발행 | Aggregate가 `domainEvents`에 push → Repository가 `outbox` 테이블에 저장 → `OutboxRelay`가 SQS로 발행 |
| 예시 | "만료 주문 정리 배치 실행", "알림 재전송", "리포트 생성" | `OrderCancelled` 이벤트에 대해 환불·재고 복원·알림 발송 각 핸들러 구동 |
| 실패 처리 | visibility timeout 재시도 → DLQ | 동일 (각 핸들러 단위로) |
| 가이드 | 본 문서 | [domain-events.md](./domain-events.md) |

핵심 판단 기준: **"이건 Command의 결과를 관찰하는 것인가?"** 그렇다면 Domain Event. 그게 아니라 "이 작업을 비동기로 실행하고 싶다"면 Task.

## 설치

```bash
npm install @aws-sdk/client-sqs @nestjs/schedule
```

로컬에서는 LocalStack으로 SQS를 제공한다. 큐 생성 방법은 [local-dev.md](./local-dev.md)를 참고한다.

## AppModule 설정

`@Cron` 데코레이터가 동작하려면 `ScheduleModule.forRoot()`가 반드시 등록되어야 한다. `TaskQueueModule`은 `@Global()`이지만 활성화를 위해 AppModule의 `imports`에 한 번은 포함되어야 한다.

```typescript
// src/app-module.ts
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { OrderModule } from '@/order/order-module'
import { TaskQueueModule } from '@/task-queue/task-queue-module'

@Module({
  imports: [
    ScheduleModule.forRoot(),   // @Cron 활성화 — 없으면 Scheduler/Relay가 조용히 작동 안 함
    TaskQueueModule,            // @Global 이지만 imports 한 번은 필수
    OrderModule
  ]
})
export class AppModule {}
```

## 큐 구성

### 단일 Task 큐 정책

**모든 도메인의 Task는 하나의 SQS FIFO 큐를 공유한다.** 도메인별로 큐를 분리하지 않는다.

- **운영 단순화**: 큐/DLQ/알람 세트가 하나이므로 인프라·IaC·모니터링이 간결하다.
- **단일 DLQ 가시성**: 실패가 한 곳에 모여 추적과 redrive가 쉽다.
- **현재 규모의 격리 이점 미미**: 처리량이 수천 msg/s를 넘거나 특정 도메인 실패가 다른 도메인 처리를 차단하는 명확한 사례가 생기기 전에는 분리 이점보다 복잡도 비용이 크다.

라우팅은 큐가 아니라 **`taskType` 문자열**로 수행된다. 도메인별 Task Controller가 `@TaskConsumer('<domain>.<action>')` 네이밍으로 taskType을 선언하면 하나의 큐에서 자연스럽게 분기된다.

### 큐 타입

| 큐 타입 | 선택 기준 | 핵심 속성 |
|---------|----------|-----------|
| **FIFO (`*.fifo`)** — **기본** | 중복 적재 방지, 그룹 단위 순차성 보장 필요 (대부분의 경우) | `MessageGroupId`, `MessageDeduplicationId` |
| **Standard** | 극단적 고처리량(수천 msg/s)이 필요하고 순서·중복 제거를 앱 레벨에서 해결할 때 | at-least-once, 순서 무관 |

**DLQ는 필수.** `RedrivePolicy`의 `maxReceiveCount`를 초과한 메시지를 DLQ로 이동시켜 독성 메시지의 무한 재시도를 막는다.

```
SQS_TASK_QUEUE_URL=https://.../app-task.fifo
SQS_TASK_DLQ_URL=https://.../app-task-dlq.fifo
```

## 레이어 배치

**Task Controller는 Interface 레이어에 배치한다.** HTTP Controller와 동일하게 외부 입력(SQS 메시지)을 받아 Application Service에 위임하는 **입력 어댑터**이기 때문이다. REST 진입점이 `interface/`에 있는 것과 같은 이유로, 메시지 진입점도 `interface/`에 둔다.

공용 Task Queue 인프라(SQS 폴링/적재, 데코레이터, 레지스트리)는 도메인에 속하지 않으므로 top-level 공유 모듈에 둔다.

```
src/
  common/
    is-unique-violation.ts                   # Postgres unique 위반 판별 헬퍼
  task-queue/                                # 공유 Task Queue 인프라
    task-queue-module.ts                     # @Global 모듈
    task-queue.ts                            # TaskQueue 인터페이스 (abstract class)
    task-queue-outbox.ts                     # Outbox 기반 TaskQueue 구현체
    task-outbox.entity.ts                    # task_outbox 테이블 Entity
    task-outbox-relay.ts                     # task_outbox → SQS 발행 (Cron 폴링)
    task-execution-log.ts                    # TaskExecutionLog 인터페이스 (abstract)
    task-execution-log-db.ts                 # DB 기반 구현체
    task-execution-log.entity.ts             # task_execution_log 테이블 Entity
    task-execution-log-cleaner.ts            # ledger cleanup (Cron)
    task-consumer.decorator.ts               # @TaskConsumer 데코레이터
    task-consumer-registry.ts                # taskType → 핸들러 라우팅
    task-queue-consumer.ts                   # SQS 폴링 → registry.dispatch
  order/
    interface/
      order-controller.ts                    # HTTP 입력 어댑터
      order-task-controller.ts               # Task 입력 어댑터 — @TaskConsumer 메서드
    infrastructure/
      order-cleanup-scheduler.ts             # @Cron → TaskQueue.enqueue
    application/
      command/
        order-command-service.ts             # 비즈니스 로직 — TaskQueue 인터페이스만 주입
```

## `@TaskConsumer` 데코레이터

메서드에 Task 타입을 바인딩한다. 전역 Map에 핸들러를 등록해두고, 런타임에 `TaskConsumerRegistry`가 `taskType`으로 조회한다.

```typescript
// src/task-queue/task-consumer.decorator.ts
export type HeartbeatConfig = {
  intervalMs: number      // ChangeMessageVisibility 호출 주기
  extendSeconds: number   // 매 호출마다 연장할 시간
}

type HandlerEntry = {
  handlerClass: new (...args: unknown[]) => unknown
  method: string
  heartbeat?: HeartbeatConfig
  idempotencyKey?: (payload: any) => string
}

const TASK_HANDLER_MAP = new Map<string, HandlerEntry>()

export type TaskConsumerOptions = {
  heartbeat?: HeartbeatConfig
  idempotencyKey?: (payload: any) => string
}

export function TaskConsumer(taskType: string, options?: TaskConsumerOptions): MethodDecorator {
  return (target, propertyKey) => {
    if (TASK_HANDLER_MAP.has(taskType)) {
      throw new Error(`Duplicate @TaskConsumer for taskType: ${taskType}`)
    }
    TASK_HANDLER_MAP.set(taskType, {
      handlerClass: target.constructor as new (...args: unknown[]) => unknown,
      method: propertyKey as string,
      heartbeat: options?.heartbeat,
      idempotencyKey: options?.idempotencyKey
    })
  }
}

export function getTaskHandler(taskType: string): HandlerEntry | undefined {
  return TASK_HANDLER_MAP.get(taskType)
}
```

- **`heartbeat` 옵션(선택)**: 장기 Task에 한해 `{ intervalMs, extendSeconds }`를 지정하면 `TaskQueueConsumer`가 처리 중 주기적으로 `ChangeMessageVisibility`를 호출한다. 자세한 내용은 하단 [긴 Task와 VisibilityTimeout 하트비트](#긴-task와-visibilitytimeout-하트비트)를 참조한다.
- **`idempotencyKey` 옵션(선택)**: payload에서 고유 키를 뽑는 함수를 지정하면 `TaskConsumerRegistry`가 dispatch 전에 **`TaskExecutionLog`로 중복 실행을 프레임워크 레벨에서 차단**한다. Task Controller는 ledger 코드를 작성하지 않아도 된다. 자세한 내용은 [멱등성](#멱등성) 참조.
- **taskType은 전역 유일**: Task는 정확히 하나의 핸들러가 실행되어야 한다. 중복 등록은 부트스트랩 시점에 바로 실패시킨다.
- **등록 시점은 class 평가 시점(import 시점)**: 데코레이터는 파일이 import되어 class 본문이 평가될 때 `TASK_HANDLER_MAP`에 엔트리를 추가한다. 따라서 **Task Controller는 반드시 어떤 모듈의 `providers`에 등록되어야** 모듈 로딩 과정에서 파일이 import되어 데코레이터가 발화한다. providers에 없으면 class 파일 자체가 로드되지 않아 `TaskQueueConsumer`가 해당 `taskType`을 찾지 못한다.

## `TaskConsumerRegistry` — 라우팅

`taskType`에 매핑된 Task Controller의 메서드를 찾아 호출한다.

```typescript
// src/task-queue/task-consumer-registry.ts
import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'

import { HeartbeatConfig, getTaskHandler } from './task-consumer.decorator'
import { TaskExecutionLog } from './task-execution-log'

@Injectable()
export class TaskConsumerRegistry {
  private readonly logger = new Logger(TaskConsumerRegistry.name)

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly executionLog: TaskExecutionLog
  ) {}

  public getHeartbeat(taskType: string): HeartbeatConfig | undefined {
    return getTaskHandler(taskType)?.heartbeat
  }

  public async dispatch(taskType: string, payload: object): Promise<void> {
    const entry = getTaskHandler(taskType)
    if (!entry) {
      throw new Error(`No @TaskConsumer registered for taskType: ${taskType}`)
    }

    // 프레임워크 레벨 멱등성 (idempotencyKey 옵션이 있을 때만)
    if (entry.idempotencyKey) {
      const key = entry.idempotencyKey(payload)
      const result = await this.executionLog.recordOnce(key, taskType)
      if (result === 'already-executed') {
        this.logger.log({
          message: '중복 수신 — ledger에 이미 기록, 스킵',
          task_type: taskType,
          idempotency_key: key
        })
        return   // 정상 반환 → Consumer가 메시지 삭제
      }
    }

    const handler = this.moduleRef.get(entry.handlerClass, { strict: false })
    await (handler as Record<string, (p: object) => Promise<void>>)[entry.method](payload)
  }
}
```

- **ledger 기록은 dispatch 직전(record-before-execute)**: idempotencyKey가 지정된 Task는 **핸들러 호출 전에** ledger에 insert 시도. 이후 핸들러가 실패해도 ledger는 남으므로, 재시도 시 `already-executed`로 스킵된다. 핸들러 성공/실패와 ledger의 원자성이 필요하면 [강한 원자성 (Level 3)](#강한-원자성-level-3--드문-케이스)을 참조.
- **ledger 사용이 불필요한 Task**: 본질적으로 멱등한 Task(예: `cleanup-expired` 배치는 "만료 상태만 archive"이므로 여러 번 실행해도 결과 동일)는 `idempotencyKey`를 지정하지 않는다. Ledger 테이블 비용을 아낀다.

## `TaskQueueConsumer` — SQS 폴링

SQS에서 메시지를 수신하고 `TaskConsumerRegistry`에 위임한다. 도메인 지식이 없는 공용 Infrastructure 컴포넌트다.

```typescript
// src/task-queue/task-queue-consumer.ts
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common'
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient
} from '@aws-sdk/client-sqs'

import { HeartbeatConfig } from './task-consumer.decorator'
import { TaskConsumerRegistry } from './task-consumer-registry'

@Injectable()
export class TaskQueueConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TaskQueueConsumer.name)
  private readonly sqs = new SQSClient({
    ...(process.env.AWS_ENDPOINT ? { endpoint: process.env.AWS_ENDPOINT } : {})
  })
  private readonly queueUrl = process.env.SQS_TASK_QUEUE_URL!
  private running = true
  private pollPromise: Promise<void> = Promise.resolve()

  constructor(private readonly registry: TaskConsumerRegistry) {}

  public onModuleInit(): void {
    this.pollPromise = this.poll()
  }

  public async onApplicationShutdown(): Promise<void> {
    this.running = false
    await this.pollPromise  // in-flight Task 처리 완료까지 대기
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.sqs.send(new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,  // 배치 수신으로 처리량 향상 (최대 10)
          WaitTimeSeconds: 20,      // long polling — SQS API 호출 비용 절감
          VisibilityTimeout: 300    // 가장 긴 Task의 최대 처리 시간보다 넉넉히
        }))

        for (const message of result.Messages ?? []) {
          const messageId = message.MessageId
          try {
            const { taskType, payload } = JSON.parse(message.Body ?? '{}')
            this.logger.log({ message: 'Task 시작', message_id: messageId, task_type: taskType })

            const heartbeat = this.registry.getHeartbeat(taskType)
            const run = (): Promise<void> => this.registry.dispatch(taskType, payload ?? {})

            if (heartbeat) {
              await this.withHeartbeat(message.ReceiptHandle!, heartbeat, run)
            } else {
              await run()
            }

            await this.sqs.send(new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle!
            }))
            this.logger.log({ message: 'Task 완료', message_id: messageId, task_type: taskType })
          } catch (error) {
            this.logger.error({
              message: 'Task 실패 — visibility timeout 경과 후 재수신',
              message_id: messageId,
              error
            })
            // 삭제하지 않음 → 재수신, maxReceiveCount 초과 시 DLQ
          }
        }
      } catch (error) {
        this.logger.error({ message: 'SQS 수신 실패', error })
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
  }

  private async withHeartbeat(
    receiptHandle: string,
    config: HeartbeatConfig,
    task: () => Promise<void>
  ): Promise<void> {
    const timer = setInterval(() => {
      void this.sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: config.extendSeconds
      })).catch((error) => this.logger.warn({ message: '하트비트 실패', error }))
    }, config.intervalMs)

    try {
      await task()
    } finally {
      clearInterval(timer)
    }
  }
}
```

- **메시지 삭제는 성공 시에만**: 예외가 발생하면 삭제하지 않아 visibility timeout 경과 후 자동 재수신 → `maxReceiveCount` 초과 시 DLQ로 이동한다.
- **Graceful Shutdown은 `pollPromise`를 await**: `onApplicationShutdown`이 루프 종료를 대기하지 않으면 NestJS가 앱을 종료시켜 in-flight Task가 중간에 끊긴다. 위 구현처럼 `pollPromise`를 저장하고 shutdown에서 await해야 한다. 종료 지연이 염려되면 장기 Task는 하단 [긴 Task와 VisibilityTimeout 하트비트](#긴-task와-visibilitytimeout-하트비트) 패턴을 적용한다.
- **`MaxNumberOfMessages`는 10까지 배치 수신 가능**: 1로 두면 메시지당 왕복 1회라 처리량이 낮다. 병렬성은 인스턴스 수 × batch 크기로 조절한다.
- `VisibilityTimeout`은 가장 긴 Task의 최대 처리 시간보다 넉넉히 설정한다.
- **Task Controller는 NestJS 기본 Singleton 스코프**: 현재 Consumer 구현은 배치 내 메시지를 `for` 루프로 순차 처리하므로 동일 Task Controller 인스턴스가 한 번에 하나의 메시지만 다룬다. 향후 병렬 dispatch로 전환할 경우를 대비해 **Task Controller 메서드에 공유 가변 상태(instance field 누적, static 변수 등)를 두지 않는다**. HTTP Controller의 stateless 원칙과 동일.

## `TaskController` — `@TaskConsumer` 메서드로 Command 실행 (Interface 레이어)

**Task Controller는 Interface 레이어의 입력 어댑터**다. HTTP Controller가 `@Get`/`@Post`로 HTTP 진입점을 선언하듯, Task Controller는 `@TaskConsumer('taskType')`로 Task 진입점을 선언한다. CommandService를 주입받아 Task에 해당하는 Command를 실행한다.

```typescript
// src/order/interface/order-task-controller.ts
import { Injectable, Logger } from '@nestjs/common'

import { ArchiveOrderCommand } from '@/order/application/command/archive-order-command'
import { OrderCommandService } from '@/order/application/command/order-command-service'
import { TaskConsumer } from '@/task-queue/task-consumer.decorator'

@Injectable()
export class OrderTaskController {
  private readonly logger = new Logger(OrderTaskController.name)

  constructor(private readonly orderCommandService: OrderCommandService) {}

  // 본질적으로 멱등한 Task — idempotencyKey 불필요
  @TaskConsumer('order.cleanup-expired')
  public async cleanupExpired(): Promise<void> {
    const count = await this.orderCommandService.cleanupExpiredOrders()
    this.logger.log({ message: '만료 주문 정리', cleaned_count: count })
  }

  // 엔티티 단위 중복 실행 방어가 필요한 Task — idempotencyKey 지정
  @TaskConsumer('order.archive', {
    idempotencyKey: (payload: ArchiveOrderCommand) => `order.archive-${payload.orderId}`
  })
  public async archive(payload: ArchiveOrderCommand): Promise<void> {
    await this.orderCommandService.archiveOrder(payload)
  }
}
```

- **로직 없이 Command 위임**: Task Controller는 `CommandService`의 Command 메서드를 호출할 뿐이다. 조건 분기나 비즈니스 규칙을 넣지 않는다. HTTP Controller와 동일한 역할.
- **멱등성은 데코레이터 옵션으로**: Task Controller 안에서 ledger 코드를 직접 쓰지 않는다. `@TaskConsumer`의 `idempotencyKey` 옵션을 지정하면 `TaskConsumerRegistry`가 dispatch 전에 `TaskExecutionLog`로 중복을 차단한다.
- **DB 직접 주입 금지**: Task Controller에 `DataSource`/`Repository<Entity>`를 주입하지 않는다. Interface 레이어는 CommandService만 의존한다. 공용 관심사(ledger, heartbeat)는 task-queue 프레임워크가 처리한다.
- **payload 타입은 메서드 시그니처에 명시**: 호출 계약을 명확히 한다. 필요 시 class-validator로 런타임 검증을 추가한다. (하단 [payload 검증](#payload-검증) 참조)
- **Interface DTO 규칙 적용**: payload 타입을 Application의 Command 클래스로 그대로 쓰거나, 필요 시 Interface DTO로 `extends`하여 thin wrapper로 둔다. (HTTP RequestBody와 동일한 방식 — [layer-architecture.md](./layer-architecture.md#interface-dto) 참조)
- **에러 처리는 HTTP Controller와 다름**: HTTP Controller의 `.catch(error => { logger.error; throw generateErrorResponse(...) })` 패턴을 쓰지 **않는다**. Task Controller는 **예외를 그대로 위로 던진다** — `TaskQueueConsumer`가 catch하여 메시지를 삭제하지 않고, visibility timeout 후 재수신/재시도 → DLQ 경로를 밟는다. `.catch`로 감싸면 예외가 삼켜져 메시지가 정상 삭제되고 실패가 소실된다.

```typescript
// ❌ HTTP Controller 패턴을 흉내내면 안 됨 — 실패가 소실됨
@TaskConsumer('order.notify')
public async notify(payload: NotifyOrderCommand): Promise<void> {
  return this.orderCommandService.notify(payload).catch((error) => {
    this.logger.error(error)
    throw generateErrorResponse(...)   // HttpException — Task 문맥에서는 무의미
  })
}

// ✅ 그냥 호출하고 예외는 위로 — TaskQueueConsumer가 처리
@TaskConsumer('order.notify')
public async notify(payload: NotifyOrderCommand): Promise<void> {
  await this.orderCommandService.notify(payload)
}
```

## `TaskQueue` — Outbox 기반 구현

### 왜 Outbox인가

Command Service에서 DB 변경과 Task 적재가 **원자적으로 묶여야 한다**. SQS `SendMessage`를 Command 트랜잭션 안에서 직접 호출하면 dual-write 문제가 발생한다 — SQS 전송은 성공했는데 DB는 롤백되거나, DB는 commit됐는데 SQS 전송이 실패하는 불일치 상태. Domain Event가 Outbox 테이블을 경유하는 것과 동일한 이유로, **Task도 `task_outbox` 테이블 write → `TaskOutboxRelay` 발행** 경로로 통일한다.

Scheduler(Cron) 역시 같은 경로를 쓴다. Cron 시점의 enqueue는 트랜잭션 문맥이 아니지만, 단일 row insert이므로 자연스럽게 atomic이며 경로가 통일되어 운영이 단순해진다.

### `TaskQueue` 인터페이스

```typescript
// src/task-queue/task-queue.ts
export type EnqueueOptions = {
  groupId: string
  deduplicationId: string
  delaySeconds?: number  // 최대 900초 지연 가능
}

export abstract class TaskQueue {
  abstract enqueue(taskType: string, payload: object, options: EnqueueOptions): Promise<void>
}
```

### `task_outbox` Entity

```typescript
// src/task-queue/task-outbox.entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

import { BaseEntity } from '@/database/base.entity'

@Entity('task_outbox')
@Index(['processed', 'createdAt'])
export class TaskOutboxEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  taskId: string

  @Column()
  taskType: string

  @Column('jsonb')
  payload: object

  @Column()
  groupId: string

  @Column()
  deduplicationId: string

  @Column('int', { nullable: true })
  delaySeconds: number | null

  @Column({ default: false })
  processed: boolean
}
```

### Outbox 기반 `TaskQueue` 구현체

`TransactionManager`를 주입받아 현재 트랜잭션 문맥에 참여한다. 트랜잭션 외부에서 호출되면(예: Scheduler) 기본 EntityManager로 단일 row insert된다.

```typescript
// src/task-queue/task-queue-outbox.ts
import { Injectable } from '@nestjs/common'

import { TransactionManager } from '@/database/transaction-manager'

import { EnqueueOptions, TaskQueue } from './task-queue'
import { TaskOutboxEntity } from './task-outbox.entity'

@Injectable()
export class TaskQueueOutbox extends TaskQueue {
  constructor(private readonly transactionManager: TransactionManager) {
    super()
  }

  public async enqueue(taskType: string, payload: object, options: EnqueueOptions): Promise<void> {
    const manager = this.transactionManager.getManager()
    await manager.save(TaskOutboxEntity, {
      taskType,
      payload,
      groupId: options.groupId,
      deduplicationId: options.deduplicationId,
      delaySeconds: options.delaySeconds ?? null,
      processed: false
    })
  }
}
```

### `TaskOutboxRelay` — Outbox → SQS 발행

짧은 주기로 `task_outbox`를 폴링하여 미발행 row를 SQS에 보낸다. Domain Event의 `OutboxRelay`와 같은 패턴이다.

```typescript
// src/task-queue/task-outbox-relay.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { DataSource, LessThan } from 'typeorm'

import { TaskOutboxEntity } from './task-outbox.entity'

@Injectable()
export class TaskOutboxRelay {
  private readonly logger = new Logger(TaskOutboxRelay.name)
  private readonly sqs = new SQSClient({
    ...(process.env.AWS_ENDPOINT ? { endpoint: process.env.AWS_ENDPOINT } : {})
  })
  private readonly queueUrl = process.env.SQS_TASK_QUEUE_URL!

  constructor(private readonly dataSource: DataSource) {}

  @Cron('*/3 * * * * *')  // 3초 폴링
  public async relay(): Promise<void> {
    const repo = this.dataSource.getRepository(TaskOutboxEntity)
    const rows = await repo.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 100
    })

    for (const row of rows) {
      try {
        await this.sqs.send(new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({ taskType: row.taskType, payload: row.payload }),
          MessageGroupId: row.groupId,
          MessageDeduplicationId: row.deduplicationId,
          ...(row.delaySeconds !== null ? { DelaySeconds: row.delaySeconds } : {})
        }))
        await repo.update({ taskId: row.taskId }, { processed: true })
      } catch (error) {
        this.logger.error({ message: 'SQS 발행 실패', task_id: row.taskId, error })
      }
    }
  }

  @Cron('0 3 * * *')  // 매일 03:00 — 발행 완료된 row 정리
  public async cleanup(): Promise<void> {
    const repo = this.dataSource.getRepository(TaskOutboxEntity)
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    await repo.delete({ processed: true, createdAt: LessThan(threshold) })
  }
}
```

- **다중 인스턴스 중복 적재**: Cron이 여러 인스턴스에서 동시에 발화해도 `deduplicationId`가 동일하면 SQS FIFO 5분 dedup 윈도우가 1건만 실제 큐에 들어가게 한다. `task_outbox`에는 여러 row가 생길 수 있으나, Relay가 각각 전송해도 SQS 레벨에서 걸러진다.
- **발행 실패는 다음 폴링에서 재시도**: `processed` 플래그가 flip되지 않았으므로 자연스럽게 재처리된다.

### Relay 다중 인스턴스 race — 한계와 완화

위 구현은 여러 앱 인스턴스가 Relay를 동시 실행할 때 **같은 row를 중복 가져가 각자 SQS에 보낸다**. 보통은 SQS FIFO의 5분 dedup 윈도우가 막아주지만, 다음 상황에서 윈도우를 초과해 중복 배달될 수 있다.

- Relay가 장애로 5분 이상 멈췄다가 복귀 (쌓인 row들을 일괄 전송 → 타이밍상 5분 윈도우 밖의 중복)
- 다른 instance에서 같은 `deduplicationId`로 오래 전 outbox row가 남아있다 늦게 발송

완화 전략 — 상황에 맞게 선택:

| 방법 | 설명 | 트레이드오프 |
|------|------|--------------|
| **Consumer 측 멱등성** (기본) | 최후 방어선. 상단 [멱등성](#멱등성) 섹션의 ledger 패턴을 모든 중요 Task에 적용 | 항상 필요 |
| **`SELECT ... FOR UPDATE SKIP LOCKED`** | Relay가 row를 원자적으로 claim — 동시 실행 시 한 인스턴스만 특정 row를 처리 | 코드 복잡도 소폭 증가 |
| **Leader election** | 단일 인스턴스에서만 Relay 실행 (예: Redis 분산 락) | SPOF 위험, 추가 인프라 |

**Consumer 멱등성은 협상 불가.** Relay에 lock을 걸어도 at-least-once 보장은 SQS의 본질이므로 Consumer는 항상 멱등해야 한다.

### `deduplicationId` UNIQUE 제약 — 선택지

`task_outbox.deduplicationId`에 DB UNIQUE 제약을 걸면 **다중 인스턴스의 outbox write가 write-time에 1건만 성공**한다(나머지는 unique violation → 무시). `task_outbox` row 폭증을 DB 레벨에서 차단.

**단점**: 한번 쓴 `deduplicationId`를 **영구히 재사용 불가**. 예를 들어 `order.archive-<orderId>` 같은 엔티티 기반 dedupId를 나중에 의도적으로 재실행해야 한다면 막힌다. 날짜 단위(`cleanup-2026-04-18`) 같은 시간 기반은 자연 유일하므로 안전.

→ **기본은 UNIQUE 제약 없이 운영**하고(SQS dedup에 위임), 특정 taskType만 날짜 기반 dedupId를 쓰는 것이 확실하다면 부분 UNIQUE 인덱스(`WHERE task_type = 'xxx'`)로 좁게 적용한다.

DI 바인딩은 [모듈 등록](#모듈-등록) 섹션에서 `{ provide: TaskQueue, useClass: TaskQueueOutbox }`로 수행한다.

## Scheduler — Cron → TaskQueue

`@Cron` 핸들러는 `TaskQueue.enqueue`만 호출한다. 비즈니스 로직을 직접 실행하지 않는다.

```typescript
// src/order/infrastructure/order-cleanup-scheduler.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

import { TaskQueue } from '@/task-queue/task-queue'

@Injectable()
export class OrderCleanupScheduler {
  private readonly logger = new Logger(OrderCleanupScheduler.name)

  constructor(private readonly taskQueue: TaskQueue) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async enqueueDailyCleanup(): Promise<void> {
    const dedupId = `order.cleanup-expired-${new Date().toISOString().slice(0, 10)}`
    try {
      await this.taskQueue.enqueue(
        'order.cleanup-expired',
        {},
        { groupId: 'order.cleanup', deduplicationId: dedupId }
      )
      this.logger.log({ message: '만료 주문 정리 Task 적재', dedup_id: dedupId })
    } catch (error) {
      // @nestjs/schedule은 Cron 핸들러의 예외를 조용히 삼키므로 명시적으로 로깅
      this.logger.error({ message: '만료 주문 정리 Task 적재 실패', dedup_id: dedupId, error })
    }
  }
}
```

- **`MessageDeduplicationId`를 날짜 단위로 고정**: 다중 인스턴스가 동일 Cron 타이밍에 적재해도 5분 중복 제거 윈도우에서 1건만 큐에 들어간다. Cron 중복 실행 해결의 핵심.
- **`@nestjs/schedule`의 예외 무음화**: Cron 핸들러 내부 예외는 로깅 없이 삼켜진다. try-catch + `logger.error`로 **명시적 가시성 확보** 필수.
- **다중 `@Cron` 메서드가 있는 Scheduler는 각 메서드마다 try-catch 반복**: 한 메서드의 예외가 다른 메서드에 영향을 주지는 않지만, 각 메서드의 실패 가시성을 보장하려면 모든 `@Cron` 메서드에 동일한 try-catch + logger.error 블록을 넣는다. 반복이 많으면 아래와 같은 private 헬퍼로 추출한다.

```typescript
// Scheduler 클래스 내부
private async runSafely(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    this.logger.error({ message: `Cron 실패: ${name}`, error })
  }
}

@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
public async enqueueDailyCleanup(): Promise<void> {
  await this.runSafely('order.cleanup-expired', async () => {
    const dedupId = `order.cleanup-expired-${new Date().toISOString().slice(0, 10)}`
    await this.taskQueue.enqueue(
      'order.cleanup-expired', {},
      { groupId: 'order.cleanup', deduplicationId: dedupId }
    )
  })
}
```
- **실패는 다음 Cron tick이 복구**: 날짜 기반 `deduplicationId`는 자연 유일하므로 실패 후 다음 tick에서 다시 적재되어도 `task_outbox`에 중복 row가 쌓이거나 SQS에 중복 배달되지 않는다. (DB 장애로 outbox write 자체가 실패하는 경우는 장애 해소 후 다음 tick까지 기다리거나 긴급 수동 트리거.)

## 모듈 등록

공유 Task Queue 모듈 하나와, 도메인 모듈에서 Task Controller를 등록한다.

```typescript
// src/task-queue/task-queue-module.ts
import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { TaskConsumerRegistry } from './task-consumer-registry'
import { TaskExecutionLog } from './task-execution-log'
import { TaskExecutionLogDb } from './task-execution-log-db'
import { TaskExecutionLogCleaner } from './task-execution-log-cleaner'
import { TaskExecutionLogEntity } from './task-execution-log.entity'
import { TaskOutboxEntity } from './task-outbox.entity'
import { TaskOutboxRelay } from './task-outbox-relay'
import { TaskQueue } from './task-queue'
import { TaskQueueConsumer } from './task-queue-consumer'
import { TaskQueueOutbox } from './task-queue-outbox'

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([TaskOutboxEntity, TaskExecutionLogEntity])],
  providers: [
    TaskConsumerRegistry,
    TaskQueueConsumer,
    TaskOutboxRelay,
    TaskExecutionLogCleaner,
    { provide: TaskQueue, useClass: TaskQueueOutbox },
    { provide: TaskExecutionLog, useClass: TaskExecutionLogDb }
  ],
  exports: [TaskQueue, TaskExecutionLog]
})
export class TaskQueueModule {}
```

```typescript
// src/order/order-module.ts
@Module({
  controllers: [OrderController],           // HTTP 진입점
  providers: [
    OrderCommandService,
    OrderTaskController,                    // Task 진입점 — providers로 등록
    OrderCleanupScheduler,                  // Cron으로 Task 적재
    { provide: OrderRepository, useClass: OrderRepositoryImpl }
  ]
})
export class OrderModule {}
```

- HTTP Controller는 `controllers`, Task Controller는 `providers`에 등록한다. NestJS의 `controllers` 배열은 라우트 매핑 대상이므로, SQS 기반 Task Controller는 `providers`로 등록해야 `ModuleRef.get()`이 인스턴스를 해결할 수 있다. 데코레이터가 Map에 메타데이터를 쌓아도 인스턴스가 DI 컨테이너에 없으면 실행되지 않는다.

## Ad-hoc Task 적재 (트랜잭션 안에서)

Application Service가 DB 변경과 함께 Task를 적재할 때는 **같은 트랜잭션 안에서** `taskQueue.enqueue`를 호출한다. Outbox 구현체(`TaskQueueOutbox`)는 `TransactionManager`의 현재 매니저를 사용하므로, Command의 DB 변경과 Task 적재가 동일 트랜잭션으로 묶인다. commit이 성공해야 `task_outbox` row도 남고, 롤백되면 함께 사라진다 — **dual-write 문제가 원천 차단**된다. 참여 메커니즘의 코드 레벨 설명은 [Outbox 기반 `TaskQueue` 구현체](#outbox-기반-taskqueue-구현체)를 참조한다.

```typescript
import { TaskQueue } from '@/task-queue/task-queue'  // abstract class

@Injectable()
export class OrderCommandService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly transactionManager: TransactionManager,
    private readonly taskQueue: TaskQueue
  ) {}

  public async cancelOrder(orderId: string): Promise<void> {
    const order = await this.orderRepository
      .findOrders({ orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(/* ... */)

    order.cancel('user request')

    // DB 변경 + Task 적재가 같은 트랜잭션 안에서 원자적으로 수행됨
    await this.transactionManager.run(async () => {
      await this.orderRepository.saveOrder(order)
      await this.taskQueue.enqueue(
        'order.archive',
        { orderId },
        { groupId: orderId, deduplicationId: `order.archive-${orderId}` }
      )
    })
  }
}
```

- **트랜잭션 외부에서 호출해도 안전**: Scheduler처럼 트랜잭션 문맥이 없는 곳에서 호출되면 단일 row insert로 동작한다. 경로가 통일되어 생산자는 문맥을 신경 쓰지 않는다.
- **실제 SQS 전송은 `TaskOutboxRelay`가 수행**: commit된 row를 3초 주기로 폴링해서 발행한다. Application은 발행 성공/실패를 몰라도 된다.

## MessageGroupId 전략

FIFO 큐에서 **같은 `MessageGroupId`를 가진 메시지는 엄격히 순차 처리**된다. 잘못 정하면 의도치 않은 직렬화로 처리량이 떨어지거나, 반대로 순서가 깨진다.

| 상황 | groupId 설정 |
|------|-------------|
| Cron 전역 배치 (일 1회 등) | Task 카테고리 기준: `'order.cleanup'` — 단일 인스턴스만 실행되면 됨 |
| Aggregate 단위 순차성 필요 | Aggregate ID: `orderId` — 같은 주문의 후속 Task는 순서대로 |
| 순서 무관 + 고처리량 | 랜덤 UUID 또는 `taskType`+random: 병렬성 극대화 |

**핵심 원칙**: groupId가 **병렬성의 경계**다. 같은 group은 직렬, 다른 group은 병렬. 필요한 최소 수준의 순차성만 groupId에 담는다.

## 멱등성

SQS는 **at-least-once delivery**를 보장하므로, `@TaskConsumer` 메서드가 호출하는 Command는 **반드시 멱등해야 한다**. 멱등성 확보 수단은 3단계로 구분한다.

> **참고**: 여기서 설명하는 3단계 모델(본질적 멱등성 / 프레임워크 ledger / 강한 원자성)은 Task뿐 아니라 **Domain Event의 EventHandler에도 동일하게 적용**된다. `@HandleEvent` 핸들러도 at-least-once 전제이므로 부작용 큰 핸들러는 동일한 ledger 전략이 유효하다. Domain Event 쪽 간단 예시는 [domain-events.md — 이벤트 핸들러 멱등성](./domain-events.md#이벤트-핸들러-멱등성)을 참조.

### 본질적 멱등성 (Level 1 · 기본)

Command 자체가 반복 실행되어도 결과가 동일하면 추가 장치 불필요. Cron 배치(상태 기반 필터링 + 최종 상태로 덮어쓰기)가 대표적.

```typescript
public async cleanupExpiredOrders(): Promise<number> {
  const { orders } = await this.orderRepository.findOrders({
    status: ['expired'], take: 100, page: 0
  })
  for (const order of orders) {
    order.archive()                 // 이미 archive면 내부에서 무시
    await this.orderRepository.saveOrder(order)
  }
  return orders.length
}
```

→ Task Controller는 `@TaskConsumer('order.cleanup-expired')` — **옵션 없음**. 가장 가볍다.

### 프레임워크 레벨 ledger (Level 2 · 기본 권장)

엔티티 단위 중복 실행을 차단해야 하는 Task(재결제·외부 API 호출 등 부작용 있는 작업)는 **`@TaskConsumer`의 `idempotencyKey` 옵션**으로 `TaskExecutionLog`에 ledger를 남긴다. `TaskConsumerRegistry`가 dispatch **직전에** ledger에 insert 시도하고, 이미 있으면 `'already-executed'` 반환 → 메서드 호출 skip → Consumer가 메시지 정상 삭제.

```typescript
@TaskConsumer('order.archive', {
  idempotencyKey: (payload: ArchiveOrderCommand) => `order.archive-${payload.orderId}`
})
public async archive(payload: ArchiveOrderCommand): Promise<void> {
  await this.orderCommandService.archiveOrder(payload)
}
```

- payload 타입을 Application의 Command 클래스(`ArchiveOrderCommand`)로 선언하여 호출 계약을 명확히 한다. Service 호출 시 Command 객체를 그대로 전달 — HTTP Controller의 `new CommandClass(body)` → Service 호출 패턴과 동일.
- **payload는 타입 힌트일 뿐 런타임에는 plain object**: SQS 메시지 body를 `JSON.parse`한 결과이므로 **Command 클래스의 인스턴스 메서드(getter/`equals()` 등)는 사용 불가**. 필드 접근만 가능. 메서드 호출이 필요하거나 validator 데코레이터로 검증해야 하면 [payload 검증](#payload-검증) 섹션의 `plainToInstance(Command, payload)` 패턴을 적용한다.
- Task Controller 코드가 1단계와 동일하게 간결. ledger 로직은 프레임워크가 처리.
- **semantics는 "record-before-execute"**: 핸들러 실패해도 ledger가 남아 재시도가 skip됨. 즉 **"한 번 시도 후 성공 여부와 무관하게 기억"**. 대부분의 실무 케이스에 충분하다.
- **`idempotencyKey` 함수 자체의 예외**: 키 생성 중 throw하면 dispatch가 예외 전파 → 메시지 삭제되지 않음 → 재수신 → DLQ. 키 생성 로직은 payload 필드 접근만 하도록 단순하게 유지한다.

### 강한 원자성 (Level 3 · 드문 케이스)

"핸들러가 성공해야만 ledger가 남는다"는 엄격한 원자성이 필요하면(드문 케이스), Task Controller가 `TaskExecutionLog`를 **직접 주입받아 `transactionManager.run` 안에서 호출**한다. 프레임워크의 `idempotencyKey`는 지정하지 **않는다**(지정하면 이중 체크).

```typescript
@Injectable()
export class OrderChargeTaskController {
  constructor(
    private readonly orderCommandService: OrderCommandService,
    private readonly transactionManager: TransactionManager,
    private readonly executionLog: TaskExecutionLog
  ) {}

  @TaskConsumer('order.charge')
  public async charge(payload: ChargeOrderCommand): Promise<void> {
    await this.transactionManager.run(async () => {
      const result = await this.executionLog.recordOnce(`order.charge-${payload.orderId}`)
      if (result === 'already-executed') return
      await this.orderCommandService.chargeOrder(payload)
    })
  }
}
```

- **ledger와 Command가 같은 트랜잭션에 참여하는 메커니즘**: `TaskExecutionLogDb.recordOnce()` 내부가 `TransactionManager.getManager()`를 사용하므로, 바깥의 `transactionManager.run(...)`이 연 트랜잭션 문맥에 **자동으로 참여**한다. Command가 실패해 롤백되면 ledger insert도 함께 롤백되어, 재시도 시 정상적으로 다시 처리된다(진정한 "exactly-once-on-success").
- **중복 수신 시 트랜잭션 안전성**: `recordOnce()`는 `INSERT ... ON CONFLICT DO NOTHING`을 사용하므로 `'already-executed'`를 반환해도 트랜잭션이 abort되지 않는다. `return`으로 early exit하고 바깥 `transactionManager.run`이 그대로 commit된다(변경 없는 commit). try/catch unique violation 방식이 왜 위험한지는 [`TaskExecutionLogDb` 구현체](#taskexecutionlog-인터페이스--구현체) 아래 노트 참조.
- **`recordOnce`의 2번째 인자(taskType)는 선택**: logging 용도일 뿐이며, Registry에서 프레임워크 경로로 호출할 때만 전달한다. Task Controller에서 직접 호출할 때는 생략 가능(예시 참조) — decorator에 이미 있는 정보의 중복 작성을 피함.
- 단점: Task Controller가 `TaskExecutionLog` + `TransactionManager`를 직접 주입받아 코드가 늘어난다. 3단계는 결제·외부 트랜잭션 등 금액이 걸린 Task에만 제한적으로 사용한다.

### Entity / 헬퍼 (프레임워크 내부)

task-queue 모듈 **내부 인프라 코드**(Entity, Relay, Cleaner 등)는 `DataSource`를 직접 주입/사용할 수 있다. "Task Controller의 DB 직접 접근 금지" 원칙은 도메인 Interface 레이어에만 적용되며, task-queue 프레임워크 자체는 DB·Cron·SQS 인프라를 직접 다루는 기술 컴포넌트다.

```typescript
// src/task-queue/task-execution-log.entity.ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

// ledger는 hard delete만 적합하므로 BaseEntity(softDelete 포함)를 상속하지 않는다
@Entity('task_execution_log')
@Index(['executedAt'])
export class TaskExecutionLogEntity {
  @PrimaryColumn()
  taskId: string

  @Column({ nullable: true })
  taskType: string | null   // logging 용도 — 없으면 null

  @Column()
  executedAt: Date
}
```

```typescript
// src/common/is-unique-violation.ts
import { QueryFailedError } from 'typeorm'

// Postgres unique_violation = SQLSTATE 23505
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError
    && (error.driverError as { code?: string } | undefined)?.code === '23505'
  )
}
```

### `TaskExecutionLog` 인터페이스 + 구현체

`TaskConsumerRegistry`가 주입받아 사용하며(2단계), 드물게 Task Controller가 직접 주입받을 수도 있다(3단계). `taskType` 파라미터는 logging 용도로만 쓰이므로 optional.

```typescript
// src/task-queue/task-execution-log.ts
export type RecordResult = 'recorded' | 'already-executed'

export abstract class TaskExecutionLog {
  abstract recordOnce(taskId: string, taskType?: string): Promise<RecordResult>
}
```

```typescript
// src/task-queue/task-execution-log-db.ts
import { Injectable } from '@nestjs/common'

import { TransactionManager } from '@/database/transaction-manager'

import { RecordResult, TaskExecutionLog } from './task-execution-log'
import { TaskExecutionLogEntity } from './task-execution-log.entity'

@Injectable()
export class TaskExecutionLogDb extends TaskExecutionLog {
  constructor(private readonly transactionManager: TransactionManager) {
    super()
  }

  public async recordOnce(taskId: string, taskType?: string): Promise<RecordResult> {
    const manager = this.transactionManager.getManager()
    // INSERT ... ON CONFLICT DO NOTHING — try/catch unique violation 대신 사용.
    // Postgres는 트랜잭션 내에서 에러가 발생하면 트랜잭션 전체를 abort 상태로
    // 만들기 때문에, 3단계(강한 원자성) 패턴처럼 바깥 트랜잭션이 있는 경우
    // try/catch 방식은 후속 쿼리와 commit이 SQLSTATE 25P02로 실패한다.
    // `.orIgnore()`는 예외를 발생시키지 않으므로 어느 문맥에서든 안전하다.
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(TaskExecutionLogEntity)
      .values({ taskId, taskType: taskType ?? null, executedAt: new Date() })
      .orIgnore()
      .execute()
    return (result.identifiers?.length ?? 0) > 0 ? 'recorded' : 'already-executed'
  }
}
```

- **UPSERT 패턴 선택의 이유**: 이전 버전은 `try { INSERT } catch (isUniqueViolation) { ... }` 방식이었으나, Postgres에서는 unique 위반 발생 시 **현재 트랜잭션이 aborted 상태**로 전환된다(SQLSTATE 25P02). 3단계 강한 원자성 패턴처럼 `transactionManager.run(...)` 안에서 `recordOnce()`를 호출할 경우, `'already-executed'` 반환 후 후속 작업·commit이 모두 "current transaction is aborted"로 실패한다. `.orIgnore()`(`ON CONFLICT DO NOTHING`)는 **예외를 발생시키지 않고** 충돌 row를 조용히 무시하므로, 어떤 트랜잭션 문맥에서도 안전하다.
- `isUniqueViolation` 헬퍼는 ledger 외의 영역(예: `task_outbox.deduplicationId` UNIQUE 위반 처리 등)에서 여전히 유용하므로 유지한다.

### Ledger cleanup

`task_execution_log`는 방치하면 무한 증가한다. 보존 기간은 **`maxReceiveCount × VisibilityTimeout`에 여유를 더한 값** 이상이면 충분하다(같은 메시지가 재배달될 수 있는 최대 기간). 보통 30일 보존으로 넉넉하다.

```typescript
// src/task-queue/task-execution-log-cleaner.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DataSource, LessThan } from 'typeorm'

import { TaskExecutionLogEntity } from './task-execution-log.entity'

@Injectable()
export class TaskExecutionLogCleaner {
  private readonly logger = new Logger(TaskExecutionLogCleaner.name)

  constructor(private readonly dataSource: DataSource) {}

  @Cron('0 4 * * *')  // 매일 04:00
  public async cleanup(): Promise<void> {
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await this.dataSource
      .getRepository(TaskExecutionLogEntity)
      .delete({ executedAt: LessThan(threshold) })
    this.logger.log({ message: 'ledger cleanup', deleted: result.affected ?? 0 })
  }
}
```

## payload 검증

외부(SQS) 입력이므로 Task Controller 메서드 내부에서 **payload 스키마를 검증**한다. HTTP Controller가 `class-validator`로 RequestBody를 검증하는 것과 같은 이유다.

payload 타입을 Application의 Command 클래스(이미 `class-validator` 데코레이터 부착)로 재사용하면 검증 로직이 HTTP와 Task 양쪽에서 공유된다.

```typescript
import { plainToInstance } from 'class-transformer'
import { validateOrReject } from 'class-validator'

import { SendReminderEmailCommand } from '@/order/application/command/send-reminder-email-command'

@TaskConsumer('order.send-reminder-email')
public async sendReminderEmail(payload: object): Promise<void> {
  const command = plainToInstance(SendReminderEmailCommand, payload)
  await validateOrReject(command)   // 검증 실패 시 throw → visibility timeout 후 재시도 → DLQ
  await this.orderCommandService.sendReminderEmail(command)
}
```

- 검증 실패도 예외이므로 메시지는 삭제되지 않고 재시도된다. 동일 payload는 매번 같은 이유로 실패하므로 `maxReceiveCount` 초과 시 DLQ로 이동한다. **독성 payload가 자연스럽게 격리**되는 구조.

### payload 크기 제한 (SQS 256KB)

SQS 단일 메시지는 **최대 256KB**다. 큰 페이로드(대용량 파일 내용, 다량 JSON 등)는 그대로 실어보내면 안 된다.

- **작은 메타데이터만 payload에 담는다**: `{ orderId: 'o1', itemIds: ['i1', 'i2'] }` 수준.
- **대용량 데이터는 S3에 offload**하고 key만 담는다: `{ orderId: 'o1', payloadS3Key: 'tasks/abc.json' }`. Task Controller가 S3에서 다시 가져와 처리.
- `task_outbox.payload`의 `jsonb` 컬럼 자체는 더 큰 값을 담을 수 있지만, Relay가 SQS로 발행하는 순간 256KB 한계에 걸린다. 한계를 넘으면 SendMessage가 실패하고 row가 `processed=false`로 남아 계속 실패한다 — 이런 row는 수동으로 정리하거나 Relay에 사이즈 체크 + DLQ 이동 로직을 추가한다.

### 검증 + 멱등성 결합

payload 검증과 프레임워크 레벨 멱등성(`idempotencyKey`)을 함께 적용할 때 주의할 점: **프레임워크의 ledger 기록은 핸들러 호출 전에 일어난다**. 즉 payload가 유효하지 않아 핸들러가 throw해도 ledger는 이미 기록되므로, 재시도 시 `already-executed`로 skip되어 **잘못된 payload가 영원히 처리되지 못할 수 있다**.

검증이 필수적인 Task는 **생산자 측에서 payload를 완전히 제어**하거나, 검증이 실패하면 즉시 DLQ로 보내는 방식(즉 재시도 무의미)으로 운영하는 것이 맞다.

```typescript
@TaskConsumer('order.dispatch-shipment', {
  idempotencyKey: (payload: DispatchShipmentCommand) => `order.dispatch-shipment-${payload.orderId}`
})
public async dispatchShipment(payload: object): Promise<void> {
  // 검증은 ledger 이후에 실행됨 — producer가 제어하는 payload여야 안전
  const command = plainToInstance(DispatchShipmentCommand, payload)
  await validateOrReject(command)
  await this.orderCommandService.dispatchShipment(command)
}
```

검증 실패 후 **재처리가 필요한 케이스**(외부 시스템이 payload를 보내주는 등)는 `idempotencyKey`를 쓰지 않고 [강한 원자성 패턴 (Level 3)](#강한-원자성-level-3--드문-케이스)을 쓴다 — 트랜잭션 안에서 검증 → ledger → Command 순서로 직접 제어.

## 긴 Task와 VisibilityTimeout 하트비트

`VisibilityTimeout`은 최대 12시간이지만, 처리가 그보다 길어지거나 예측 불가능한 Task는 **처리 중 주기적으로 `ChangeMessageVisibility`를 호출**하여 timeout을 연장해야 한다. 연장하지 않으면 다른 Consumer가 동일 메시지를 중복 수신한다.

`TaskQueueConsumer`의 [`withHeartbeat`](#taskqueueconsumer--sqs-폴링)가 이미 이 로직을 구현해두었다. **`@TaskConsumer` 옵션에 `heartbeat`을 지정**하기만 하면 해당 taskType 처리 중에만 자동으로 하트비트가 동작한다.

```typescript
@TaskConsumer('order.generate-large-report', {
  heartbeat: { intervalMs: 60_000, extendSeconds: 180 }  // 60초마다 180초 연장
})
public async generateLargeReport(payload: { reportId: string }): Promise<void> {
  await this.orderCommandService.generateReport(payload.reportId)
}
```

- **옵션 설계**: `intervalMs < extendSeconds * 1000`이어야 한다. 60초 간격으로 180초 연장하면 항상 여유가 있다.
- **기본은 옵션 미지정(하트비트 없음)**: 대부분의 Task는 수초~수십초에 끝나므로 초기 `VisibilityTimeout: 300`으로 충분하다.
- **초기 `VisibilityTimeout`은 짧게 + 하트비트로 연장**: 초기값을 무조건 크게 잡으면 진짜 실패 시 재시도 지연이 커진다. 짧게 잡고 필요한 Task만 하트비트로 연장하는 편이 회복력 측면에서 유리하다.

## Graceful Shutdown

앱 종료 시 `TaskQueueConsumer`의 polling 루프가 먼저 중단되어야 한다. 위 구현의 `OnApplicationShutdown`이 이를 담당한다. 진행 중인 Task는 완료까지 대기하고, 실패하면 visibility timeout 후 다른 인스턴스가 재수신한다. 자세한 순서는 [graceful-shutdown.md](./graceful-shutdown.md)를 참고한다.

**단, `pollPromise` await는 무한 대기가 아니다.** 컨테이너 오케스트레이터(K8s 등)는 `terminationGracePeriodSeconds`(기본 30초) 내에 정리가 끝나지 않으면 SIGKILL로 강제 종료한다. Task Controller가 stuck(무한 루프·DB deadlock 등)되면 shutdown이 블록되고 강제 종료가 발생하며, in-flight 메시지는 삭제되지 않았으므로 visibility timeout 후 다른 인스턴스가 재수신한다 — 즉, **at-least-once 의미론이 강제 종료를 복구**한다. 그래도 다음을 유념한다.

- **Task의 최대 처리 시간이 grace period보다 작도록 설계**. 길어지면 `@TaskConsumer heartbeat` + grace period 상향이 함께 필요.
- **정상 종료 경로에서 재수신으로 인한 중복 실행 가능** — Consumer 측 멱등성이 여기서도 방어선.

## DLQ 모니터링

DLQ에 쌓인 메시지는 **코드 버그나 독성 페이로드의 증거**다. CloudWatch 알람으로 `ApproximateNumberOfMessages > 0`을 감시하고, 원인 수정 후 DLQ → 원래 큐로 redrive한다.

## Testing

`@TaskConsumer` / `@Cron` 데코레이터는 모두 **메타데이터만 등록**하고 메서드 호출 자체를 래핑하지 않는다. 따라서 단위 테스트는 데코레이터를 우회해 메서드를 직접 호출하면 된다. SQS 목이 필요한 곳은 통합 경계뿐.

### Task Controller — 단위 테스트

CommandService만 목으로 주입하고 메서드를 직접 호출한다. 큐/SQS/ledger 불필요 — Task Controller는 순수 위임이므로 비즈니스 동작만 검증.

```typescript
describe('OrderTaskController', () => {
  const orderCommandService = { archiveOrder: jest.fn() } as any
  const controller = new OrderTaskController(orderCommandService)

  test('archive는 CommandService.archiveOrder에 Command 객체를 전달한다', async () => {
    await controller.archive({ orderId: 'o1' })
    expect(orderCommandService.archiveOrder).toHaveBeenCalledWith({ orderId: 'o1' })
  })
})
```

> 멱등성 ledger는 `TaskConsumerRegistry` 레벨에서 처리되므로 Task Controller 단위 테스트의 관심사가 아니다. ledger 동작은 `TaskConsumerRegistry` 또는 `TaskExecutionLogDb` 통합 테스트에서 검증한다.

### `TaskConsumerRegistry` — 통합 테스트

`idempotencyKey` 옵션이 있는 Task가 실제로 ledger를 기록하고 중복 호출 시 skip되는지 검증.

```typescript
test('idempotencyKey가 있는 Task는 두 번째 호출에서 skip된다', async () => {
  // OrderTaskController가 등록된 상태라고 가정
  const controller = moduleRef.get(OrderTaskController)
  const spy = jest.spyOn(controller, 'archive')

  await registry.dispatch('order.archive', { orderId: 'o1' })
  await registry.dispatch('order.archive', { orderId: 'o1' })

  expect(spy).toHaveBeenCalledTimes(1)   // 두 번째는 ledger skip
})
```

### Scheduler — 단위 테스트

`TaskQueue` 목을 주입하고 `@Cron` 메서드를 직접 호출한 뒤 `enqueue` 인자를 검증한다.

```typescript
test('만료 주문 정리 Task를 날짜 기반 dedupId로 적재한다', async () => {
  const taskQueue = { enqueue: jest.fn() } as any
  const scheduler = new OrderCleanupScheduler(taskQueue)

  await scheduler.enqueueDailyCleanup()

  expect(taskQueue.enqueue).toHaveBeenCalledWith(
    'order.cleanup-expired',
    {},
    expect.objectContaining({ groupId: 'order.cleanup', deduplicationId: expect.stringMatching(/^order\.cleanup-expired-\d{4}-\d{2}-\d{2}$/) })
  )
})
```

### `TaskQueueOutbox` — 통합 테스트

실제 DB로 `task_outbox` row insert와 트랜잭션 롤백 동작을 검증한다.

```typescript
test('enqueue는 task_outbox row를 insert한다', async () => {
  await taskQueueOutbox.enqueue('order.archive', { orderId: 'o1' }, { groupId: 'o1', deduplicationId: 'd1' })
  const rows = await dataSource.getRepository(TaskOutboxEntity).find()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ taskType: 'order.archive', processed: false })
})

test('트랜잭션 롤백 시 row도 롤백된다', async () => {
  await expect(
    transactionManager.run(async () => {
      await taskQueueOutbox.enqueue('order.archive', { orderId: 'o1' }, { groupId: 'o1', deduplicationId: 'd2' })
      throw new Error('rollback')
    })
  ).rejects.toThrow()
  const rows = await dataSource.getRepository(TaskOutboxEntity).findBy({ deduplicationId: 'd2' })
  expect(rows).toHaveLength(0)
})
```

### `TaskOutboxRelay` / `TaskQueueConsumer` — 통합 테스트

- **Relay**: SQSClient를 목 치환하거나 LocalStack으로 실제 전송. `processed=true`로 flip되는지 확인.
- **Consumer**: LocalStack 큐에 메시지를 직접 `SendMessage`한 뒤 Task Controller의 `@TaskConsumer` 메서드가 호출되는지 검증.

공통 패턴(TestContainer, trxn rollback 등)은 [testing.md](./testing.md)를 참조한다.

## Interval / Timeout

단순 반복이나 지연 실행도 Task Queue로 표현하는 것을 우선한다. **프로세스 로컬한 작업**(예: 인메모리 캐시 워밍)에 한해 `@Interval` / `@Timeout`을 제한적으로 사용한다.

```typescript
@Timeout(5000)  // 앱 기동 5초 후 1회 — 프로세스 로컬 캐시 워밍
async warmupCache() { /* ... */ }
```

## 원칙

- **`@TaskConsumer` 데코레이터로 Task 구독**: `taskType` 문자열 하나로 Scheduler(적재)와 Task Controller(소비)가 연결된다.
- **Task Controller는 Interface 레이어**: HTTP Controller와 동일한 입력 어댑터. `CommandService`를 주입받아 Command를 실행만 한다. 조건 분기·비즈니스 로직 금지.
- **Task Controller는 에러를 그대로 던진다**: HTTP Controller의 `.catch + generateErrorResponse` 패턴 금지. 예외는 `TaskQueueConsumer`가 catch하여 재시도/DLQ에 위임한다.
- **적재는 Outbox 경유**: `TaskQueue.enqueue`는 `task_outbox`에 row를 쓰고, `TaskOutboxRelay`가 SQS에 발행한다. Command 트랜잭션과 Task 적재의 원자성이 보장된다.
- **Scheduler는 적재만**: `@Cron` 핸들러는 `TaskQueue.enqueue`만 호출한다. Scheduler와 SQS 폴링 인프라는 Infrastructure 레이어.
- **Domain/Application은 큐 구현을 모른다**: Application Service는 `TaskQueue` **abstract class**에만 의존한다. SQS·Outbox 구현은 DI 바인딩으로 주입된다.
- **Task ≠ Domain Event**: Task는 필요에 따라 구현하여 실행하는 비동기 작업(1:1), Domain Event는 Command 실행 결과를 수신해 처리하는 수단(1:N). 선택 기준은 상단 표 참조.
- **`taskType`은 전역 유일**: `@TaskConsumer` 중복 등록은 부트스트랩 시점에 실패시킨다. (도메인 이벤트의 1:N fan-out과 다른 점)
- **단일 Task 큐**: 모든 도메인의 Task는 하나의 SQS FIFO 큐를 공유한다. 라우팅은 `taskType` 문자열로 수행.
- **FIFO + MessageDeduplicationId**: 다중 인스턴스 Cron 중복 적재는 큐 레벨에서 방지한다.
- **실패 시 메시지 삭제 금지**: visibility timeout → 재수신 → DLQ 구조를 신뢰한다. try-catch로 삼키고 Delete하면 실패가 소실된다.
- **긴 Task는 `@TaskConsumer` heartbeat 옵션**: 초기 `VisibilityTimeout`을 짧게 잡고, 필요한 taskType에만 `heartbeat`을 지정해 처리 중 연장한다.
- **Command는 멱등하게**: at-least-once 전달이므로 동일 Task가 2회 이상 실행되어도 결과가 같아야 한다. 3단계 전략: ① 본질적 멱등 ② `@TaskConsumer({ idempotencyKey })` 프레임워크 ledger ③ 강한 원자성이 필요하면 Task Controller에서 `TaskExecutionLog`를 직접 주입.
- **ledger 코드는 Task Controller에 작성하지 않는다(기본)**: `idempotencyKey` 옵션으로 프레임워크가 처리. Task Controller는 CommandService 호출만 남는다.
- **Task Controller는 DB 직접 접근 금지**: `DataSource`/`Repository<Entity>`를 주입하지 않는다. 공용 관심사(ledger, heartbeat)는 task-queue 프레임워크가 처리한다.
- **ledger와 outbox 모두 cleanup Cron 필수**: `task_outbox` / `task_execution_log` 방치 시 무한 증가.
- **Scheduler는 try-catch + logger.error 필수**: `@nestjs/schedule`이 예외를 삼키므로 명시적 로깅 없으면 실패가 관찰 불가능해진다.
- **Consumer 멱등성은 최후 방어선**: Relay 다중 인스턴스 race·Graceful Shutdown 강제 종료·visibility timeout 만료 시 재수신 등 어떤 경우에도 Consumer가 멱등하면 복구된다.
- **DLQ 필수**: 모든 Task 큐에 DLQ를 설정하고 CloudWatch 알람으로 감시한다.
