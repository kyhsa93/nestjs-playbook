# 도메인 이벤트 발행 패턴

### 개념 구분 — Domain Event vs Integration Event

**Domain Event**: 같은 Bounded Context 내부 사건. Aggregate 내부 상태 변화의 결과. 구조가 자유롭게 변하며 외부 BC와 결합되지 않는다.
- 생성: Aggregate 도메인 메서드 내부에서 `_events.push(new OrderCancelled(...))`
- 저장: Repository에서 Outbox에 적재
- 수신: 같은 BC의 `application/event/<domain-event>-handler.ts` (`@HandleEvent`)

**Integration Event**: 외부 BC · 외부 시스템과의 **공개 계약**. 이름·스키마가 안정적이어야 하며 버전을 명시한다(`order.cancelled.v1`). 소비 측이 의존할 수 있는 유일한 접점.
- 생성: **Application EventHandler**가 Domain Event를 수신한 뒤 필요 시 변환하여 Outbox에 적재 (Aggregate가 직접 만들지 않는다)
- 수신: 외부 BC가 발행한 Integration Event는 같은 BC 입장에서 **외부 입력**이므로 `interface/integration-event/<domain>-integration-event-controller.ts`에서 수신 (HTTP Controller · Task Controller와 같은 Interface 입력 어댑터)

둘을 구분하지 않으면 BC 간 결합이 커지고 내부 이벤트 리팩토링이 외부 consumer를 깨뜨린다.

### 전체 흐름

```
[1. 도메인 로직 실행]
  Command Service → Aggregate 도메인 메서드 호출 → Aggregate 내부에 Domain Event 객체 수집

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

[4. SQS → EventHandler 수신 (같은 BC의 Domain Event 처리)]
  EventConsumer: SQS 큐에서 메시지를 수신 (폴링)
    → eventType에 따라 application/event/ 내부 EventHandler 호출
    → 후속 처리 실행 (같은 BC 내 상태 조정, 로깅 등)

[5. (선택) Integration Event 발행 — Application EventHandler가 변환]
  EventHandler가 Domain Event를 외부 BC로 알려야 할 때:
    → IntegrationEventV1 객체를 구성
    → OutboxWriter로 외부 SQS 큐용 outbox에 적재
    → 이후 3단계와 동일하게 Relay → SQS → 외부 BC

[6. 외부 BC의 Integration Event 수신 — Interface Integration Event Controller]
  다른 BC가 발행한 Integration Event가 자기 BC에 들어올 때:
    → interface/integration-event/<domain>-integration-event-controller.ts
    → @HandleIntegrationEvent('order.cancelled.v1') 메서드가 수신
    → Command Service를 호출하여 자기 도메인의 유스케이스 실행
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
    outbox-writer.ts                 ← 트랜잭션 안에서 이벤트 저장 (Repository · Application EventHandler에서 호출)
    outbox-relay.ts                  ← Outbox → SQS 전송 (폴링)
    event-consumer.ts                ← SQS → Handler 라우팅 (폴링)
    event-handler-registry.ts        ← eventType → Handler 라우팅 (@HandleEvent · @HandleIntegrationEvent)
  <domain>/
    domain/
      <domain-event>.ts              ← Domain Event 정의 (내부용, 버저닝 없음)
    application/
      event/
        <domain-event>-handler.ts    ← Domain EventHandler (@HandleEvent)
      integration-event/
        <name>-integration-event.ts  ← Integration Event 정의 (외부 공개 계약, V1 등 버전)
    interface/
      integration-event/
        <domain>-integration-event-controller.ts  ← 외부 BC Integration Event 수신 (@HandleIntegrationEvent)
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

### Integration Event 정의 — 외부 BC용 공개 계약

Integration Event는 **application/integration-event/**에 정의한다. Domain Event와 분리된 공개 계약이므로 이름에 **버전 접미사(V1 등)**을 붙이고 스키마는 의도적으로 평탄하게 설계한다 (내부 Aggregate 구조 노출 금지).

```typescript
// order/application/integration-event/order-cancelled-integration-event.ts
export class OrderCancelledIntegrationEventV1 {
  public readonly eventName = 'order.cancelled.v1' as const
  constructor(
    public readonly orderId: string,
    public readonly cancelledAt: string,
    public readonly reason: string
  ) {}
}
```

파일·클래스 네이밍:
- 파일: `<name>-integration-event.ts` (application/integration-event/)
- 클래스: `<Name>IntegrationEventV1`, 스키마 변경 시 `V2` 추가 (V1은 호환 유지 기간 동안 함께 발행)
- eventName 리터럴: `<domain>.<verb-past>.v<N>` — SQS 메시지 eventType으로 사용

### Integration Event 발행 — Application EventHandler

같은 BC의 Domain Event를 수신한 EventHandler가 외부 BC에 알릴 필요가 있을 때 Integration Event를 구성하여 Outbox에 적재한다. **EventHandler는 Application 레이어에서 OutboxWriter를 직접 사용할 수 있는 유일한 예외**이다 (Command Service는 여전히 금지).

```typescript
// order/application/event/order-cancelled-handler.ts
import { Injectable, Logger } from '@nestjs/common'

