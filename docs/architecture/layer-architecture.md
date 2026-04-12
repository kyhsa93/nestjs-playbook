# 레이어 아키텍처

### 의존 방향

```
Interface (Controller)  →  Application (Service)  →  Domain (Aggregate, Repository 인터페이스)
                                                          ↑
                                                   Infrastructure (Repository 구현체)
```

- 상위 레이어는 하위 레이어에 의존할 수 있지만, 하위 레이어는 상위 레이어에 의존하지 않는다.
- Domain 레이어는 어떤 레이어에도 의존하지 않는다 (프레임워크, ORM 포함).
- Infrastructure 레이어는 Domain 레이어의 인터페이스를 구현한다 (의존성 역전).

### Domain 레이어 역할

도메인 레이어는 비즈니스 규칙의 핵심이다. 프레임워크에 의존하지 않는 순수 TypeScript로 작성한다.

> **프레임워크 무의존 원칙**: Domain 레이어에는 `@Injectable`, `@Module` 등 NestJS 데코레이터를 사용하지 않는다. 단, 에러 메시지 enum(`@/order/order-error-message`)은 import하여 참조한다.
> Application 레이어(Query/Result/Command)는 `@ApiProperty`, `class-validator` 등 NestJS/Swagger 데코레이터를 사용할 수 있다.

1. **Aggregate Root** — 비즈니스 규칙과 불변식을 캡슐화한다. 상태 변경은 반드시 Aggregate Root의 메서드를 통해서만 수행한다.
2. **Entity** — 고유 식별자를 가지며 생명주기가 있는 객체.
3. **Value Object** — 불변 객체. 속성의 조합으로 동등성을 판단한다. `equals()` 메서드를 구현하여 속성 기반 비교를 지원한다.
4. **Domain Event** — 도메인에서 발생한 중요한 사건을 나타내는 데이터 클래스.
5. **Repository 인터페이스** — Aggregate Root 단위로 정의한 abstract class. 구현은 Infrastructure 레이어에 배치한다.

```typescript
// domain/order.ts — Aggregate Root 예시 (프레임워크 무의존)
import { OrderCancelled } from '@/order/domain/order-cancelled'
import { OrderItem } from '@/order/domain/order-item'
import { OrderErrorMessage } from '@/order/order-error-message'

export type OrderDomainEvent = OrderCancelled

export class Order {
  public readonly orderId: string
  public readonly userId: string
  public readonly items: OrderItem[]
  private _status: 'pending' | 'paid' | 'cancelled'
  private readonly _events: OrderDomainEvent[] = []

  constructor(params: { orderId: string; userId: string; items: OrderItem[]; status: 'pending' | 'paid' | 'cancelled' }) {
    if (params.items.length === 0) throw new Error(OrderErrorMessage['주문 항목은 최소 1개 이상이어야 합니다.'])
    this.orderId = params.orderId
    this.userId = params.userId
    this.items = params.items
    this._status = params.status
  }

  get status(): 'pending' | 'paid' | 'cancelled' { return this._status }
  get domainEvents(): OrderDomainEvent[] { return [...this._events] }

  public cancel(reason: string): void {
    if (this._status === 'cancelled') throw new Error(OrderErrorMessage['이미 취소된 주문입니다.'])
    if (this._status === 'paid') throw new Error(OrderErrorMessage['결제 완료된 주문은 취소할 수 없습니다.'])
    this._status = 'cancelled'
    this._events.push(new OrderCancelled({ orderId: this.orderId, reason, cancelledAt: new Date() }))
  }

  public clearEvents(): void { this._events.length = 0 }
}
```

```typescript
// domain/order-repository.ts — Repository 인터페이스 (abstract class)
export abstract class OrderRepository {
  abstract saveOrder(order: Order): Promise<void>
  abstract findOrders(query: {
    readonly take: number
    readonly page: number
    readonly orderId?: string
    readonly userId?: string
    readonly status?: string[]
  }): Promise<{ orders: Order[]; count: number }>
  abstract deleteOrder(orderId: string): Promise<void>
}
```

### Application 레이어 역할 — 조율자

Application Service는 **Command Service**와 **Query Service**로 분리한다.

#### Command Service (쓰기)

데이터를 변경하는 유스케이스를 담당한다. Repository를 주입받아 Aggregate를 조회/저장한다. 비즈니스 로직은 직접 수행하지 않고 Aggregate에 위임한다.

