# 도메인 이벤트 발행 패턴

### 전체 흐름

```
[1. 도메인 로직 실행]
  Command Service → Aggregate 도메인 메서드 호출 → Aggregate 내부에 이벤트 객체 수집

[2. 저장 — 하나의 트랜잭션]
  Repository.save(aggregate) 내부에서:
    - Aggregate 상태 저장
    - aggregate.domainEvents를 outbox 테이블에 저장
    - aggregate.clearEvents()
  트랜잭션 커밋 → Aggregate와 이벤트가 함께 확정되거나 함께 롤백

[3. Outbox → SQS 전송]
  OutboxRelay: outbox 테이블을 짧은 주기로 폴링
    → 미전송 이벤트를 SQS 큐로 전송
    → 전송 완료된 이벤트를 processed 처리

[4. SQS → EventHandler 수신]
  EventConsumer: SQS 큐에서 메시지를 수신 (폴링)
    → eventType에 따라 해당 EventHandler 호출
    → 후속 처리 실행 (알림, 다른 도메인 호출 등)
```

### 1단계: Aggregate에서 이벤트 수집

Aggregate의 도메인 메서드가 상태를 변경할 때 내부 `_events` 배열에 이벤트 객체를 추가한다.

```typescript
// domain/order.ts
export class Order {
  private readonly _events: OrderDomainEvent[] = []

  get domainEvents(): OrderDomainEvent[] { return [...this._events] }

  public cancel(reason: string): void {
    if (this._status === 'cancelled') throw new Error(...)
    this._status = 'cancelled'
    // 도메인 메서드 내부에서 이벤트 객체 생성
    this._events.push(new OrderCancelled({ orderId: this.orderId, reason, cancelledAt: new Date() }))
  }

  public clearEvents(): void { this._events.length = 0 }
}
```

### 2단계: Repository에서 Aggregate + Outbox를 트랜잭션으로 저장

**Repository 구현체의 save 메서드** 안에서 Aggregate 저장과 outbox 저장을 하나의 트랜잭션으로 묶는다. Command Service는 outbox를 직접 다루지 않는다.

```typescript
// infrastructure/order-repository-impl.ts
@Injectable()
export class OrderRepositoryImpl extends OrderRepository {
  constructor(
    @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
    private readonly transactionManager: TransactionManager,
    private readonly outboxWriter: OutboxWriter
  ) {
    super()
  }

  public async saveOrder(order: Order): Promise<void> {
    const manager = this.transactionManager.getManager()
    // Aggregate 저장 + 이벤트 outbox 저장이 같은 트랜잭션
    await manager.save(OrderEntity, {
      orderId: order.orderId,
      userId: order.userId,
      status: order.status,
      items: order.items.map((i) => ({ ... }))
    })
    // 도메인 이벤트가 있으면 outbox에 저장
    if (order.domainEvents.length > 0) {
      await this.outboxWriter.saveAll(order.domainEvents)
      order.clearEvents()
    }
  }
}
```

Command Service는 Repository.save()만 호출하면 된다:

```typescript
// application/command/order-command-service.ts
public async cancelOrder(command: CancelOrderCommand): Promise<void> {
  const order = await this.orderRepository.findOrders({ ... }).then((r) => r.orders.pop())
  if (!order) throw new Error(...)

  order.cancel(command.reason)                   // 도메인 메서드 → 이벤트 수집

  await this.transactionManager.run(async () => {
    await this.paymentRepository.deletePaymentMethods(order.orderId)
    await this.orderRepository.saveOrder(order)  // Aggregate + outbox 함께 저장
  })
}
```

### Outbox Entity

```typescript
// outbox/outbox.entity.ts
import { Entity, PrimaryColumn, Column } from 'typeorm'

import { BaseEntity } from '@/database/base.entity'

@Entity('outbox')
export class OutboxEntity extends BaseEntity {
  @PrimaryColumn({ type: 'char', length: 32 })
  eventId: string

  @Column({ type: 'varchar', length: 100 })
  eventType: string

  @Column({ type: 'text' })
  payload: string

  @Column({ type: 'boolean', default: false })
  processed: boolean
}
```

### OutboxWriter

트랜잭션 안에서 이벤트를 outbox 테이블에 저장한다. Repository 구현체에서 호출된다.

```typescript
// outbox/outbox-writer.ts
import { Injectable } from '@nestjs/common'

import { generateId } from '@/common/generate-id'
import { TransactionManager } from '@/database/transaction-manager'
import { OutboxEntity } from '@/outbox/outbox.entity'

@Injectable()
export class OutboxWriter {
  constructor(private readonly transactionManager: TransactionManager) {}

  public async saveAll(events: object[]): Promise<void> {
    const manager = this.transactionManager.getManager()
    await manager.save(
      OutboxEntity,
      events.map((event) => ({
        eventId: generateId(),
        eventType: event.constructor.name,
        payload: JSON.stringify(event),
        processed: false
      }))
    )
  }
}
```

