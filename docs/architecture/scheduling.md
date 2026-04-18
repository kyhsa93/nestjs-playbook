# Scheduling / Batch 작업

주기적 작업과 배치 처리는 **AWS SQS 기반 Task Queue** 방식으로 구현한다. Scheduler가 Cron 주기로 SQS에 Task 메시지를 적재(produce)하고, **Task Controller의 메서드가 `@TaskConsumer` 데코레이터로 구독**하여 해당 Task가 도착하면 메서드가 실행되는 구조다. Task Controller는 Command Service를 주입받아 Task에 해당하는 Command를 실행한다.

```
[Scheduler] --(Task 메시지)--> [SQS] --(수신)--> [TaskQueueConsumer]
                                                        ↓ taskType 라우팅
                                          [TaskController.method @TaskConsumer('...')]
                                                        ↓
                                                [CommandService.xxxCommand(...)]
```

`@nestjs/schedule`의 `@Cron`을 Application Service에 직접 걸지 않는 이유는 다음과 같다.

- **다중 인스턴스 안전성**: SQS FIFO 큐의 `MessageDeduplicationId`로 같은 시점에 여러 인스턴스가 적재해도 5분 중복 제거 윈도우 내에서는 1건만 큐에 들어간다.
- **재시도 내장**: Consumer가 예외로 메시지를 삭제하지 않으면 `VisibilityTimeout` 경과 후 자동 재수신된다. `maxReceiveCount` 초과 시 DLQ로 이동한다.
- **관찰 가능성**: CloudWatch 지표(`ApproximateNumberOfMessages`, `ApproximateAgeOfOldestMessage`)와 DLQ로 상태를 추적한다.
- **백프레셔**: 작업량이 폭증해도 큐에 쌓여 Consumer 처리 속도에 맞춰 소비된다.

기존 Outbox → SQS 구조와 동일한 SDK/인프라를 재사용한다. [domain-events.md](./domain-events.md)의 `EventConsumer`/`EventHandlerRegistry` 패턴과 같은 결의 구조다.

## 설치

```bash
npm install @aws-sdk/client-sqs
```

로컬에서는 LocalStack으로 SQS를 제공한다. 큐 생성 방법은 [local-dev.md](./local-dev.md)를 참고한다.

## 큐 구성

| 큐 타입 | 언제 쓰나 | 핵심 속성 |
|---------|----------|-----------|
| **FIFO (`*.fifo`)** | Cron으로 주기 실행되는 Task — 중복 적재를 막아야 할 때 | `MessageGroupId`, `MessageDeduplicationId` |
| **Standard** | 순서 무관·고처리량 Ad-hoc Task | at-least-once, 순서 보장 없음 |

**모든 큐에 DLQ를 함께 구성한다.** `RedrivePolicy`의 `maxReceiveCount`를 초과한 메시지를 DLQ로 이동시켜 독성 메시지가 무한 재시도되는 것을 방지한다.

```
SQS_TASK_QUEUE_URL=https://.../app-task.fifo
SQS_TASK_DLQ_URL=https://.../app-task-dlq.fifo
```

## 레이어 배치

**Task Controller는 Interface 레이어에 배치한다.** HTTP Controller와 동일하게 외부 입력(SQS 메시지)을 받아 Application Service에 위임하는 **입력 어댑터**이기 때문이다. REST 진입점이 `interface/`에 있는 것과 같은 이유로, 메시지 진입점도 `interface/`에 둔다.

공용 Task Queue 인프라(SQS 폴링/적재, 데코레이터, 레지스트리)는 도메인에 속하지 않으므로 top-level 공유 모듈에 둔다.

```
src/
  task-queue/                                # 공유 Task Queue 인프라
    task-consumer.decorator.ts               # @TaskConsumer 데코레이터
    task-consumer-registry.ts                # taskType → 핸들러 라우팅
    task-queue-consumer.ts                   # SQS 폴링 → registry.dispatch
    task-queue.ts                            # SQS 적재 어댑터 (Producer)
  order/
    interface/
      order-controller.ts                    # HTTP 입력 어댑터
      order-task-controller.ts               # Task 입력 어댑터 — @TaskConsumer 메서드
    infrastructure/
      order-cleanup-scheduler.ts             # @Cron → TaskQueue.enqueue
    application/
      command/
        order-command-service.ts             # 비즈니스 로직 — 큐를 모름
```