1. Repository에서 Aggregate 조회
2. Aggregate의 도메인 메서드 호출 (비즈니스 로직은 Aggregate에 위임)
3. Repository로 Aggregate 저장 (Repository 내부에서 Aggregate + outbox를 같은 트랜잭션으로 저장)
4. 트랜잭션 관리

```typescript
// application/command/order-command-service.ts
import { Injectable } from '@nestjs/common'

import { TransactionManager } from '@/database/transaction-manager'
import { CancelOrderCommand } from '@/order/application/command/cancel-order-command'
import { OrderRepository } from '@/order/domain/order-repository'
import { PaymentRepository } from '@/order/domain/payment-repository'
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'

@Injectable()
export class OrderCommandService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly transactionManager: TransactionManager
  ) {}

  public async cancelOrder(command: CancelOrderCommand): Promise<void> {
    const order = await this.orderRepository
      .findOrders({ orderId: command.orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

    order.cancel(command.reason)

    // Repository.saveOrder() 내부에서 Aggregate + outbox를 함께 저장
    await this.transactionManager.run(async () => {
      await this.paymentRepository.deletePaymentMethods(order.orderId)
      await this.orderRepository.saveOrder(order)
    })
  }
}
```

#### Query Service (읽기)

데이터를 조회하는 유스케이스를 담당한다. Repository를 직접 사용하지 않고, application 레이어의 **Query 인터페이스**(abstract class)를 주입받는다. Query 구현체는 infrastructure 레이어에 배치한다.

```typescript
// application/query/order-query.ts — Query 인터페이스 (abstract class)
export abstract class OrderQuery {
  abstract getOrders(query: GetOrdersQuery): Promise<GetOrdersResult>
  abstract getOrder(query: GetOrderQuery): Promise<GetOrderResult>
}
```

```typescript
// application/query/order-query-service.ts
import { Injectable } from '@nestjs/common'

import { OrderQuery } from '@/order/application/query/order-query'
import { GetOrdersQuery } from '@/order/application/query/get-orders-query'
import { GetOrdersResult } from '@/order/application/query/get-orders-result'

@Injectable()
export class OrderQueryService {
  constructor(private readonly orderQuery: OrderQuery) {}

  public async getOrders(query: GetOrdersQuery): Promise<GetOrdersResult> {
    return this.orderQuery.getOrders(query)
  }
}
```

```typescript
// infrastructure/order-query-impl.ts — Query 구현체 (DB 직접 접근)
import { Injectable } from '@nestjs/common'

import { OrderQuery } from '@/order/application/query/order-query'
import { GetOrdersQuery } from '@/order/application/query/get-orders-query'
import { GetOrdersResult } from '@/order/application/query/get-orders-result'

@Injectable()
export class OrderQueryImpl extends OrderQuery {
  constructor(private readonly dataSource: DataSource) {
    super()
  }

  public async getOrders(query: GetOrdersQuery): Promise<GetOrdersResult> {
    // DB에서 직접 조회 — Aggregate 복원 불필요, 읽기에 최적화된 쿼리 사용
  }
}
```

#### Module DI 구성

```typescript
// order-module.ts
providers: [
  { provide: OrderRepository, useClass: OrderRepositoryImpl },
  { provide: OrderQuery, useClass: OrderQueryImpl },
  OrderCommandService,
  OrderQueryService,
]
```

#### Command/Query 분리 원칙

- **Repository**는 Command Service에서만 사용한다. Aggregate 단위의 조회/저장을 담당한다.
- **Query 인터페이스**는 Query Service에서만 사용한다. 읽기에 최적화된 조회를 담당하며, Aggregate 복원이 불필요하다.
- Controller에서는 쓰기 요청은 Command Service를, 읽기 요청은 Query Service를 호출한다.

### Infrastructure 레이어 역할

1. **Repository 구현체** — Domain 레이어의 abstract class를 구현한다. ORM 클라이언트를 직접 사용하는 유일한 레이어.
2. **이벤트 발행** — 메시지 큐 연동, 이벤트 직렬화.
3. **외부 시스템 어댑터** — Anticorruption Layer. 외부 API 응답을 도메인 모델로 변환.