### 3단계: OutboxRelay — Outbox → SQS 전송

outbox 테이블에서 미전송 이벤트를 짧은 주기로 폴링하여 SQS 큐로 전송한다.

```typescript
// outbox/outbox-relay.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { DataSource } from 'typeorm'

import { OutboxEntity } from '@/outbox/outbox.entity'

@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name)
  private readonly sqs = new SQSClient({
    ...(process.env.AWS_ENDPOINT ? { endpoint: process.env.AWS_ENDPOINT } : {})
  })
  private readonly queueUrl = process.env.SQS_DOMAIN_EVENT_QUEUE_URL!

  constructor(private readonly dataSource: DataSource) {}

  @Cron('*/3 * * * * *')  // 3초마다 폴링
  public async relay(): Promise<void> {
    const repo = this.dataSource.getRepository(OutboxEntity)
    const events = await repo.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 100
    })

    for (const event of events) {
      try {
        await this.sqs.send(new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({
            eventId: event.eventId,
            eventType: event.eventType,
            payload: event.payload
          })
        }))
        await repo.update({ eventId: event.eventId }, { processed: true })
      } catch (error) {
        this.logger.error({ message: 'SQS 전송 실패', event_id: event.eventId, error })
      }
    }
  }

  @Cron('0 3 * * *')  // 매일 03:00 — 처리 완료된 이벤트 정리
  public async cleanup(): Promise<void> {
    const repo = this.dataSource.getRepository(OutboxEntity)
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    await repo.delete({ processed: true, createdAt: LessThan(threshold) })
  }
}
```

### 4단계: EventConsumer — SQS → EventHandler 수신

SQS 큐에서 메시지를 폴링하여 eventType에 따라 핸들러를 호출한다.

```typescript
// outbox/event-consumer.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'

import { EventHandlerRegistry } from '@/outbox/event-handler-registry'

@Injectable()
export class EventConsumer implements OnModuleInit {
  private readonly logger = new Logger(EventConsumer.name)
  private readonly sqs = new SQSClient({
    ...(process.env.AWS_ENDPOINT ? { endpoint: process.env.AWS_ENDPOINT } : {})
  })
  private readonly queueUrl = process.env.SQS_DOMAIN_EVENT_QUEUE_URL!
  private running = true

  constructor(private readonly handlerRegistry: EventHandlerRegistry) {}

  onModuleInit(): void {
    this.poll()
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.sqs.send(new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5   // long polling
        }))

        for (const message of result.Messages ?? []) {
          try {
            const { eventType, payload } = JSON.parse(message.Body ?? '{}')
            await this.handlerRegistry.handle(eventType, JSON.parse(payload))
            await this.sqs.send(new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle!
            }))
          } catch (error) {
            this.logger.error({ message: '이벤트 처리 실패', error })
            // 삭제하지 않으면 visibility timeout 후 재수신됨
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

### EventHandlerRegistry — 핸들러 라우팅

eventType 문자열을 핸들러에 매핑한다.

```typescript
// outbox/event-handler-registry.ts
import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'

type HandlerEntry = { handlerClass: new (...args: any[]) => any; method: string }

const HANDLER_MAP = new Map<string, HandlerEntry[]>()

// 데코레이터 — EventHandler에서 사용
export function HandleEvent(eventType: string): MethodDecorator {
  return (target, propertyKey) => {
    const entries = HANDLER_MAP.get(eventType) ?? []
    entries.push({ handlerClass: target.constructor as any, method: propertyKey as string })
    HANDLER_MAP.set(eventType, entries)
  }
}

@Injectable()
export class EventHandlerRegistry {
  constructor(private readonly moduleRef: ModuleRef) {}

  public async handle(eventType: string, payload: object): Promise<void> {
    const entries = HANDLER_MAP.get(eventType) ?? []
    for (const { handlerClass, method } of entries) {
      const handler = this.moduleRef.get(handlerClass, { strict: false })
      await handler[method](payload)
    }
  }
}
```

### EventHandler — 도메인 이벤트 수신 및 처리

```typescript
// application/event/order-cancelled-handler.ts
import { Injectable, Logger } from '@nestjs/common'

import { HandleEvent } from '@/outbox/event-handler-registry'

@Injectable()
export class OrderCancelledHandler {
  private readonly logger = new Logger(OrderCancelledHandler.name)