## 1단계: `@TaskConsumer` 데코레이터

메서드에 Task 타입을 바인딩한다. 전역 Map에 핸들러를 등록해두고, 런타임에 `TaskConsumerRegistry`가 `taskType`으로 조회한다.

```typescript
// src/task-queue/task-consumer.decorator.ts
type HandlerEntry = {
  handlerClass: new (...args: unknown[]) => unknown
  method: string
}

const TASK_HANDLER_MAP = new Map<string, HandlerEntry>()

export function TaskConsumer(taskType: string): MethodDecorator {
  return (target, propertyKey) => {
    if (TASK_HANDLER_MAP.has(taskType)) {
      throw new Error(`Duplicate @TaskConsumer for taskType: ${taskType}`)
    }
    TASK_HANDLER_MAP.set(taskType, {
      handlerClass: target.constructor as new (...args: unknown[]) => unknown,
      method: propertyKey as string
    })
  }
}

export function getTaskHandler(taskType: string): HandlerEntry | undefined {
  return TASK_HANDLER_MAP.get(taskType)
}
```

- **taskType은 전역 유일**: Task는 정확히 하나의 핸들러가 실행되어야 한다. 도메인 이벤트(1:N fan-out)와 다른 점이다. 중복 등록은 부트스트랩 시점에 바로 실패시킨다.

## 2단계: `TaskConsumerRegistry` — 라우팅

`taskType`에 매핑된 Task Controller의 메서드를 찾아 호출한다.

```typescript
// src/task-queue/task-consumer-registry.ts
import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'

import { getTaskHandler } from './task-consumer.decorator'

@Injectable()
export class TaskConsumerRegistry {
  private readonly logger = new Logger(TaskConsumerRegistry.name)

  constructor(private readonly moduleRef: ModuleRef) {}

  public async dispatch(taskType: string, payload: object): Promise<void> {
    const entry = getTaskHandler(taskType)
    if (!entry) {
      throw new Error(`No @TaskConsumer registered for taskType: ${taskType}`)
    }
    const handler = this.moduleRef.get(entry.handlerClass, { strict: false })
    await (handler as Record<string, (p: object) => Promise<void>>)[entry.method](payload)
  }
}
```

## 3단계: `TaskQueueConsumer` — SQS 폴링

SQS에서 메시지를 수신하고 `TaskConsumerRegistry`에 위임한다. 도메인 지식이 없는 공용 Infrastructure 컴포넌트다.

```typescript
// src/task-queue/task-queue-consumer.ts
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common'
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'

import { TaskConsumerRegistry } from './task-consumer-registry'

@Injectable()
export class TaskQueueConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TaskQueueConsumer.name)
  private readonly sqs = new SQSClient({
    ...(process.env.AWS_ENDPOINT ? { endpoint: process.env.AWS_ENDPOINT } : {})
  })
  private readonly queueUrl = process.env.SQS_TASK_QUEUE_URL!
  private running = true

  constructor(private readonly registry: TaskConsumerRegistry) {}

  public onModuleInit(): void {
    void this.poll()
  }

  public async onApplicationShutdown(): Promise<void> {
    this.running = false
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.sqs.send(new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 300
        }))

        for (const message of result.Messages ?? []) {
          const messageId = message.MessageId
          try {
            const { taskType, payload } = JSON.parse(message.Body ?? '{}')
            this.logger.log({ message: 'Task 시작', message_id: messageId, task_type: taskType })

            await this.registry.dispatch(taskType, payload ?? {})

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
}
```

- **메시지 삭제는 성공 시에만**: 예외가 발생하면 삭제하지 않아 visibility timeout 경과 후 자동 재수신 → `maxReceiveCount` 초과 시 DLQ로 이동한다.
- `VisibilityTimeout`은 가장 긴 Task의 최대 처리 시간보다 넉넉히 설정한다.