```typescript
// infrastructure/order-repository-impl.ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { TransactionManager } from '@/database/transaction-manager'
import { OutboxWriter } from '@/outbox/outbox-writer'
import { Order } from '@/order/domain/order'
import { OrderItem } from '@/order/domain/order-item'
import { OrderRepository } from '@/order/domain/order-repository'
import { OrderEntity } from '@/order/infrastructure/entity/order.entity'
import { OrderItemEntity } from '@/order/infrastructure/entity/order-item.entity'

@Injectable()
export class OrderRepositoryImpl extends OrderRepository {
  constructor(
    @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity) private readonly orderItemRepo: Repository<OrderItemEntity>,
    private readonly transactionManager: TransactionManager,
    private readonly outboxWriter: OutboxWriter
  ) {
    super()
  }

  public async findOrders(query: {
    readonly take: number
    readonly page: number
    readonly orderId?: string
    readonly userId?: string
    readonly status?: string[]
  }): Promise<{ orders: Order[]; count: number }> {
    const qb = this.orderRepo.createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .orderBy('order.orderId', 'DESC')
      .take(query.take)
      .skip(query.page * query.take)

    if (query.orderId) qb.andWhere('order.orderId = :orderId', { orderId: query.orderId })
    if (query.userId) qb.andWhere('order.userId = :userId', { userId: query.userId })
    if (query.status?.length) qb.andWhere('order.status IN (:...status)', { status: query.status })

    const [rows, count] = await qb.getManyAndCount()

    // DB 엔티티 → 도메인 Aggregate로 변환
    return {
      orders: rows.map((row) => new Order({
        orderId: row.orderId,
        userId: row.userId,
        items: row.items.map((i) => new OrderItem(i)),
        status: row.status
      })),
      count
    }
  }

  public async saveOrder(order: Order): Promise<void> {
    const manager = this.transactionManager.getManager()
    await manager.save(OrderEntity, {
      orderId: order.orderId,
      userId: order.userId,
      status: order.status,
      items: order.items.map((i) => ({
        itemId: i.itemId,
        name: i.name,
        price: i.price,
        quantity: i.quantity
      }))
    })
    // 도메인 이벤트가 있으면 outbox에 함께 저장 (같은 트랜잭션)
    if (order.domainEvents.length > 0) {
      await this.outboxWriter.saveAll(order.domainEvents)
      order.clearEvents()
    }
  }

  public async deleteOrder(orderId: string): Promise<void> {
    const manager = this.transactionManager.getManager()
    // cascade: 하위 엔티티 먼저 삭제
    await manager.softDelete(OrderItemEntity, { orderId })
    await manager.softDelete(OrderEntity, { orderId })
  }
}
```

### Interface 레이어 역할

Interface 레이어는 REST API 진입점을 제공한다.

#### Controller

1. 요청 수신
2. Command Service 또는 Query Service 호출
3. `.catch()` 로 에러 캐치 → HTTP 예외로 변환

```typescript
// interface/order-controller.ts
@Controller()
@ApiBearerAuth('token')
@ApiTags('Order')
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
export class OrderController {
  private readonly logger = new Logger(OrderController.name)

  constructor(
    private readonly orderCommandService: OrderCommandService,
    private readonly orderQueryService: OrderQueryService
  ) {}

  @Get('/orders/:orderId')
  @ApiOperation({ operationId: 'getOrder' })
  @ApiOkResponse({ type: GetOrderResponseBody })
  public async getOrder(
    @Param() param: GetOrderRequestParam
  ): Promise<GetOrderResponseBody> {
    return this.orderQueryService.getOrder(param).catch((error) => {
      this.logger.error(error)
      throw generateErrorResponse(error.message, [
        [OrderErrorMessage['주문을 찾을 수 없습니다.'], NotFoundException]
      ])
    })
  }
}
```

### Interface DTO

#### REST DTO = Application 객체의 thin wrapper

Interface DTO는 Application 레이어의 Query/Result/Command를 `extends`로 감싼다. 별도 로직이나 데코레이터를 추가하지 않는다.

```typescript
// interface/dto/get-orders-request-querystring.ts
import { GetOrdersQuery } from '@/order/application/query/get-orders-query'
export class GetOrdersRequestQuerystring extends GetOrdersQuery {}

// interface/dto/get-orders-response-body.ts
import { GetOrdersResult } from '@/order/application/query/get-orders-result'
export class GetOrdersResponseBody extends GetOrdersResult {}
```