import { HandleEvent } from '@/outbox/event-handler-registry'
import { OutboxWriter } from '@/outbox/outbox-writer'
import { OrderCancelledIntegrationEventV1 } from '@/order/application/integration-event/order-cancelled-integration-event'

@Injectable()
export class OrderCancelledHandler {
  private readonly logger = new Logger(OrderCancelledHandler.name)

  constructor(private readonly outboxWriter: OutboxWriter) {}

  @HandleEvent('OrderCancelled')
  public async handle(event: { orderId: string; reason: string; cancelledAt: string }): Promise<void> {
    this.logger.log({ message: '주문 취소 Domain Event 수신', order_id: event.orderId })
    // 같은 BC 내 후속 처리가 있다면 여기서 수행 (Command Service 호출 등)

    // 외부 BC에 알리는 경우 Integration Event로 변환하여 발행
    await this.outboxWriter.saveAll([
      new OrderCancelledIntegrationEventV1(event.orderId, event.cancelledAt, event.reason)
    ])
  }
}
```

> Domain Event 자체를 그대로 외부에 전달하지 않는다. 내부 스키마 변경이 외부 consumer를 깨뜨린다. EventHandler가 변환 지점이다.

### Integration Event 수신 — Interface Integration Event Controller

외부 BC가 발행한 Integration Event가 자기 BC에 도착하면 **Interface 레이어의 Integration Event Controller**에서 받는다. HTTP Controller · Task Controller와 같은 입력 어댑터로 취급한다.

```typescript
// payment/interface/integration-event/payment-integration-event-controller.ts
import { Injectable, Logger } from '@nestjs/common'

import { HandleIntegrationEvent } from '@/outbox/event-handler-registry'
import { PaymentCommandService } from '@/payment/application/command/payment-command-service'

@Injectable()
export class PaymentIntegrationEventController {
  private readonly logger = new Logger(PaymentIntegrationEventController.name)

  constructor(private readonly paymentCommandService: PaymentCommandService) {}

  @HandleIntegrationEvent('order.cancelled.v1')
  public async onOrderCancelled(event: { orderId: string; cancelledAt: string; reason: string }): Promise<void> {
    this.logger.log({ message: 'order.cancelled.v1 수신', order_id: event.orderId })
    await this.paymentCommandService.refundForCancelledOrder({ orderId: event.orderId, reason: event.reason })
  }
}
```

파일·클래스 네이밍:
- 파일: `<domain>-integration-event-controller.ts` (interface/integration-event/)
- 클래스: `<Domain>IntegrationEventController`
- 데코레이터: `@HandleIntegrationEvent('<event-name>.v<N>')` — Domain Event용 `@HandleEvent`와 구분

Task Controller와 동일하게 예외는 그대로 throw하여 EventConsumer / Relay가 재시도 · DLQ 처리를 담당한다. Controller에서 `generateErrorResponse`를 쓰지 않는다.

### 원칙

- **Domain Event는 Aggregate 내부에서만 생성한다**: 도메인 메서드가 이벤트 객체를 `_events`에 추가한다.
- **Integration Event는 Aggregate가 직접 만들지 않는다**: Application EventHandler가 Domain Event를 변환하여 Outbox에 적재한다.
- **Repository.save()에서 Aggregate + Outbox를 함께 저장한다**: Command Service는 outbox를 직접 다루지 않는다.
- **Outbox → SQS → Handler 순서로 전달한다**: 이벤트 발행의 각 단계가 독립적이다.
- **Handler는 멱등하게 구현한다**: SQS at-least-once 전달 특성에 대비한다.
- **Domain Event Handler는 application/event/에 배치한다**: `@HandleEvent` 데코레이터로 eventType을 지정한다.
- **Integration Event Controller는 interface/integration-event/에 배치한다**: `@HandleIntegrationEvent`로 버전이 포함된 이벤트명을 지정하고, Command Service를 호출해 자기 BC의 유스케이스만 실행한다.
- **Integration Event는 버저닝한다**: `V1`/`order.cancelled.v1` 식으로 공개 계약을 명시하고 호환 유지 기간 동안 구·신 버전을 함께 발행한다.