## 4단계: `TaskController` — `@TaskConsumer` 메서드로 Command 실행 (Interface 레이어)

**Task Controller는 Interface 레이어의 입력 어댑터**다. HTTP Controller가 `@Get`/`@Post`로 HTTP 진입점을 선언하듯, Task Controller는 `@TaskConsumer('taskType')`로 Task 진입점을 선언한다. CommandService를 주입받아 Task에 해당하는 Command를 실행한다.

```typescript
// src/order/interface/order-task-controller.ts
import { Injectable, Logger } from '@nestjs/common'

import { OrderCommandService } from '@/order/application/command/order-command-service'
import { TaskConsumer } from '@/task-queue/task-consumer.decorator'

@Injectable()
export class OrderTaskController {
  private readonly logger = new Logger(OrderTaskController.name)

  constructor(private readonly orderCommandService: OrderCommandService) {}

  @TaskConsumer('order.cleanup-expired')
  public async cleanupExpired(): Promise<void> {
    const count = await this.orderCommandService.cleanupExpiredOrders()
    this.logger.log({ message: '만료 주문 정리', cleaned_count: count })
  }

  @TaskConsumer('order.archive')
  public async archive(payload: { orderId: string }): Promise<void> {
    await this.orderCommandService.archiveOrder(payload.orderId)
  }
}
```