  @HandleEvent('OrderCancelled')
  public async handle(event: { orderId: string; reason: string }): Promise<void> {
    this.logger.log({ message: '주문 취소 이벤트 수신', order_id: event.orderId })
    // 후속 처리: 환불 요청, 알림 발송, 재고 복원 등
  }
}
```

### 디렉토리 구조

```
src/
  outbox/
    outbox-module.ts                 ← OutboxModule (@Global)
    outbox.entity.ts                 ← Outbox 테이블 Entity
    outbox-writer.ts                 ← 트랜잭션 안에서 이벤트 저장 (Repository에서 호출)
    outbox-relay.ts                  ← Outbox → SQS 전송 (폴링)
    event-consumer.ts                ← SQS → EventHandler 수신 (폴링)
    event-handler-registry.ts        ← eventType → Handler 라우팅
  <domain>/
    domain/
      <domain-event>.ts              ← Domain Event 정의
    application/
      event/
        <domain-event>-handler.ts    ← EventHandler (@HandleEvent 데코레이터)
```

### Module 등록

```typescript
// outbox/outbox-module.ts
import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { EventConsumer } from '@/outbox/event-consumer'
import { EventHandlerRegistry } from '@/outbox/event-handler-registry'
import { OutboxEntity } from '@/outbox/outbox.entity'
import { OutboxRelay } from '@/outbox/outbox-relay'
import { OutboxWriter } from '@/outbox/outbox-writer'

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEntity])],
  providers: [OutboxWriter, OutboxRelay, EventConsumer, EventHandlerRegistry],
  exports: [OutboxWriter]
})
export class OutboxModule {}
```

```typescript
// app-module.ts
import { ScheduleModule } from '@nestjs/schedule'

import { DatabaseModule } from '@/database/database-module'
import { OutboxModule } from '@/outbox/outbox-module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    OutboxModule,
    // ...도메인 모듈
  ]
})
export class AppModule {}

// order-module.ts
@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, OrderItemEntity])],
  providers: [OrderCommandService, OrderCancelledHandler, ...]
})
export class OrderModule {}
```

### LocalStack + Docker Compose

```bash
# localstack/init-aws.sh — SQS 큐 생성 추가
awslocal sqs create-queue --queue-name domain-events
```

```env
# .env.development — SQS 큐 URL 추가
SQS_DOMAIN_EVENT_QUEUE_URL=http://localhost:4566/000000000000/domain-events
```

### 이벤트 핸들러 멱등성

SQS는 at-least-once 전달을 보장한다. 같은 메시지가 **중복 수신**될 수 있으므로 모든 EventHandler는 **멱등(idempotent)** 하게 구현해야 한다.

> **참고**: Task Queue의 `@TaskConsumer`에도 동일한 at-least-once 전제가 적용되며, 그쪽은 **프레임워크 레벨 ledger(`idempotencyKey` 옵션)**·**Level 3 강한 원자성** 등 3단계 모델을 제공한다. EventHandler와 Task Controller 모두에 공통되는 패턴이며 자세한 구조는 [scheduling.md — 멱등성](./scheduling.md#멱등성)을 참조한다. EventHandler도 부작용 큰 경우 (재결제·외부 API 호출 등) 동일한 ledger 전략 적용을 권장한다.

```typescript
// 올바른 방식 — 멱등한 핸들러
@HandleEvent('OrderCancelled')
public async handle(event: { orderId: string }): Promise<void> {
  const refund = await this.refundRepository
    .findRefunds({ orderId: event.orderId, take: 1, page: 0 })
    .then((r) => r.refunds.pop())
  if (refund) return  // 이미 처리됨 — 중복 실행 방지
  await this.refundRepository.saveRefund(new Refund({ orderId: event.orderId, ... }))
}

// 잘못된 방식 — 멱등하지 않은 핸들러
@HandleEvent('OrderCancelled')
public async handle(event: { orderId: string }): Promise<void> {
  await this.refundRepository.saveRefund(new Refund({ orderId: event.orderId, ... }))
}
```

### Outbox 테이블 정리

`processed: true`인 이벤트는 일정 기간 후 삭제한다 (OutboxRelay의 cleanup 메서드, 기본 7일).

### 원칙

- **이벤트는 Aggregate 내부에서만 생성한다**: 도메인 메서드가 이벤트 객체를 `_events`에 추가한다.
- **Repository.save()에서 Aggregate + Outbox를 함께 저장한다**: Command Service는 outbox를 직접 다루지 않는다.
- **Outbox → SQS → EventHandler 순서로 전달한다**: 이벤트 발행의 각 단계가 독립적이다.
- **EventHandler는 멱등하게 구현한다**: SQS at-least-once 전달 특성에 대비한다.
- **EventHandler는 application/event/에 배치한다**: `@HandleEvent` 데코레이터로 eventType을 지정한다.