- **로직 없이 Command 위임**: Task Controller는 `CommandService`의 Command 메서드를 호출할 뿐이다. 조건 분기나 비즈니스 규칙을 넣지 않는다. HTTP Controller와 동일한 역할.
- **payload 타입은 메서드 시그니처에 명시**: 호출 계약을 명확히 한다. 필요 시 Zod/class-validator로 런타임 검증을 추가한다.
- **Interface DTO 규칙 적용**: payload 타입을 Application의 Command 클래스로 그대로 쓰거나, 필요 시 Interface DTO로 `extends`하여 thin wrapper로 둔다. (HTTP RequestBody와 동일한 방식 — [layer-architecture.md](./layer-architecture.md#interface-dto) 참조)

## 5단계: `TaskQueue` — Task 적재 어댑터 (Producer)

SQS에 Task 메시지를 보내는 공용 어댑터다. Scheduler와 Application Service 양쪽에서 사용한다.

```typescript
// src/task-queue/task-queue.ts
import { Injectable } from '@nestjs/common'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'

export type EnqueueOptions = {
  groupId: string
  deduplicationId: string
  delaySeconds?: number  // Standard 큐에서만 사용, 최대 900초
}

@Injectable()
export class TaskQueue {
  private readonly sqs = new SQSClient({
    ...(process.env.AWS_ENDPOINT ? { endpoint: process.env.AWS_ENDPOINT } : {})
  })
  private readonly queueUrl = process.env.SQS_TASK_QUEUE_URL!

  public async enqueue(taskType: string, payload: object, options: EnqueueOptions): Promise<void> {
    await this.sqs.send(new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify({ taskType, payload }),
      MessageGroupId: options.groupId,
      MessageDeduplicationId: options.deduplicationId
    }))
  }
}
```

## 6단계: Scheduler — Cron → TaskQueue

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
    await this.taskQueue.enqueue(
      'order.cleanup-expired',
      {},
      { groupId: 'order.cleanup', deduplicationId: dedupId }
    )
    this.logger.log({ message: '만료 주문 정리 Task 적재', dedup_id: dedupId })
  }
}
```

- **`MessageDeduplicationId`를 날짜 단위로 고정**: 다중 인스턴스가 동일 Cron 타이밍에 적재해도 5분 중복 제거 윈도우에서 1건만 큐에 들어간다. Cron 중복 실행 해결의 핵심.

## 모듈 등록

공유 Task Queue 모듈 하나와, 도메인 모듈에서 Task Controller를 등록한다.

```typescript
// src/task-queue/task-queue-module.ts
@Global()
@Module({
  providers: [TaskQueue, TaskConsumerRegistry, TaskQueueConsumer],
  exports: [TaskQueue]
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

## Ad-hoc Task 적재

Application Service나 이벤트 핸들러에서도 `TaskQueue`를 주입받아 Task를 적재할 수 있다.

```typescript
@Injectable()
export class OrderCommandService {
  constructor(private readonly taskQueue: TaskQueue) {}

  public async cancelOrder(orderId: string): Promise<void> {
    // ... 도메인 로직
    await this.taskQueue.enqueue(
      'order.archive',
      { orderId },
      { groupId: orderId, deduplicationId: `order.archive-${orderId}` }
    )
  }
}
```

## 멱등성

SQS는 **at-least-once delivery**를 보장하므로, `@TaskConsumer` 메서드가 호출하는 Command는 **반드시 멱등해야 한다**.

```typescript
public async cleanupExpiredOrders(): Promise<number> {
  const { orders } = await this.orderRepository.findOrders({
    status: ['expired'],
    take: 100,
    page: 0
  })
  for (const order of orders) {
    order.archive()                 // 이미 archive면 내부에서 무시
    await this.orderRepository.saveOrder(order)
  }
  return orders.length
}
```

엔티티 단위 멱등성이 필요하면 payload에 `taskId`를 포함하고 처리 이력 테이블(unique index)로 중복 실행을 방어한다.

## Graceful Shutdown

앱 종료 시 `TaskQueueConsumer`의 polling 루프가 먼저 중단되어야 한다. 위 구현의 `OnApplicationShutdown`이 이를 담당한다. 진행 중인 Task는 완료까지 대기하고, 실패하면 visibility timeout 후 다른 인스턴스가 재수신한다. 자세한 순서는 [graceful-shutdown.md](./graceful-shutdown.md)를 참고한다.

## DLQ 모니터링

DLQ에 쌓인 메시지는 **코드 버그나 독성 페이로드의 증거**다. CloudWatch 알람으로 `ApproximateNumberOfMessages > 0`을 감시하고, 원인 수정 후 DLQ → 원래 큐로 redrive한다.

## Interval / Timeout

단순 반복이나 지연 실행도 Task Queue로 표현하는 것을 우선한다. **프로세스 로컬한 작업**(예: 인메모리 캐시 워밍)에 한해 `@Interval` / `@Timeout`을 제한적으로 사용한다.

```typescript
@Timeout(5000)  // 앱 기동 5초 후 1회 — 프로세스 로컬 캐시 워밍
async warmupCache() { /* ... */ }
```

## 원칙

- **`@TaskConsumer` 데코레이터로 Task 구독**: `taskType` 문자열 하나로 Scheduler(적재)와 Task Controller(소비)가 연결된다.
- **Task Controller는 Interface 레이어**: HTTP Controller와 동일한 입력 어댑터. `CommandService`를 주입받아 Command를 실행만 한다. 조건 분기·비즈니스 로직 금지.
- **Scheduler는 적재만**: `@Cron` 핸들러는 `TaskQueue.enqueue`만 호출한다. Scheduler와 SQS 폴링 인프라는 Infrastructure 레이어.
- **Domain/Application은 큐를 모른다**: Application Service는 필요 시 `TaskQueue` 인터페이스에만 의존한다.
- **`taskType`은 전역 유일**: `@TaskConsumer` 중복 등록은 부트스트랩 시점에 실패시킨다. (도메인 이벤트의 1:N fan-out과 다른 점)
- **FIFO + MessageDeduplicationId**: 다중 인스턴스 Cron 중복 적재는 큐 레벨에서 방지한다.
- **실패 시 메시지 삭제 금지**: visibility timeout → 재수신 → DLQ 구조를 신뢰한다. try-catch로 삼키고 Delete하면 실패가 소실된다.
- **Command는 멱등하게**: at-least-once 전달이므로 동일 Task가 2회 이상 실행되어도 결과가 같아야 한다.
- **DLQ 필수**: 모든 Task 큐에 DLQ를 설정하고 CloudWatch 알람으로 감시한다.
