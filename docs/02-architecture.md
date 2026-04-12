# 아키텍처 가이드

## 1. 디렉토리 구조 — 도메인 우선 + 4레이어 분리

```
src/
  database/                            # 데이터베이스 모듈
    database-module.ts
    base.entity.ts                     # 공통 컬럼 (createdAt, updatedAt, deletedAt)
    data-source.ts                     # TypeORM DataSource 설정
    transaction-manager.ts             # 트랜잭션 매니저 (AsyncLocalStorage 기반)
  outbox/                              # Outbox 모듈
    outbox-module.ts
    outbox.entity.ts                   # Outbox 테이블 Entity
    outbox-writer.ts                   # 트랜잭션 안에서 이벤트 저장
    outbox-processor.ts                # 폴링으로 미발행 이벤트 발행
    domain-event-publisher.ts          # 이벤트를 핸들러에 전달
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
      <domain>-controller.ts              # Controller
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
    <domain>-module.ts
    <domain>-error-message.ts
    <domain>-enum.ts
    <domain>-constant.ts
```

---

## 2. 레이어 아키텍처

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
3. Repository로 Aggregate 저장
4. Domain Event 발행
5. 트랜잭션 관리

```typescript
// application/command/order-command-service.ts
import { Injectable } from '@nestjs/common'

import { OutboxWriter } from '@/outbox/outbox-writer'
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
    private readonly transactionManager: TransactionManager,
    private readonly outboxWriter: OutboxWriter
  ) {}

  public async cancelOrder(command: CancelOrderCommand): Promise<void> {
    // 1. Aggregate 조회
    const order = await this.orderRepository
      .findOrders({ orderId: command.orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

    // 2. 도메인 메서드 호출 (Aggregate 내부에서 이벤트 수집)
    order.cancel(command.reason)

    // 3. Aggregate 저장 + 이벤트 outbox 저장을 같은 트랜잭션으로
    await this.transactionManager.run(async () => {
      await this.paymentRepository.deletePaymentMethods(order.orderId)
      await this.orderRepository.saveOrder(order)
      await this.outboxWriter.saveAll(order.domainEvents)
    })
    order.clearEvents()
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
    private readonly transactionManager: TransactionManager
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

---

## 3. Repository 패턴

### Aggregate Root 단위 Repository

- **1 Aggregate Root = 1 Repository 인터페이스 + 1 Repository 구현체**
- 인터페이스(abstract class)는 `domain/` 레이어에, 구현체는 `infrastructure/` 레이어에 배치한다.
- Aggregate 내부의 하위 Entity는 Aggregate Root의 Repository를 통해 함께 저장/조회한다.

```
src/
  order/
    domain/
      order-repository.ts          ← abstract class (인터페이스)
    infrastructure/
      order-repository-impl.ts     ← extends OrderRepository (구현체)
```

### NestJS DI 연결

Module에서 abstract class를 토큰으로 사용하여 구현체를 주입한다:

```typescript
// order-module.ts
@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, OrderItemEntity])],
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    { provide: PaymentRepository, useClass: PaymentRepositoryImpl }
  ]
})
export class OrderModule {}
```

Service에서는 abstract class 타입으로 주입받는다:

```typescript
constructor(private readonly orderRepository: OrderRepository) {}
```

### Repository 메서드 네이밍 규칙

| 목적 | 메서드명 패턴 | 예시 |
|------|--------------|------|
| 목록 조회 | `find<Noun>s` | `findOrders`, `findUsers` |
| 저장/업서트 | `save<Noun>` | `saveOrder`, `saveUser` |
| 삭제 | `delete<Noun>` | `deleteOrder`, `deleteUser` |

- **조회는 항상 `find<Noun>s` 하나만** — 단건/목록 구분 없이 목록 조회 메서드를 사용
- 단건 조회 시 Service에서 `take: 1`로 호출 후 `.then(r => r.<noun>s.pop())` 패턴 사용
- **Repository에 수정(update) 메서드 금지** — 조회 후 Aggregate의 도메인 메서드로 수정, `save<Noun>`으로 저장

### 도메인 경계 — Mapping Table 양방향 접근

두 도메인 사이의 경계는 **mapping table**로 정의한다.
mapping table은 연결된 **양쪽 도메인 Repository 구현체 모두**에서 조회/저장/삭제할 수 있어야 한다.
각 Repository 구현체는 **자신의 도메인 식별자**로 mapping table에 접근한다.

```
user ──── userGroupMap ──── group ──── groupRoleMap ──── role
   user 측 식별자: userId          group 측 식별자: groupId
   group 측 식별자: groupId         role 측 식별자: roleId
```

### Repository의 Cascade 저장/삭제

`save<Noun>` / `delete<Noun>` 호출 시 Repository 구현체 내부에서 **하위 엔티티와 연결된 mapping table을 함께 처리**한다.
Service는 cascade 순서를 직접 관리하지 않고, 도메인 단위의 단일 메서드만 호출한다.

```typescript
// infrastructure/group-repository-impl.ts 내부
public async deleteGroup(groupId: string): Promise<void> {
  const manager = this.transactionManager.getManager()
  // FK 참조 순서: mapping tables 먼저 → main entity 순으로 삭제
  await manager.softDelete(GroupRoleMapEntity, { groupId })
  await manager.softDelete(UserGroupMapEntity, { groupId })
  await manager.softDelete(GroupEntity, { groupId })
}
```

---

## 4. NestJS 모듈 패턴

### 도메인 기준 모듈 구성 원칙

NestJS 모듈은 **Bounded Context(도메인)** 단위로 구성한다. 기술 레이어(controller, service, repository)가 아닌 비즈니스 도메인이 모듈 분리의 기준이다.

```
src/
  order/                 ← OrderModule — 주문 도메인의 모든 레이어를 포함
    domain/
    application/
    interface/
    infrastructure/
    order-module.ts
  user/                  ← UserModule — 사용자 도메인의 모든 레이어를 포함
    domain/
    application/
    interface/
    infrastructure/
    user-module.ts
  payment/               ← PaymentModule — 결제 도메인
    ...
    payment-module.ts
  common/                ← 공유 유틸 (모듈 아님)
  database/              ← DatabaseModule — TypeORM DataSource, TransactionManager (@Global)
  outbox/                ← OutboxModule — OutboxWriter, OutboxProcessor, DomainEventPublisher (@Global)
  auth/                  ← AuthModule — 인증 공유 모듈
  app-module.ts          ← 루트 모듈: 도메인 모듈 조합
```

**원칙:**
- **1 Bounded Context = 1 NestJS Module**: 주문, 사용자, 결제 등 도메인 단위로 모듈을 나눈다.
- **모듈 내에 4개 레이어(domain/application/interface/infrastructure)를 포함**한다. 레이어별로 모듈을 나누지 않는다.
- **모듈 간 직접 의존을 최소화**한다. 다른 도메인의 데이터가 필요하면 해당 모듈을 `imports`하고 `exports`된 서비스를 사용한다.
- **공유 인프라**(TypeORM DataSource, AuthGuard 등)는 별도 모듈로 분리하여 필요한 도메인 모듈에서 주입받는다.

### 루트 모듈 — 도메인 모듈 조합

```typescript
// app-module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AuthModule } from '@/auth/auth-module'
import { validateConfig } from '@/config/config-validator'
import { databaseConfig } from '@/config/database.config'
import { jwtConfig } from '@/config/jwt.config'
import { s3Config } from '@/config/s3.config'
import { OrderModule } from '@/order/order-module'
import { PaymentModule } from '@/payment/payment-module'
import { UserModule } from '@/user/user-module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, s3Config],
      validate: validateConfig,
    }),
    AuthModule,
    OrderModule,
    UserModule,
    PaymentModule,
    ...(process.env.NODE_ENV === 'prd' ? [] : [DevToolModule])
  ]
})
export class AppModule {}
```

### 모듈 간 의존 — Adapter를 통한 외부 도메인 호출

다른 도메인의 기능이 필요할 때, **해당 도메인의 Service나 Repository를 직접 주입하지 않는다.** 대신 Application 레이어에 Adapter 인터페이스(abstract class)를 정의하고, Infrastructure 레이어에서 실제 외부 도메인 모듈을 호출하는 구현체를 작성한다.

**이유:**
- Application 레이어가 외부 도메인의 구체적인 Service/Repository 타입에 의존하지 않는다.
- 외부 도메인의 내부 구조가 변경되어도 Adapter 구현체만 수정하면 된다.
- 테스트 시 Adapter를 mock하여 외부 도메인 의존 없이 단위 테스트할 수 있다.

```
[Order 도메인]                                [User 도메인]
  application/                                  application/
    adapter/                                      user-service.ts
      user-adapter.ts (abstract class)
    order-service.ts (UserAdapter 주입)
  infrastructure/
    user-adapter-impl.ts (UserService 호출)  ←imports→  UserModule
```

**Step 1 — Application 레이어에 Adapter 인터페이스 정의**

```typescript
// order/application/adapter/user-adapter.ts — abstract class
export abstract class UserAdapter {
  abstract findUsers(query: {
    readonly take: number
    readonly page: number
    readonly userId?: string
  }): Promise<{ users: { userId: string; name: string }[]; count: number }>
}
```

- Adapter 인터페이스는 **호출하는 쪽(Order 도메인)이 필요로 하는 형태**로 정의한다.
- 외부 도메인의 전체 API를 노출하지 않고, 필요한 메서드만 정의한다.
- 조회 메서드 네이밍은 Repository와 동일하게 `find<Noun>s` 패턴을 따른다. 단건 조회 시 `take: 1` + `.then(r => r.<noun>s.pop())` 패턴을 사용한다.

**Step 2 — Infrastructure 레이어에 Adapter 구현체 작성**

```typescript
// order/infrastructure/user-adapter-impl.ts
import { Injectable } from '@nestjs/common'

import { UserAdapter } from '@/order/application/adapter/user-adapter'
import { UserService } from '@/user/application/user-service'

@Injectable()
export class UserAdapterImpl extends UserAdapter {
  constructor(private readonly userService: UserService) {}

  public async findUsers(query: {
    readonly take: number
    readonly page: number
    readonly userId?: string
  }): Promise<{ users: { userId: string; name: string }[]; count: number }> {
    return this.userService.getUsers(query)
  }
}
```

- 구현체에서 외부 도메인의 `exports`된 Service를 주입받아 호출한다.
- 외부 도메인의 응답을 Adapter 인터페이스가 정의한 형태로 변환한다.

**Step 3 — Application Service에서 Adapter 사용**

```typescript
// order/application/order-service.ts
@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly userAdapter: UserAdapter
  ) {}

  public async getOrderWithUser(param: { orderId: string }): Promise<GetOrderWithUserResult> {
    const order = await this.orderRepository
      .findOrders({ orderId: param.orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

    const user = await this.userAdapter
      .findUsers({ userId: order.userId, take: 1, page: 0 })
      .then((r) => r.users.pop())

    return { orderId: order.orderId, status: order.status, userName: user?.name ?? null }
  }
}
```

**Step 4 — Module 등록**

```typescript
// user/user-module.ts — UserService를 exports
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [UserController],
  providers: [
    UserService,
    { provide: UserRepository, useClass: UserRepositoryImpl }
  ],
  exports: [UserService]
})
export class UserModule {}

// order/order-module.ts — UserModule imports + Adapter DI 연결
@Module({
  imports: [UserModule, TypeOrmModule.forFeature([OrderEntity, OrderItemEntity])],
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    { provide: UserAdapter, useClass: UserAdapterImpl }
  ]
})
export class OrderModule {}
```

> **주의**: 모듈 간 순환 의존(A → B → A)이 발생하면 설계를 재검토한다. 순환 의존은 Bounded Context 경계가 잘못 설정되었다는 신호일 수 있다. `forwardRef()`로 우회하기보다 도메인 경계를 재조정하거나, 이벤트 기반 통신으로 전환한다.

### 기술 인프라 Service — 암복호화·외부 API 클라이언트 등의 인터페이스 분리

암복호화, 파일 스토리지, 외부 API 클라이언트 등 **기술적 구현이 핵심인 기능**은 Application 레이어에 Service 인터페이스(abstract class)를 정의하고, Infrastructure 레이어에서 구현체를 제공한다.

**이유:**
- Application Service가 특정 라이브러리·SDK에 직접 의존하지 않는다.
- 구현 기술이 바뀌어도(예: AES → AWS KMS) Service 구현체만 교체하면 된다.
- 테스트 시 Service를 mock하여 외부 의존 없이 단위 테스트할 수 있다.

**Adapter와의 차이:**
- **Adapter**: 다른 도메인의 Service를 호출하기 위한 인터페이스 (도메인 간 통신)
- **기술 인프라 Service**: 기술 인프라 구현을 추상화하기 위한 인터페이스 (기술 관심사 분리)

```
[Order 도메인]
  application/
    service/
      crypto-service.ts (abstract class)     ← 인터페이스 정의
    order-service.ts (CryptoService 주입)
  infrastructure/
    crypto-service-impl.ts (AES 구현)        ← 실제 구현체
```

**Step 1 — Application 레이어에 Service 인터페이스 정의**

```typescript
// order/application/service/crypto-service.ts — abstract class
export abstract class CryptoService {
  abstract encrypt(plainText: string): Promise<string>
  abstract decrypt(cipherText: string): Promise<string>
}
```

- Service 인터페이스는 **사용하는 쪽(Application Service)이 필요로 하는 형태**로 정의한다.
- 구현 기술의 세부사항(알고리즘, 키 관리 등)은 인터페이스에 노출하지 않는다.

**Step 2 — Infrastructure 레이어에 Service 구현체 작성**

```typescript
// order/infrastructure/crypto-service-impl.ts
import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

import { CryptoService } from '@/order/application/service/crypto-service'

@Injectable()
export class CryptoServiceImpl extends CryptoService {
  private readonly algorithm = 'aes-256-gcm'
  private readonly key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')

  public async encrypt(plainText: string): Promise<string> {
    const iv = randomBytes(16)
    const cipher = createCipheriv(this.algorithm, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, encrypted]).toString('base64')
  }

  public async decrypt(cipherText: string): Promise<string> {
    const buf = Buffer.from(cipherText, 'base64')
    const iv = buf.subarray(0, 16)
    const tag = buf.subarray(16, 32)
    const encrypted = buf.subarray(32)
    const decipher = createDecipheriv(this.algorithm, this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }
}
```

**Step 3 — Application Service에서 기술 인프라 Service 사용**

```typescript
// order/application/order-service.ts
@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly cryptoService: CryptoService
  ) {}

  public async createOrder(command: CreateOrderCommand): Promise<void> {
    const encryptedAddress = await this.cryptoService.encrypt(command.address)
    // ...
  }
}
```

**Step 4 — Module 등록**

```typescript
// order/order-module.ts
@Module({
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    { provide: CryptoService, useClass: CryptoServiceImpl }
  ]
})
export class OrderModule {}
```

> **적용 기준**: 단순 유틸 함수(날짜 포맷, 문자열 변환 등)는 기술 인프라 Service로 분리하지 않는다. 외부 시스템 연동이 있거나, 구현 기술이 교체될 가능성이 있는 기술적 관심사에 적용한다.
> 예: 암복호화, 파일 스토리지(S3/GCS), 메시지 큐(SQS/RabbitMQ), 외부 API 클라이언트, SMS/이메일 발송 등.

### 파일 업로드/다운로드 — Presigned URL 패턴

파일을 서버에서 직접 업로드/다운로드하지 않는다. **Presigned URL을 발급하여 클라이언트가 스토리지(S3 등)와 직접 통신**하도록 한다.

**이유:**
- 서버의 네트워크/메모리 부하를 방지한다 (대용량 파일이 서버를 경유하지 않음).
- 서버는 URL 발급과 메타데이터 관리만 담당한다.

#### 흐름

```
[업로드]
1. 클라이언트 → 서버: POST /orders/:orderId/attachments (파일명, 확장자 전달)
2. 서버: 파일 키 생성 → Presigned Upload URL 발급 → DB에 메타데이터 저장
3. 서버 → 클라이언트: { fileKey, extension, uploadUrl }
4. 클라이언트 → 스토리지: PUT uploadUrl (파일 바이너리 직접 업로드)

[다운로드]
1. 클라이언트 → 서버: GET /orders/:orderId/attachments/:fileKey
2. 서버: DB에서 파일 메타데이터 조회 → Presigned Download URL 발급
3. 서버 → 클라이언트: { downloadUrl }
4. 클라이언트 → 스토리지: GET downloadUrl (파일 직접 다운로드)
```

#### StorageService 인터페이스 (application/service/)

```typescript
// application/service/storage-service.ts — abstract class
export abstract class StorageService {
  abstract generateUploadUrl(key: string): Promise<string>
  abstract generateDownloadUrl(key: string): Promise<string>
}
```

#### StorageService 구현체 (infrastructure/)

```typescript
// infrastructure/storage-service-impl.ts — S3 구현 예시
import { Injectable } from '@nestjs/common'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { StorageService } from '@/order/application/service/storage-service'

@Injectable()
export class StorageServiceImpl extends StorageService {
  private readonly s3 = new S3Client({
    ...(process.env.AWS_ENDPOINT ? {
      endpoint: process.env.AWS_ENDPOINT,
      forcePathStyle: true
    } : {})
  })
  private readonly bucket = process.env.S3_BUCKET!

  public async generateUploadUrl(key: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.s3, command, { expiresIn: 3600 })
  }

  public async generateDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.s3, command, { expiresIn: 3600 })
  }
}
```

#### Entity에 파일 메타데이터 저장

파일을 소유하는 Entity는 **파일 키(fileKey)와 확장자(extension)** 를 컬럼으로 가진다. 파일 자체는 스토리지에 저장하고, DB에는 메타데이터만 기록한다.

```typescript
// infrastructure/entity/order-attachment.entity.ts
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm'

import { BaseEntity } from '@/database/base.entity'
import { OrderEntity } from '@/order/infrastructure/entity/order.entity'

@Entity('order_attachment')
export class OrderAttachmentEntity extends BaseEntity {
  @PrimaryColumn({ type: 'char', length: 32 })
  fileKey: string

  @Column({ type: 'char', length: 32 })
  orderId: string

  @Column({ type: 'varchar', length: 10 })
  extension: string

  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'orderId' })
  order: OrderEntity
}
```

- **fileKey**: 스토리지 내의 파일 식별자 (UUID v4 하이픈 제거). Presigned URL 발급 시 이 키를 사용한다.
- **extension**: 파일 확장자 (`pdf`, `png`, `xlsx` 등). 다운로드 시 원본 파일명 복원에 사용한다.
- 파일명, 크기 등 추가 메타데이터가 필요하면 컬럼을 추가한다.

#### Application Service에서 사용

```typescript
public async createAttachment(command: CreateAttachmentCommand): Promise<CreateAttachmentResult> {
  const fileKey = generateId()
  const uploadUrl = await this.storageService.generateUploadUrl(
    `${command.orderId}/${fileKey}.${command.extension}`
  )
  await this.attachmentRepository.saveAttachment({
    fileKey,
    orderId: command.orderId,
    extension: command.extension
  })
  return { fileKey, extension: command.extension, uploadUrl }
}

public async getAttachmentUrl(param: { fileKey: string }): Promise<{ downloadUrl: string }> {
  const attachment = await this.attachmentRepository
    .findAttachments({ fileKey: param.fileKey, take: 1, page: 0 })
    .then((r) => r.attachments.pop())
  if (!attachment) throw new Error(ErrorMessage['파일을 찾을 수 없습니다.'])
  const downloadUrl = await this.storageService.generateDownloadUrl(
    `${attachment.orderId}/${attachment.fileKey}.${attachment.extension}`
  )
  return { downloadUrl }
}
```

#### 원칙

- **서버는 파일 바이너리를 처리하지 않는다**: 업로드/다운로드 모두 Presigned URL을 통해 클라이언트↔스토리지 직접 통신.
- **DB에는 메타데이터만 저장한다**: fileKey, extension, 소유 Entity의 ID.
- **StorageService 인터페이스를 통해 스토리지 구현을 추상화한다**: S3, GCS, MinIO 등 구현체만 교체.

### 모듈 선언 — 최소화, 명시적

```typescript
@Module({
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    AuthService
  ]
})
export class OrderModule {}
```

### 환경 기반 조건부 모듈 로딩

```typescript
// app.module.ts
...(process.env.NODE_ENV === 'prd' ? [] : [DevToolModule])
```

### Controller 데코레이터 패턴 (필수 항목들)

```typescript
@Controller('route-prefix')
@ApiTags('TagName')
@ApiBearerAuth('token')
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
export class OrderController {
  private readonly logger = new Logger(OrderController.name)
  constructor(private readonly orderService: OrderService) {}
}
```

- `@ApiTags()`: Swagger 그룹핑을 위해 항상 사용
- `@ApiBearerAuth('token')`: 인증 필요 컨트롤러에 항상 사용
- `@ApiOperation({ operationId: 'methodName' })`: 코드 제너레이션 지원
- `@ApiOperation({ deprecated: true })`: 구버전 엔드포인트 표시 (삭제 X)
- 가드/인터셉터: 메서드 레벨이 아닌 클래스 레벨에 적용

### @Controller 라우트 접두사 — 예외 케이스

```typescript
// 접두사를 컨트롤러에 일괄 적용하는 경우
@Controller('orders')
export class OrderController {
  @Get()           // → GET /orders
  @Get(':id')      // → GET /orders/:id
}

// 예외 케이스 — 메서드별로 전체 경로를 명시
@Controller()
export class OrderController {
  @Get('/orders')          // → GET /orders
  @Get('/orders/:id')      // → GET /orders/:id
}
```

---

## 5. 에러 처리 패턴

### Controller — catch-and-rethrow

```typescript
return this.service.doSomething(param).catch((error) => {
  this.logger.error(error)
  throw generateErrorResponse(error.message, [
    [ErrorMessage['주문을 찾을 수 없습니다.'], NotFoundException],
    [ErrorMessage['이미 취소된 주문입니다.'], BadRequestException]
  ])
})
```

> `generateErrorResponse`는 에러 메시지 → HTTP 예외 변환을 담당하는 프로젝트 공통 유틸이다.
> ```typescript
> // src/common/generate-error-response.ts
> export function generateErrorResponse(
>   message: string,
>   mappings: [string, new (msg: string) => HttpException][]
> ): HttpException {
>   const matched = mappings.find(([msg]) => msg === message)
>   const [, ExceptionClass] = matched ?? [null, InternalServerErrorException]
>   return new ExceptionClass(message)
> }
> ```

### Domain / Service — plain Error throw (HttpException X)

Domain 레이어와 Application Service에서는 plain `Error`만 throw한다.
에러 메시지는 Aggregate 내부 포함 모든 곳에서 `ErrorMessage` enum을 참조한다.

```typescript
// domain/order.ts — Aggregate 내부에서도 enum 참조
import { OrderErrorMessage } from '@/order/order-error-message'
if (this._status === 'cancelled') throw new Error(OrderErrorMessage['이미 취소된 주문입니다.'])

// application/order-service.ts — Service
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'
if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])
```

### 에러 메시지 — enum으로 정의 (free-form 문자열 X)

```typescript
export enum OrderErrorMessage {
  '주문을 찾을 수 없습니다.' = '주문을 찾을 수 없습니다.',
  '이미 취소된 주문입니다.' = '이미 취소된 주문입니다.',
  '결제 완료된 주문은 취소할 수 없습니다.' = '결제 완료된 주문은 취소할 수 없습니다.',
  '결제 정보를 찾을 수 없습니다.' = '결제 정보를 찾을 수 없습니다.',
  '주문 항목은 최소 1개 이상이어야 합니다.' = '주문 항목은 최소 1개 이상이어야 합니다.',
  '상품 가격은 0보다 커야 합니다.' = '상품 가격은 0보다 커야 합니다.',
  '수량은 0보다 커야 합니다.' = '수량은 0보다 커야 합니다.',
}
```

> 위 enum은 Order 도메인 예시이다. 실제 프로젝트에서는 Domain Service 등에서 사용하는 에러 메시지도 동일한 enum 파일에 추가한다.

### Import alias — 에러 메시지 enum 임포트 시

```typescript
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'
```

### 에러 응답 형식 — 표준 JSON 구조

모든 에러 응답은 아래 형식을 따른다. 클라이언트는 이 형식을 기반으로 에러 처리를 구현한다.

```json
{
  "statusCode": 404,
  "message": "주문을 찾을 수 없습니다.",
  "error": "Not Found"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `statusCode` | `number` | HTTP 상태 코드 |
| `message` | `string` | ErrorMessage enum에 정의된 에러 메시지 |
| `error` | `string` | HTTP 상태 텍스트 |

Validation 실패 시 (class-validator):

```json
{
  "statusCode": 400,
  "message": ["orderId must be a string", "reason must be longer than or equal to 1 characters"],
  "error": "Bad Request"
}
```

### 전역 예외 필터

```typescript
// src/common/http-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import { Response } from 'express'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()

    this.logger.error({ status, message: exception.message })

    response.status(status).json(
      typeof exceptionResponse === 'string'
        ? { statusCode: status, message: exceptionResponse, error: exception.name }
        : exceptionResponse
    )
  }
}
```

---

## 6. 도메인 이벤트 발행 패턴 — Transactional Outbox

### 문제

도메인 메서드 실행 후 이벤트를 발행할 때, Aggregate 저장과 이벤트 발행이 원자적이지 않으면 다음 문제가 발생한다:

- 트랜잭션 커밋 후 서버가 죽으면 → 이벤트 유실
- 이벤트 발행 후 트랜잭션이 롤백되면 → 잘못된 이벤트 발행

### 해결 — Transactional Outbox 패턴

Aggregate 저장과 이벤트 저장을 **같은 트랜잭션**으로 묶는다. 별도 프로세스가 outbox 테이블에서 이벤트를 읽어 발행한다.

```
[Command 실행 — 하나의 트랜잭션]
1. Command Service: Aggregate 조회
2. Command Service: Aggregate 도메인 메서드 호출 → Aggregate 내부에 이벤트 수집
3. Command Service: transactionManager.run() 안에서:
   - Repository로 Aggregate 저장
   - Outbox 테이블에 수집된 이벤트 저장
4. 트랜잭션 커밋 → Aggregate와 이벤트가 함께 확정되거나 함께 롤백됨

[이벤트 발행 — 별도 프로세스]
5. OutboxProcessor: outbox 테이블에서 미발행 이벤트를 폴링
6. OutboxProcessor: 이벤트를 EventHandler에 전달
7. OutboxProcessor: 발행 완료된 이벤트를 processed 처리
```

### Aggregate에서 이벤트 수집

Aggregate는 도메인 메서드 내에서 `_events` 배열에 이벤트를 추가한다.

```typescript
// domain/order.ts
export class Order {
  private readonly _events: OrderDomainEvent[] = []

  get domainEvents(): OrderDomainEvent[] { return [...this._events] }

  public cancel(reason: string): void {
    if (this._status === 'cancelled') throw new Error(...)
    this._status = 'cancelled'
    this._events.push(new OrderCancelled({ orderId: this.orderId, reason, cancelledAt: new Date() }))
  }

  public clearEvents(): void { this._events.length = 0 }
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

### OutboxWriter (infrastructure 레이어)

트랜잭션 안에서 이벤트를 outbox 테이블에 저장한다.

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

### OutboxProcessor (infrastructure 레이어)

미발행 이벤트를 폴링하여 EventHandler에 전달한다.

```typescript
// outbox/outbox-processor.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DataSource } from 'typeorm'

import { DomainEventPublisher } from '@/outbox/domain-event-publisher'
import { OutboxEntity } from '@/outbox/outbox.entity'

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventPublisher: DomainEventPublisher
  ) {}

  @Cron('*/5 * * * * *')
  public async process(): Promise<void> {
    const repo = this.dataSource.getRepository(OutboxEntity)
    const events = await repo.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 100
    })

    for (const event of events) {
      try {
        await this.eventPublisher.publish(event.eventType, JSON.parse(event.payload))
        await repo.update({ eventId: event.eventId }, { processed: true })
      } catch (error) {
        this.logger.error({ message: '이벤트 발행 실패', event_id: event.eventId, error })
      }
    }
  }
}
```

### DomainEventPublisher (infrastructure 레이어)

outbox에서 읽은 이벤트를 핸들러에 전달한다. 프로젝트의 이벤트 시스템에 따라 구현이 달라진다.

#### 방식 A: @nestjs/event-emitter (Service 패턴)

```typescript
// outbox/domain-event-publisher.ts
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

@Injectable()
export class DomainEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  public async publish(eventType: string, payload: object): Promise<void> {
    await this.eventEmitter.emitAsync(eventType, payload)
  }
}
```

```typescript
// application/event/order-cancelled-handler.ts
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'

@Injectable()
export class OrderCancelledHandler {
  @OnEvent('OrderCancelled')
  public async handle(event: { orderId: string; reason: string }): Promise<void> {
    // 후속 처리
  }
}
```

#### 방식 B: @nestjs/cqrs EventBus (CQRS 패턴)

```typescript
// outbox/domain-event-publisher.ts
import { Injectable } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'

// 이벤트 클래스 레지스트리 — eventType 문자열을 클래스로 매핑
const EVENT_REGISTRY: Record<string, new (payload: any) => object> = {}

export function RegisterEvent(eventClass: new (payload: any) => object): void {
  EVENT_REGISTRY[eventClass.name] = eventClass
}

@Injectable()
export class DomainEventPublisher {
  constructor(private readonly eventBus: EventBus) {}

  public async publish(eventType: string, payload: object): Promise<void> {
    const EventClass = EVENT_REGISTRY[eventType]
    if (EventClass) {
      this.eventBus.publish(new EventClass(payload))
    }
  }
}
```

```typescript
// domain/order-cancelled.ts — 이벤트 클래스 등록
import { RegisterEvent } from '@/outbox/domain-event-publisher'

export class OrderCancelled {
  public readonly orderId: string
  public readonly reason: string
  public readonly cancelledAt: Date

  constructor(params: { orderId: string; reason: string; cancelledAt: Date }) {
    this.orderId = params.orderId
    this.reason = params.reason
    this.cancelledAt = params.cancelledAt
  }
}

RegisterEvent(OrderCancelled)
```

```typescript
// application/event/order-cancelled-handler.ts
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'

import { OrderCancelled } from '@/order/domain/order-cancelled'

@EventsHandler(OrderCancelled)
export class OrderCancelledHandler implements IEventHandler<OrderCancelled> {
  public async handle(event: OrderCancelled): Promise<void> {
    // 후속 처리
  }
}
```

### Command Service에서의 패턴

Aggregate 저장과 이벤트 outbox 저장을 **같은 트랜잭션**에서 수행한다.

```typescript
public async cancelOrder(command: CancelOrderCommand): Promise<void> {
  const order = await this.orderRepository.findOrders({ ... }).then((r) => r.orders.pop())
  if (!order) throw new Error(...)

  order.cancel(command.reason)                              // 도메인 메서드 → 이벤트 수집

  await this.transactionManager.run(async () => {           // 하나의 트랜잭션
    await this.orderRepository.saveOrder(order)             //   Aggregate 저장
    await this.outboxWriter.saveAll(order.domainEvents)     //   이벤트를 outbox에 저장
  })
  order.clearEvents()
}
```

### 디렉토리 구조

```
src/
  outbox/
    outbox-module.ts                 ← OutboxModule
    outbox.entity.ts                 ← Outbox 테이블 Entity
    outbox-writer.ts                 ← 트랜잭션 안에서 이벤트 저장
    outbox-processor.ts              ← 폴링으로 미발행 이벤트 발행
    domain-event-publisher.ts        ← 이벤트를 핸들러에 전달
  <domain>/
    domain/
      <domain-event>.ts              ← Domain Event 정의
    application/
      event/
        <domain-event>-handler.ts    ← EventHandler (후속 처리)
```

### Module 등록

```typescript
// database/database-module.ts
import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { TransactionManager } from '@/database/transaction-manager'

@Global()
@Module({
  imports: [TypeOrmModule.forRoot({ ... })],
  providers: [TransactionManager],
  exports: [TransactionManager]
})
export class DatabaseModule {}
```

```typescript
// outbox/outbox-module.ts
import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { DomainEventPublisher } from '@/outbox/domain-event-publisher'
import { OutboxEntity } from '@/outbox/outbox.entity'
import { OutboxProcessor } from '@/outbox/outbox-processor'
import { OutboxWriter } from '@/outbox/outbox-writer'

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEntity])],
  providers: [OutboxWriter, OutboxProcessor, DomainEventPublisher],
  exports: [OutboxWriter]
})
export class OutboxModule {}
```

```typescript
// app-module.ts
import { ScheduleModule } from '@nestjs/schedule'
import { EventEmitterModule } from '@nestjs/event-emitter'  // 방식 A
// 또는 import { CqrsModule } from '@nestjs/cqrs'           // 방식 B

import { DatabaseModule } from '@/database/database-module'
import { OutboxModule } from '@/outbox/outbox-module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),  // 방식 A
    // CqrsModule,                 // 방식 B
    DatabaseModule,
    OutboxModule,
    // ...도메인 모듈
  ]
})
export class AppModule {}

// order-module.ts — DatabaseModule, OutboxModule이 @Global()이므로 별도 import 불필요
@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, OrderItemEntity])],
  providers: [OrderCommandService, OrderCancelledHandler, ...]
})
export class OrderModule {}
```

### 원칙

- **이벤트는 Aggregate 내부에서만 수집한다**: Command Service가 직접 이벤트를 생성하지 않는다.
- **Aggregate 저장과 이벤트 저장은 같은 트랜잭션이다**: outbox에 함께 저장하여 원자성을 보장한다.
- **이벤트 발행은 별도 프로세스(OutboxProcessor)가 담당한다**: Command Service는 발행을 신경쓰지 않는다.
- **이벤트 핸들러는 application/event/에 배치한다**: 도메인 레이어가 아닌 application 레이어에서 후속 처리를 조율한다.
- **도메인 메서드에 이벤트가 없는 경우**: `outboxWriter.saveAll()`과 `clearEvents()` 호출을 생략한다.

### 이벤트 핸들러 멱등성

OutboxProcessor가 이벤트 발행 후 `processed: true`로 업데이트하기 전에 실패하면, 같은 이벤트가 **재발행**될 수 있다. 따라서 모든 EventHandler는 **멱등(idempotent)** 하게 구현해야 한다.

```typescript
// 올바른 방식 — 멱등한 핸들러
@OnEvent('OrderCancelled')
public async handle(event: { orderId: string }): Promise<void> {
  // 이미 처리된 이벤트인지 확인 후 처리
  const refund = await this.refundRepository
    .findRefunds({ orderId: event.orderId, take: 1, page: 0 })
    .then((r) => r.refunds.pop())
  if (refund) return  // 이미 환불 처리됨 — 중복 실행 방지
  await this.refundRepository.saveRefund(new Refund({ orderId: event.orderId, ... }))
}

// 잘못된 방식 — 멱등하지 않은 핸들러
@OnEvent('OrderCancelled')
public async handle(event: { orderId: string }): Promise<void> {
  // 중복 체크 없이 바로 생성 — 재발행 시 환불이 두 번 생성됨
  await this.refundRepository.saveRefund(new Refund({ orderId: event.orderId, ... }))
}
```

**멱등성 보장 방법:**
- 핸들러 시작 시 이미 처리된 상태인지 확인한 후 처리
- 또는 DB unique 제약으로 중복 생성을 방지

### Outbox 테이블 정리

`processed: true`인 이벤트는 일정 기간 후 삭제하여 테이블 비대화를 방지한다.

```typescript
// outbox/outbox-processor.ts — 정리 스케줄 추가
@Cron('0 3 * * *')  // 매일 03:00
public async cleanup(): Promise<void> {
  const repo = this.dataSource.getRepository(OutboxEntity)
  const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)  // 7일 전
  await repo.delete({ processed: true, createdAt: LessThan(threshold) })
}
```

- 보관 기간은 프로젝트 요구사항에 따라 조정한다 (기본 7일).
- 정리 대상은 `processed: true`인 이벤트만이다.

---

## 7. 데이터베이스 쿼리 패턴 (TypeORM 기준)

### TypeORM 쿼리 스타일 — Repository 구현체에서만 DB 접근

```typescript
// find (목록) — QueryBuilder 사용
const qb = this.orderRepo.createQueryBuilder('order')
  .leftJoinAndSelect('order.items', 'item')
  .orderBy('order.orderId', 'DESC')
  .take(query.take)
  .skip(query.page * query.take)

if (query.status?.length) qb.andWhere('order.status IN (:...status)', { status: query.status })
if (query.keyword) qb.andWhere('order.description LIKE :keyword', { keyword: `%${query.keyword}%` })

// find + count (페이지네이션) — 키 이름은 도메인 객체명 복수형으로
const [rows, count] = await qb.getManyAndCount()
return { orders: rows.map((row) => toDomain(row)), count }
```

### `.then()` 체이닝 — 단건 조회 및 변환에 선호

```typescript
// 단건 조회 — take: 1 + pop() 패턴
const order = await this.orderRepository
  .findOrders({ orderId, take: 1, page: 0 })
  .then((result) => result.orders.pop())
if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

// 수정 — 조회 후 Aggregate 도메인 메서드 호출, save로 저장
order.cancel(reason)
await this.orderRepository.saveOrder(order)
```

### 트랜잭션 — AsyncLocalStorage 패턴

여러 Repository에 걸친 쓰기 작업을 하나의 트랜잭션으로 묶는다. AsyncLocalStorage를 사용하여 트랜잭션 클라이언트를 암묵적으로 전파한다.

#### TransactionManager (infrastructure 레이어)

```typescript
// database/transaction-manager.ts
import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { AsyncLocalStorage } from 'async_hooks'

const transactionStorage = new AsyncLocalStorage<EntityManager>()

@Injectable()
export class TransactionManager {
  constructor(private readonly dataSource: DataSource) {}

  // 트랜잭션 내에서 콜백을 실행한다
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) =>
      transactionStorage.run(manager, fn)
    )
  }

  // 트랜잭션 컨텍스트가 있으면 tx manager, 없으면 기본 manager를 반환한다
  public getManager(): EntityManager {
    return transactionStorage.getStore() ?? this.dataSource.manager
  }
}
```

#### Repository 구현체에서 사용

Repository 구현체는 `this.transactionManager.getManager()`를 사용하여 트랜잭션 컨텍스트를 자동으로 전파받는다.

```typescript
// infrastructure/order-repository-impl.ts
@Injectable()
export class OrderRepositoryImpl extends OrderRepository {
  constructor(
    @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
    private readonly transactionManager: TransactionManager
  ) {
    super()
  }

  public async saveOrder(order: Order): Promise<void> {
    const manager = this.transactionManager.getManager()
    await manager.save(OrderEntity, { ... })
  }
}
```

#### Command Service에서 사용

여러 Repository를 호출하는 Command에서 `transactionManager.run()`으로 감싼다.

```typescript
// application/command/order-command-service.ts
@Injectable()
export class OrderCommandService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly transactionManager: TransactionManager,
    private readonly outboxWriter: OutboxWriter
  ) {}

  public async cancelOrder(command: CancelOrderCommand): Promise<void> {
    const order = await this.orderRepository
      .findOrders({ orderId: command.orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

    order.cancel(command.reason)

    // Aggregate 저장 + 이벤트 outbox 저장을 하나의 트랜잭션으로
    await this.transactionManager.run(async () => {
      await this.paymentRepository.deletePaymentMethods(order.orderId)
      await this.orderRepository.saveOrder(order)
      await this.outboxWriter.saveAll(order.domainEvents)
    })
    order.clearEvents()
  }
}
```

#### 이벤트가 있는 단일 Repository 호출

도메인 이벤트가 수집된 경우, 단일 Repository 호출이라도 outbox 저장을 함께 트랜잭션으로 묶는다.

```typescript
public async createOrder(command: CreateOrderCommand): Promise<void> {
  const order = new Order({ ... })
  await this.transactionManager.run(async () => {
    await this.orderRepository.saveOrder(order)
    await this.outboxWriter.saveAll(order.domainEvents)
  })
  order.clearEvents()
}

// 잘못된 방식 — 불필요한 트랜잭션 래핑
public async createOrder(command: CreateOrderCommand): Promise<void> {
  const order = new Order({ ... })
  await this.transactionManager.run(async () => {
    await this.orderRepository.saveOrder(order)
  })
}
```

#### Repository 내부의 멀티스텝 쓰기

하나의 Repository 구현체 내부에서 여러 테이블을 조작할 때는 `transactionManager.getManager()`를 사용한다. 트랜잭션 컨텍스트가 있으면 해당 트랜잭션 안에서, 없으면 기본 manager로 실행된다.

```typescript
// infrastructure/order-repository-impl.ts
public async deleteOrder(orderId: string): Promise<void> {
  const manager = this.transactionManager.getManager()
  await manager.softDelete(OrderItemEntity, { orderId })
  await manager.softDelete(OrderEntity, { orderId })
}
```

### 동적 where 조건 — QueryBuilder 조건부 체이닝

```typescript
const qb = this.orderRepo.createQueryBuilder('order')

if (query.userId) qb.andWhere('order.userId = :userId', { userId: query.userId })
if (query.email) qb.andWhere('order.email LIKE :email', { email: `%${query.email}%` })
if (query.name) qb.andWhere('order.name LIKE :name', { name: `%${query.name}%` })
```

### 네이밍 컨벤션

- TypeORM Entity 프로퍼티명: **camelCase** 사용
- `order.orderId` (O) / `order.order_id` (X)
- DB 컬럼명이 snake_case인 경우 `@Column({ name: 'order_id' })`로 매핑

### Entity 공통 컬럼 — createdAt, updatedAt, deletedAt

모든 TypeORM Entity는 `createdAt`, `updatedAt`, `deletedAt` 컬럼을 포함한다. 공통 컬럼은 `BaseEntity`를 상속하여 적용한다.

```typescript
// database/base.entity.ts
import { CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm'

export abstract class BaseEntity {
  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @DeleteDateColumn()
  deletedAt: Date | null
}
```

모든 Entity는 `BaseEntity`를 상속한다:

```typescript
// infrastructure/entity/order.entity.ts
import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm'

import { BaseEntity } from '@/database/base.entity'
import { OrderItemEntity } from '@/order/infrastructure/entity/order-item.entity'

@Entity('order')
export class OrderEntity extends BaseEntity {
  @PrimaryColumn({ type: 'char', length: 32 })
  orderId: string

  @Column({ type: 'char', length: 32 })
  userId: string

  @Column()
  status: string

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: true })
  items: OrderItemEntity[]
}
```

### Soft Delete

데이터 삭제 시 실제 삭제(hard delete)가 아닌 `deletedAt`에 타임스탬프를 기록하는 soft delete를 사용한다.

#### TypeORM 설정

`@DeleteDateColumn()`이 선언된 Entity는 TypeORM의 `softDelete` / `softRemove` 메서드를 사용하면 자동으로 `deletedAt`이 설정된다. `find` 계열 메서드는 `deletedAt IS NULL` 조건을 자동 적용한다.

#### Repository 구현체에서의 삭제

```typescript
// 올바른 방식 — soft delete
public async deleteOrder(orderId: string): Promise<void> {
  const manager = this.transactionManager.getManager()
  await manager.softDelete(OrderEntity, { orderId })
}

// 잘못된 방식 — hard delete
public async deleteOrder(orderId: string): Promise<void> {
  const manager = this.transactionManager.getManager()
  await manager.delete(OrderEntity, { orderId })  // 실제 삭제 — 사용 금지
}
```

#### 삭제된 데이터 조회가 필요한 경우

```typescript
// withDeleted 옵션으로 삭제된 데이터 포함 조회
const qb = this.orderRepo.createQueryBuilder('order')
  .withDeleted()
  .andWhere('order.orderId = :orderId', { orderId })
```

#### 하위 엔티티 cascade soft delete

하위 엔티티도 함께 soft delete해야 하는 경우, Repository 구현체 내부에서 명시적으로 처리한다:

```typescript
public async deleteOrder(orderId: string): Promise<void> {
  const manager = this.transactionManager.getManager()
  await manager.softDelete(OrderItemEntity, { orderId })
  await manager.softDelete(OrderEntity, { orderId })
}
```

### 마이그레이션 — TypeORM CLI

스키마 변경은 TypeORM 마이그레이션으로 관리한다. Entity를 수정한 후 마이그레이션 파일을 생성하고, 배포 시 실행한다.

#### 디렉토리 구조

```
src/
  database/
    migrations/                      # 마이그레이션 파일
      1712345678901-create-order.ts
      1712345678902-add-order-status.ts
    data-source.ts                   # CLI와 앱 모두에서 사용하는 DataSource
```

#### 마이그레이션 명령어

```bash
# 마이그레이션 생성 — Entity 변경 사항을 감지하여 자동 생성
npx typeorm migration:generate src/database/migrations/create-order -d src/database/data-source.ts

# 마이그레이션 실행
npx typeorm migration:run -d src/database/data-source.ts

# 마이그레이션 롤백 (마지막 1개)
npx typeorm migration:revert -d src/database/data-source.ts
```

#### 원칙

- **Entity 수정 후 반드시 마이그레이션 생성**: `synchronize: true`는 개발 환경에서만 사용하고, 운영 환경에서는 마이그레이션으로 스키마를 관리한다.
- **마이그레이션 파일은 커밋에 포함**: 자동 생성된 파일을 검토한 후 커밋한다.
- **롤백 가능한 마이그레이션 작성**: `up()`과 `down()` 모두 구현한다.
- **데이터 마이그레이션은 별도 파일**: 스키마 변경과 데이터 변환을 같은 마이그레이션에 넣지 않는다.

---

## 8. 인증 패턴 — Bearer Access Token

### 인증 흐름

```
[요청]
1. 클라이언트: Authorization: Bearer <access_token> 헤더를 포함하여 API 호출
2. AuthGuard: 헤더에서 토큰 추출 → AuthService.verify()로 검증
3. AuthService: 토큰 디코딩 → 사용자 정보 반환
4. AuthGuard: request.user에 사용자 정보 할당 → Controller로 전달

[토큰 발급]
1. 클라이언트 → 서버: POST /auth/sign-in (credentials)
2. AuthService: 인증 정보 검증 → Access Token 발급
3. 서버 → 클라이언트: { accessToken }
```

### 디렉토리 구조

```
src/
  auth/
    auth-module.ts
    auth-service.ts              ← 토큰 발급/검증 (JWT)
    auth.guard.ts                ← Bearer 토큰 추출 및 검증 Guard
    auth-error-message.ts
    interface/
      auth-controller.ts         ← POST /auth/sign-in 등
      dto/
        sign-in-request-body.ts
        sign-in-response-body.ts
```

### AuthGuard — Bearer 토큰 추출 및 검증

모든 인증 필요 Controller에 클래스 레벨로 적용한다. `Authorization` 헤더에서 `Bearer` 토큰을 추출하고, `AuthService.verify()`로 검증한 뒤 `request.user`에 사용자 정보를 할당한다.

```typescript
// src/auth/auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

import { AuthService } from '@/auth/auth-service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException()

    const token = authorization.replace('Bearer ', '')
    const user = await this.authService.verify(token)
    if (!user) throw new UnauthorizedException()

    request.user = user
    return true
  }
}
```

### AuthService — 토큰 발급 및 검증

```typescript
// src/auth/auth-service.ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

import { AuthErrorMessage as ErrorMessage } from '@/auth/auth-error-message'

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  public async sign(payload: { userId: string }): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn')
    })
  }

  public async verify(token: string): Promise<{ userId: string } | null> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret')
      })
    } catch {
      return null
    }
  }
}
```

### AuthModule

```typescript
// src/auth/auth-module.ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'

import { AuthService } from '@/auth/auth-service'
import { AuthGuard } from '@/auth/auth.guard'
import { AuthController } from '@/auth/interface/auth-controller'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard]
})
export class AuthModule {}
```

### Controller에서 사용

```typescript
// 인증 필요 Controller — 클래스 레벨에 AuthGuard 적용
@Controller()
@ApiBearerAuth('token')
@ApiTags('Order')
@UseGuards(AuthGuard)
export class OrderController {
  // request.user로 인증된 사용자 정보 접근
  @Get('/orders')
  public async getOrders(
    @Req() req: Request & { user: { userId: string } }
  ): Promise<GetOrdersResponseBody> { ... }
}
```

```typescript
// 인증 불필요 Controller — AuthGuard 없음
@Controller()
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/auth/sign-in')
  @ApiCreatedResponse({ type: SignInResponseBody })
  public async signIn(@Body() body: SignInRequestBody): Promise<SignInResponseBody> {
    // 인증 정보 검증 후 토큰 발급
    const accessToken = await this.authService.sign({ userId: body.userId })
    return { accessToken }
  }
}
```

### Swagger 인증 설정

```typescript
// main.ts
const document = SwaggerModule.createDocument(app, 
  new DocumentBuilder()
    .setTitle('API')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'token')
    .build()
)
```

- `addBearerAuth`의 두 번째 인자 `'token'`은 Controller의 `@ApiBearerAuth('token')`과 일치시킨다.
- Swagger UI에서 Authorize 버튼으로 토큰을 입력하면 모든 요청에 `Authorization: Bearer <token>` 헤더가 자동 포함된다.

### Interceptor — 로깅/변환

```typescript
// src/common/logging.interceptor.ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest()
    const { method, url } = req
    const now = Date.now()

    return next.handle().pipe(
      tap(() => this.logger.log(`${method} ${url} — ${Date.now() - now}ms`))
    )
  }
}
```

---

## 9. Domain Service 패턴

### Domain Service가 필요한 경우

- 단일 Aggregate에 속하지 않는 도메인 로직
- 여러 Aggregate를 읽어서 판단해야 하는 로직
- 외부 서비스 호출이 포함된 도메인 로직

### 위치 및 네이밍

- 파일 위치: `src/<domain>/domain/<domain-service-name>.ts`
- 클래스명: 도메인 행위를 나타내는 이름 (예: `OrderPricingService`, `StockValidationService`)
- Domain 레이어에 위치하므로 프레임워크 데코레이터를 사용하지 않는다
- Application Service에서 호출하여 사용한다

```typescript
// domain/order-pricing-service.ts — Domain Service 예시
import { Order } from '@/order/domain/order'
import { OrderErrorMessage } from '@/order/order-error-message'

export class OrderPricingService {
  public calculateDiscount(order: Order, coupon: { discountAmount: number; minimumAmount: number; isExpired: () => boolean }): number {
    if (coupon.isExpired()) throw new Error(OrderErrorMessage['쿠폰이 만료되었습니다.'])
    if (order.getTotalAmount() < coupon.minimumAmount) return 0
    return Math.min(coupon.discountAmount, order.getTotalAmount())
  }
}
```

> Domain Service 예시에서 사용하는 에러 메시지(`'쿠폰이 만료되었습니다.'`)는 해당 도메인의 `<domain>-error-message.ts` enum에 반드시 정의해야 한다.

```typescript
// application/order-service.ts — Application Service에서 Domain Service 호출
constructor(
  private readonly orderRepository: OrderRepository,
  private readonly orderPricingService: OrderPricingService
) {}

public async applyCoupon(command: ApplyCouponCommand): Promise<void> {
  const order = await this.orderRepository.findOrders({ orderId: command.orderId, take: 1, page: 0 }).then((r) => r.orders.pop())
  if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])
  const discount = this.orderPricingService.calculateDiscount(order, command.coupon)
  order.applyDiscount(discount)
  await this.orderRepository.saveOrder(order)
}
```

---

## 10. 공유 모듈 구조

도메인에 속하지 않는 공유 코드는 아래 경로에 배치한다:

```
src/
  common/                          # 프로젝트 공통 유틸
    generate-error-response.ts
    generate-id.ts
    http-exception.filter.ts
    logging.interceptor.ts
  database/                        # 데이터베이스 모듈 (@Global)
    database-module.ts
    base.entity.ts
    data-source.ts
    transaction-manager.ts
  outbox/                          # Outbox 모듈 (@Global)
    outbox-module.ts
    outbox.entity.ts
    outbox-writer.ts
    outbox-processor.ts
    domain-event-publisher.ts
  auth/                            # 인증 모듈 (공유)
    auth-module.ts
    auth-service.ts                # 토큰 발급/검증 (JWT)
    auth.guard.ts                  # Bearer 토큰 추출 Guard
    auth-error-message.ts
    interface/
      auth-controller.ts           # POST /auth/sign-in 등
      dto/
  <domain>/                        # 도메인 모듈
    ...
```

- `src/common/` — 에러 처리, 필터, 인터셉터 등 프레임워크 공통 코드
- `src/database/` — DatabaseModule: TypeORM DataSource, TransactionManager (`@Global`)
- `src/outbox/` — OutboxModule: OutboxWriter, OutboxProcessor, DomainEventPublisher (`@Global`)
- `src/auth/` — 인증/인가 공유 모듈

---

## 11. 크로스 도메인 호출 패턴

다른 도메인의 기능을 호출할 때는 항상 **Adapter 패턴**을 사용한다 (섹션 4 "모듈 간 의존" 참조).

### 원칙

1. **Application Service에서 Adapter 인터페이스를 통해 외부 도메인을 호출**한다. 외부 도메인의 Service/Repository를 직접 주입하지 않는다.
2. **Adapter 인터페이스는 호출하는 쪽의 `application/adapter/`에** abstract class로 정의한다.
3. **Adapter 구현체는 호출하는 쪽의 `infrastructure/`에** 배치하고, 외부 도메인 모듈의 `exports`된 Service를 주입받아 호출한다.
4. 조합 로직이 복잡하면 별도의 Query Service로 분리할 수 있다.

### 예시: 주문 도메인에서 사용자 정보 조회

```typescript
// order/application/adapter/user-adapter.ts — 인터페이스 (abstract class)
export abstract class UserAdapter {
  abstract findUsers(query: {
    readonly take: number
    readonly page: number
    readonly userId?: string
  }): Promise<{ users: { userId: string; name: string }[]; count: number }>
}

// order/infrastructure/user-adapter-impl.ts — 구현체
import { Injectable } from '@nestjs/common'

import { UserAdapter } from '@/order/application/adapter/user-adapter'
import { UserService } from '@/user/application/user-service'

@Injectable()
export class UserAdapterImpl extends UserAdapter {
  constructor(private readonly userService: UserService) {}

  public async findUsers(query: {
    readonly take: number
    readonly page: number
    readonly userId?: string
  }): Promise<{ users: { userId: string; name: string }[]; count: number }> {
    return this.userService.getUsers(query)
  }
}

// order/application/order-service.ts — Adapter를 통해 호출
public async getOrderWithUser(param: { orderId: string }): Promise<GetOrderWithUserResult> {
  const order = await this.orderRepository
    .findOrders({ orderId: param.orderId, take: 1, page: 0 })
    .then((r) => r.orders.pop())
  if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

  const user = await this.userAdapter
    .findUsers({ userId: order.userId, take: 1, page: 0 })
    .then((r) => r.users.pop())

  return { orderId: order.orderId, status: order.status, userName: user?.name ?? null }
}
```

---

## 12. Aggregate 생성과 ID 처리

모든 Aggregate의 ID는 **UUID v4 (하이픈 제거)** 형식의 문자열을 사용한다. Aggregate 생성자에서 직접 ID를 할당한다.

### ID 생성 규칙

- **형식**: UUID v4에서 `-`를 제거한 32자리 hex 문자열
- **생성 위치**: Aggregate 생성자 (Domain 레이어)
- **타입**: `string`

```typescript
// 올바른 방식
'550e8400e29b41d4a716446655440000'   // 32자리, 하이픈 없음

// 잘못된 방식
'550e8400-e29b-41d4-a716-446655440000'  // 하이픈 포함
1, 2, 3                                  // auto-increment 숫자
```

### ID 생성 유틸

```typescript
// common/generate-id.ts
import { randomUUID } from 'crypto'

export function generateId(): string {
  return randomUUID().replace(/-/g, '')
}
```

### Aggregate에서 사용

```typescript
// domain/order.ts
import { generateId } from '@/common/generate-id'

export class Order {
  public readonly orderId: string
  // ...

  constructor(params: {
    orderId?: string
    userId: string
    items: OrderItem[]
    status: 'pending' | 'paid' | 'cancelled'
  }) {
    this.orderId = params.orderId ?? generateId()
    // ...
  }
}
```

- 신규 생성 시: `orderId`를 생략하면 생성자에서 자동 할당
- DB에서 복원 시: 기존 `orderId`를 그대로 전달

### TypeORM Entity

```typescript
// infrastructure/entity/order.entity.ts
import { BaseEntity } from '@/database/base.entity'

@Entity('order')
export class OrderEntity extends BaseEntity {
  @PrimaryColumn({ type: 'char', length: 32 })
  orderId: string

  @Column({ type: 'char', length: 32 })
  userId: string

  @Column()
  status: string

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: true })
  items: OrderItemEntity[]
}
```

### Repository 구현체

```typescript
// infrastructure/order-repository-impl.ts — save 시 Aggregate의 ID를 그대로 사용
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
}
```

---

## 13. @nestjs/cqrs 적용 패턴

`@nestjs/cqrs` 패키지를 사용하면 Application 레이어의 Service를 Command Handler / Query Handler / Event Handler로 분리한다. 기존 아키텍처의 원칙(Domain 레이어 무의존, Aggregate 비즈니스 규칙 캡슐화, Repository 패턴)은 동일하게 유지한다.

### 디렉토리 구조 변경점

`@nestjs/cqrs` 적용 시 `application/` 하위 구조가 변경된다:

```
src/
  <domain>/
    domain/                              # 변경 없음
      <aggregate-root>.ts
      <entity>.ts
      <value-object>.ts
      <domain-event>.ts
      <aggregate>-repository.ts
    application/
      command/
        <verb>-<noun>-command.ts          # Command 객체
        <verb>-<noun>-command-handler.ts   # CommandHandler (기존 Service의 쓰기 로직)
      query/
        <verb>-<noun>-query.ts            # Query 객체
        <verb>-<noun>-query-handler.ts    # QueryHandler (기존 Service의 읽기 로직)
        <verb>-<noun>-result.ts
      event/
        <domain-event>-handler.ts         # EventHandler (이벤트 후속 처리)
    interface/                           # 변경: Service 대신 CommandBus/QueryBus 사용
      <domain>-controller.ts
      dto/
    infrastructure/                      # 변경 없음
      <aggregate>-repository-impl.ts
    <domain>-module.ts                   # 변경: CqrsModule import + Handler 등록
```

### 의존 방향 변경

```
Interface (Controller) → CommandBus / QueryBus → Command/Query Handler → Domain (Aggregate, Repository)
                                                                              ↑
                                                  EventHandler ←── EventBus   Infrastructure (Repository 구현체)
```

- Controller는 Service 대신 `CommandBus.execute()` / `QueryBus.execute()`를 호출한다.
- CommandHandler / QueryHandler가 기존 Application Service의 역할을 대체한다.
- EventHandler는 Domain Event에 반응하여 후속 처리를 수행한다.

### Command와 CommandHandler

Command는 쓰기 요청을 나타내는 데이터 객체이다. CommandHandler가 이를 처리한다.

```typescript
// application/command/cancel-order-command.ts — Command 객체 (기존과 동일)
export class CancelOrderCommand {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  public readonly orderId: string

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  public readonly reason: string

  constructor(command: CancelOrderCommand) {
    Object.assign(this, command)
  }
}
```

```typescript
// application/command/cancel-order-command-handler.ts — CommandHandler
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'

import { OutboxWriter } from '@/outbox/outbox-writer'
import { TransactionManager } from '@/database/transaction-manager'
import { CancelOrderCommand } from '@/order/application/command/cancel-order-command'
import { OrderRepository } from '@/order/domain/order-repository'
import { PaymentRepository } from '@/order/domain/payment-repository'
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'

@CommandHandler(CancelOrderCommand)
export class CancelOrderCommandHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly transactionManager: TransactionManager,
    private readonly outboxWriter: OutboxWriter
  ) {}

  public async execute(command: CancelOrderCommand): Promise<void> {
    const order = await this.orderRepository
      .findOrders({ orderId: command.orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

    order.cancel(command.reason)

    // Aggregate 저장 + 이벤트 outbox 저장을 같은 트랜잭션으로
    await this.transactionManager.run(async () => {
      await this.paymentRepository.deletePaymentMethods(order.orderId)
      await this.orderRepository.saveOrder(order)
      await this.outboxWriter.saveAll(order.domainEvents)
    })
    order.clearEvents()
  }
}
```

### Query와 QueryHandler

Query는 읽기 요청을 나타내는 데이터 객체이다. QueryHandler가 이를 처리한다.

```typescript
// application/query/get-orders-query.ts — Query 객체 (기존과 동일)
export class GetOrdersQuery {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  public readonly status?: string[]

  @ApiProperty({ minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  public readonly page: number

  @ApiProperty({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly take: number
}
```

```typescript
// application/query/get-orders-query-handler.ts — QueryHandler
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'

import { GetOrdersQuery } from '@/order/application/query/get-orders-query'
import { GetOrdersResult } from '@/order/application/query/get-orders-result'
import { OrderRepository } from '@/order/domain/order-repository'

@QueryHandler(GetOrdersQuery)
export class GetOrdersQueryHandler implements IQueryHandler<GetOrdersQuery> {
  constructor(private readonly orderRepository: OrderRepository) {}

  public async execute(query: GetOrdersQuery): Promise<GetOrdersResult> {
    const { orders, count } = await this.orderRepository.findOrders({
      take: query.take,
      page: query.page,
      status: query.status
    })
    return {
      orders: orders.map((o) => ({
        orderId: o.orderId,
        description: null,
        status: o.status
      })),
      totalCount: count
    }
  }
}
```

### EventHandler

Domain Event에 반응하여 후속 처리를 수행한다. 하나의 Event에 여러 EventHandler를 등록할 수 있다.

```typescript
// application/event/order-cancelled-handler.ts
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'

import { Logger } from '@nestjs/common'

import { OrderCancelled } from '@/order/domain/order-cancelled'

@EventsHandler(OrderCancelled)
export class OrderCancelledHandler implements IEventHandler<OrderCancelled> {
  private readonly logger = new Logger(OrderCancelledHandler.name)

  public async handle(event: OrderCancelled): Promise<void> {
    // 후속 처리: 알림 발송, 감사 로그 기록, 재고 복원 등
    this.logger.log({ message: '주문 취소됨', order_id: event.orderId, reason: event.reason })
  }
}
```

### Controller — CommandBus / QueryBus 사용

Controller는 Service 대신 CommandBus와 QueryBus를 주입받아 사용한다.

```typescript
// interface/order-controller.ts
import { CommandBus, QueryBus } from '@nestjs/cqrs'

@Controller()
@ApiBearerAuth('token')
@ApiTags('Order')
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
export class OrderController {
  private readonly logger = new Logger(OrderController.name)

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @Get('/orders')
  @ApiOperation({ operationId: 'getOrders' })
  @ApiOkResponse({ type: GetOrdersResponseBody })
  public async getOrders(
    @Query() querystring: GetOrdersRequestQuerystring
  ): Promise<GetOrdersResponseBody> {
    return this.queryBus.execute(new GetOrdersQuery(querystring)).catch((error) => {
      this.logger.error(error)
      throw generateErrorResponse(error.message, [])
    })
  }

  @Post('/orders/:orderId/cancel')
  @HttpCode(204)
  @ApiOperation({ operationId: 'cancelOrder' })
  @ApiNoContentResponse()
  public async cancelOrder(
    @Param('orderId') orderId: string,
    @Body() body: CancelOrderRequestBody
  ): Promise<void> {
    return this.commandBus.execute(new CancelOrderCommand({ ...body, orderId })).catch((error) => {
      this.logger.error(error)
      throw generateErrorResponse(error.message, [
        [OrderErrorMessage['주문을 찾을 수 없습니다.'], NotFoundException],
        [OrderErrorMessage['이미 취소된 주문입니다.'], BadRequestException],
        [OrderErrorMessage['결제 완료된 주문은 취소할 수 없습니다.'], BadRequestException]
      ])
    })
  }
}
```

### Module — CqrsModule 등록

```typescript
// order-module.ts
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'

import { TransactionManager } from '@/database/transaction-manager'
import { CancelOrderCommandHandler } from '@/order/application/command/cancel-order-command-handler'
import { CreateOrderCommandHandler } from '@/order/application/command/create-order-command-handler'
import { OrderCancelledHandler } from '@/order/application/event/order-cancelled-handler'
import { GetOrderQueryHandler } from '@/order/application/query/get-order-query-handler'
import { GetOrdersQueryHandler } from '@/order/application/query/get-orders-query-handler'
import { OrderRepository } from '@/order/domain/order-repository'
import { PaymentRepository } from '@/order/domain/payment-repository'
import { OrderRepositoryImpl } from '@/order/infrastructure/order-repository-impl'
import { PaymentRepositoryImpl } from '@/order/infrastructure/payment-repository-impl'
import { OrderController } from '@/order/interface/order-controller'

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([OrderEntity, OrderItemEntity])],
  controllers: [OrderController],
  providers: [
    // Command Handlers
    CancelOrderCommandHandler,
    CreateOrderCommandHandler,
    // Query Handlers
    GetOrderQueryHandler,
    GetOrdersQueryHandler,
    // Event Handlers
    OrderCancelledHandler,
    // Repositories
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    { provide: PaymentRepository, useClass: PaymentRepositoryImpl }
  ]
})
export class OrderModule {}
```

### 기존 Service 방식과의 차이 요약

| 항목 | Service 방식 | @nestjs/cqrs 방식 |
|------|-------------|-------------------|
| Application 레이어 | `<domain>-service.ts` 하나에 모든 유스케이스 | Command/Query별 개별 Handler 파일 |
| Controller 의존성 | `OrderService` 주입 | `CommandBus`, `QueryBus` 주입 |
| 이벤트 처리 | Service 내부에서 직접 처리 또는 주석 처리 | `EventBus`로 발행, `EventHandler`가 수신 |
| Module 등록 | `OrderService` 1개 등록 | 각 Handler를 개별 등록 |
| 읽기/쓰기 분리 | Service 메서드로 구분 | Command/Query로 명시적 분리 |

### 적용 기준

- **Service 방식 권장**: 유스케이스가 적고, 이벤트 기반 처리가 불필요한 단순한 도메인
- **@nestjs/cqrs 방식 권장**: 유스케이스가 많고, 읽기/쓰기 모델 분리가 필요하거나, Domain Event 기반 후속 처리가 있는 복잡한 도메인

> 두 방식은 한 프로젝트 내에서 도메인별로 혼용할 수 있다. Core Domain에는 CQRS를, Supporting/Generic Subdomain에는 Service 방식을 적용하는 것이 일반적이다.

---

## 14. 환경 설정 패턴 (ConfigModule)

### 디렉토리 구조

```
src/
  config/
    database.config.ts        # DB 관련 설정
    jwt.config.ts             # JWT 관련 설정
    s3.config.ts              # S3 관련 설정
    config-validator.ts       # 환경 변수 검증 클래스
```

- 관심사별로 설정 파일을 분리한다.
- 모든 설정 파일은 `src/config/` 디렉토리에 위치한다.

### 루트 모듈에 ConfigModule 등록

```typescript
// app-module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { validateConfig } from '@/config/config-validator'
import { databaseConfig } from '@/config/database.config'
import { jwtConfig } from '@/config/jwt.config'
import { s3Config } from '@/config/s3.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, s3Config],
      validate: validateConfig,
    }),
    OrderModule,
    UserModule,
    PaymentModule,
  ]
})
export class AppModule {}
```

- `isGlobal: true` — 모든 모듈에서 `ConfigService`를 별도 import 없이 주입받을 수 있다.
- `load` — 관심사별로 분리한 설정 팩토리 함수를 등록한다.
- `validate` — 앱 기동 시 환경 변수를 검증한다. 검증 실패 시 기동을 중단한다.

### 설정 팩토리 함수

```typescript
// config/database.config.ts
export const databaseConfig = () => ({
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? '',
    name: process.env.DATABASE_NAME ?? 'app',
  },
})
```

```typescript
// config/jwt.config.ts
export const jwtConfig = () => ({
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
})
```

- 팩토리 함수는 네스팅된 객체를 반환하여 관심사별로 네임스페이스를 구분한다.
- `ConfigService`에서 `this.configService.get<string>('database.host')` 형태로 접근한다.

### 환경 변수 검증 — class-validator

앱 기동 시 필수 환경 변수가 누락되거나 잘못된 값이 들어오면 **즉시 프로세스를 종료**한다. 잘못된 설정으로 런타임에 장애가 발생하는 것보다, 기동 단계에서 빠르게 실패(fail-fast)하는 것이 안전하다.

```typescript
// config/config-validator.ts
import { plainToInstance } from 'class-transformer'
import { IsNotEmpty, IsNumber, IsString, validateSync } from 'class-validator'

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_HOST: string

  @IsNumber()
  DATABASE_PORT: number

  @IsString()
  @IsNotEmpty()
  DATABASE_USER: string

  @IsString()
  @IsNotEmpty()
  DATABASE_PASSWORD: string

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME: string

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string
}

export function validateConfig(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  })

  const errors = validateSync(validated, { skipMissingProperties: false })

  if (errors.length > 0) {
    console.error('Environment validation failed:')
    console.error(errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n'))
    process.exit(1)
  }

  return validated
}
```

- `plainToInstance`의 `enableImplicitConversion: true` — 문자열로 들어오는 환경 변수를 `@IsNumber()` 등 데코레이터 타입에 맞게 자동 변환한다.
- `validateSync` — 동기 검증. NestJS `ConfigModule`의 `validate` 옵션은 동기 함수를 기대한다.
- 검증 실패 시 `process.exit(1)` — 잘못된 설정 상태로 앱이 기동되는 것을 방지한다.

### ConfigService 사용

```typescript
// infrastructure 레이어 등에서 ConfigService 주입
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SomeInfraService {
  constructor(private readonly configService: ConfigService) {}

  getDbHost(): string {
    return this.configService.get<string>('database.host')!
  }
}
```

- `ConfigService`는 `isGlobal: true`로 등록했으므로 별도 모듈 import 없이 주입 가능하다.
- 설정 값 접근 시 닷 노테이션(`'database.host'`)으로 네스팅된 값에 접근한다.

---

## 15. Secret 관리 — AWS Secrets Manager

DB 비밀번호, JWT 시크릿, API 키 등 민감한 값은 환경 변수나 코드에 직접 넣지 않고 **AWS Secrets Manager**에 저장하여 런타임에 조회한다.

### 흐름

```
[앱 기동 시]
1. SecretService: Secrets Manager에서 시크릿 조회
2. SecretService: 메모리에 캐시 (TTL 기반)
3. 이후 동일 키 요청 시 캐시에서 반환

[캐시 만료 시]
4. SecretService: Secrets Manager에 다시 조회 → 캐시 갱신
```

### SecretService 인터페이스 (application/service/)

```typescript
// application/service/secret-service.ts — abstract class
export abstract class SecretService {
  abstract getSecret(secretId: string): Promise<string>
}
```

### SecretService 구현체 (infrastructure/)

Secrets Manager에서 값을 조회하고, TTL 기반 메모리 캐시를 적용한다.

```typescript
// infrastructure/secret-service-impl.ts
import { Injectable } from '@nestjs/common'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

import { SecretService } from '@/common/application/service/secret-service'

@Injectable()
export class SecretServiceImpl extends SecretService {
  private readonly client = new SecretsManagerClient({
    ...(process.env.AWS_ENDPOINT ? {
      endpoint: process.env.AWS_ENDPOINT
    } : {})
  })
  private readonly cache = new Map<string, { value: string; expiresAt: number }>()
  private readonly ttl = 5 * 60 * 1000  // 5분

  public async getSecret(secretId: string): Promise<string> {
    const cached = this.cache.get(secretId)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const result = await this.client.send(
      new GetSecretValueCommand({ SecretId: secretId })
    )
    const value = result.SecretString ?? ''
    this.cache.set(secretId, { value, expiresAt: Date.now() + this.ttl })
    return value
  }
}
```

- **TTL 캐시**: 동일 키를 5분 내에 다시 요청하면 API 호출 없이 캐시에서 반환한다.
- **AWS_ENDPOINT 분기**: LocalStack 사용 시 자동으로 로컬 엔드포인트로 연결한다.

### JSON 형태의 시크릿 사용

여러 값을 하나의 시크릿에 JSON으로 저장하고, 키별로 접근한다.

```typescript
// Secrets Manager에 저장된 값 예시:
// SecretId: "app/database"
// SecretString: {"host":"db.example.com","port":"5432","username":"admin","password":"s3cret"}

// 사용 시
const dbSecret = JSON.parse(await this.secretService.getSecret('app/database'))
const host = dbSecret.host
const password = dbSecret.password
```

### 설정 팩토리에서 SecretService 사용

시크릿을 앱 기동 시 한 번 조회하여 ConfigModule에 주입하는 패턴:

```typescript
// config/database.config.ts
import { ConfigModule, ConfigService, registerAs } from '@nestjs/config'

export const databaseConfig = registerAs('database', async () => {
  // 로컬 환경에서는 환경 변수 사용, 운영 환경에서는 Secrets Manager 사용
  if (process.env.NODE_ENV === 'development') {
    return {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      name: process.env.DATABASE_NAME
    }
  }

  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager')
  const client = new SecretsManagerClient({})
  const result = await client.send(new GetSecretValueCommand({ SecretId: 'app/database' }))
  const secret = JSON.parse(result.SecretString ?? '{}')
  return {
    host: secret.host,
    port: parseInt(secret.port ?? '5432', 10),
    username: secret.username,
    password: secret.password,
    name: secret.name
  }
})
```

### Module 등록

```typescript
// app-module.ts
@Module({
  providers: [
    { provide: SecretService, useClass: SecretServiceImpl }
  ],
  exports: [SecretService]
})
```

또는 `@Global()` 모듈로 분리:

```typescript
// secret/secret-module.ts
@Global()
@Module({
  providers: [{ provide: SecretService, useClass: SecretServiceImpl }],
  exports: [SecretService]
})
export class SecretModule {}
```

### LocalStack에서 시크릿 생성

```bash
# localstack/init-aws.sh에 추가
awslocal secretsmanager create-secret \
  --name app/database \
  --secret-string '{"host":"localhost","port":"5432","username":"dev","password":"dev","name":"app"}'

awslocal secretsmanager create-secret \
  --name app/jwt \
  --secret-string '{"secret":"local-dev-secret"}'
```

### Docker Compose — LocalStack SERVICES에 secretsmanager 추가

```yaml
localstack:
  image: localstack/localstack
  environment:
    SERVICES: s3,sqs,secretsmanager    # secretsmanager 추가
```

### 원칙

- **민감한 값은 환경 변수에 직접 넣지 않는다**: 운영 환경에서는 Secrets Manager에서 조회한다.
- **로컬 개발 시에는 환경 변수 또는 LocalStack을 사용한다**: 실제 Secrets Manager에 접근하지 않는다.
- **TTL 캐시를 적용한다**: 동일 시크릿을 반복 조회하지 않도록 메모리 캐시를 사용한다.
- **SecretService 인터페이스로 추상화한다**: 기술 인프라 Service 패턴과 동일하게 application/service/에 abstract class, infrastructure/에 구현체.

---

## 16. 앱 부트스트랩 — main.ts

```typescript
// src/main.ts
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { HttpExceptionFilter } from '@/common/http-exception.filter'
import { AppModule } from '@/app-module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // 전역 ValidationPipe — class-validator 자동 적용
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // DTO에 정의되지 않은 필드 제거
    forbidNonWhitelisted: true, // 정의되지 않은 필드가 있으면 400 에러
    transform: true             // 요청 데이터를 DTO 클래스 인스턴스로 자동 변환
  }))

  // 전역 예외 필터
  app.useGlobalFilters(new HttpExceptionFilter())

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true
  })

  // Swagger
  const document = SwaggerModule.createDocument(app,
    new DocumentBuilder()
      .setTitle(process.env.APP_NAME ?? 'API')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'token')
      .build()
  )
  SwaggerModule.setup('api', app, document)

  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
```

### 설정 요약

| 설정 | 역할 |
|------|------|
| `ValidationPipe` | class-validator 데코레이터 자동 적용, 미정의 필드 차단 |
| `HttpExceptionFilter` | 에러 응답 형식 표준화 |
| `enableCors` | CORS 허용 origin 설정 (환경 변수) |
| `SwaggerModule` | API 문서 자동 생성, `/api` 경로에서 접근 |
| `addBearerAuth` | Swagger UI에서 JWT 토큰 입력 지원 |

---

## 17. 로컬 개발 환경 — Docker Compose + LocalStack

로컬 개발 시 외부 인프라(DB, S3 등)를 **Docker Compose**로 실행하고, AWS 서비스는 **LocalStack**으로 대체한다.

### 디렉토리 구조

```
project-root/
  docker-compose.yml                 ← 로컬 인프라 정의
  localstack/
    init-aws.sh                      ← LocalStack 초기화 스크립트 (S3 버킷 생성 등)
  .env.development                   ← 로컬 개발용 환경 변수
```

### docker-compose.yml

```yaml
services:
  database:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dev -d app']
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  localstack:
    image: localstack/localstack
    ports:
      - '4566:4566'
    environment:
      SERVICES: s3,sqs,secretsmanager
      DEFAULT_REGION: ap-northeast-2
    volumes:
      - ./localstack:/etc/localstack/init/ready.d
    healthcheck:
      test: ['CMD-SHELL', 'awslocal s3 ls']
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    build: .
    ports:
      - '3000:3000'
    env_file:
      - .env.development
    depends_on:
      database:
        condition: service_healthy
      redis:
        condition: service_healthy
      localstack:
        condition: service_healthy
    profiles:
      - app

volumes:
  db-data:
```

### 서비스 구성

| 서비스 | 이미지 | 용도 | 포트 |
|--------|--------|------|------|
| `database` | `postgres:16-alpine` | PostgreSQL DB | 5432 |
| `redis` | `redis:7-alpine` | 캐시, 세션, 큐 (필요 시) | 6379 |
| `localstack` | `localstack/localstack` | AWS 서비스 대체 (S3, SQS 등) | 4566 |
| `app` | 프로젝트 빌드 | NestJS 앱 (선택적) | 3000 |

### Health Check

모든 인프라 서비스에 `healthcheck`를 설정한다. `app` 서비스는 `depends_on`에서 `condition: service_healthy`를 사용하여 인프라가 준비된 후에 기동한다.

### profiles — 앱 서비스 선택적 실행

`app` 서비스에 `profiles: [app]`을 설정하여 **기본 실행 시 인프라만 기동**하고, 앱은 로컬에서 `npm run start:dev`로 실행한다. 앱도 컨테이너로 실행하려면 `--profile app`을 사용한다.

```bash
# 인프라만 기동 (기본 — 개발 시)
docker compose up -d

# 인프라 + 앱 함께 기동
docker compose --profile app up -d
```

### LocalStack 초기화 스크립트

```bash
#!/bin/bash
# localstack/init-aws.sh
awslocal s3 mb s3://app-files
awslocal sqs create-queue --queue-name app-events
```

- `localstack/init-aws.sh`에 S3 버킷, SQS 큐 등 필요한 리소스를 생성한다.
- `init/ready.d/`에 배치하면 LocalStack 기동 시 자동 실행된다.
- 실행 권한 필요: `chmod +x localstack/init-aws.sh`

### .env.development

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=dev
DATABASE_PASSWORD=dev
DATABASE_NAME=app

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS (LocalStack)
AWS_ENDPOINT=http://localhost:4566
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET=app-files

# JWT
JWT_SECRET=local-dev-secret
JWT_EXPIRES_IN=1h

# App
PORT=3000
NODE_ENV=development
```

### 앱이 컨테이너로 실행될 때의 환경 변수

앱이 Docker Compose 내에서 실행되면 `localhost` 대신 **서비스명**으로 연결해야 한다.

```env
# .env.docker — 앱 컨테이너용 (docker compose --profile app 시 사용)
DATABASE_HOST=database
REDIS_HOST=redis
AWS_ENDPOINT=http://localstack:4566
```

Docker Compose 네트워크 내에서는 서비스명이 호스트명으로 해석된다 (`database` → database 컨테이너 IP).

### AWS SDK에서 LocalStack 연동

`AWS_ENDPOINT` 환경 변수가 설정되면 해당 엔드포인트로 연결한다. 운영 환경에서는 이 변수를 설정하지 않으면 기본 AWS 엔드포인트를 사용한다.

```typescript
// S3Client 예시 — StorageService 구현체에 이미 적용됨
private readonly s3 = new S3Client({
  ...(process.env.AWS_ENDPOINT ? {
    endpoint: process.env.AWS_ENDPOINT,
    forcePathStyle: true          // LocalStack은 path-style 필수
  } : {})
})
```

### 실행 방법

```bash
# 1. 인프라 기동
docker compose up -d

# 2. 앱 실행 (로컬)
npm run start:dev

# --- 또는 ---

# 전체 컨테이너 기동 (앱 포함)
docker compose --profile app up -d

# 로그 확인
docker compose logs -f app

# 전체 종료
docker compose --profile app down

# 전체 종료 + 데이터 삭제
docker compose --profile app down -v
```

### 원칙

- **로컬 개발 시 외부 서비스에 직접 연결하지 않는다**: DB는 Docker Compose, AWS 서비스는 LocalStack을 사용한다.
- **healthcheck를 설정한다**: 인프라 서비스가 준비된 후에 앱이 기동되도록 한다.
- **profiles로 앱 서비스를 분리한다**: 기본 실행은 인프라만, `--profile app`으로 앱 포함.
- **환경 변수로 엔드포인트를 분기한다**: `AWS_ENDPOINT`가 있으면 LocalStack, 없으면 실제 AWS.
- **초기화 스크립트는 프로젝트에 포함한다**: `localstack/init-aws.sh`를 커밋하여 모든 개발자가 같은 환경을 재현할 수 있도록 한다.
- **docker-compose.yml은 개발 전용이다**: 운영 인프라는 별도로 관리한다.

---

## 18. Dockerfile — 멀티스테이지 빌드

### Dockerfile

```dockerfile
# ---- Stage 1: Build ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### .dockerignore

```
node_modules
dist
.git
.env*
docker-compose.yml
localstack
```

### 설계 원칙

**멀티스테이지 빌드**: Build 스테이지에서 TypeScript를 컴파일하고, Production 스테이지에는 컴파일된 JS와 프로덕션 의존성만 포함한다. 이미지 크기를 최소화한다.

| 항목 | 설명 |
|------|------|
| Base 이미지 | `node:20-alpine` — 경량 이미지 |
| Build 스테이지 | 전체 의존성 설치 + TypeScript 빌드 |
| Production 스테이지 | `--omit=dev`로 프로덕션 의존성만 설치, `dist/` 복사 |
| EXPOSE | 3000 (환경 변수 `PORT`로 변경 가능) |
| CMD | `node dist/main.js` — `npm run start:prod`보다 프로세스 시그널 처리에 유리 |

### 원칙

- **멀티스테이지 빌드 필수**: devDependencies와 소스 코드가 프로덕션 이미지에 포함되지 않도록 한다.
- **.dockerignore 유지**: `node_modules`, `dist`, `.env*`, `.git` 등을 빌드 컨텍스트에서 제외한다.
- **CMD에 `node`를 직접 사용**: `npm run`은 중간에 npm 프로세스가 끼어 SIGTERM 전달이 지연될 수 있다.
- **환경 변수는 이미지에 포함하지 않는다**: `.env` 파일은 `.dockerignore`로 제외하고, 실행 시 `--env-file` 또는 오케스트레이션 도구에서 주입한다.

---

## 19. 핵심 설계 원칙 요약

1. **도메인 우선 디렉토리 구조** — `src/<domain>/` 하위에 domain/application/interface/infrastructure 4개 레이어 배치
2. **Domain 레이어는 프레임워크 무의존** — 순수 TypeScript. NestJS 데코레이터(@Injectable 등) 사용 금지
3. **비즈니스 규칙은 Aggregate Root에 캡슐화** — Application Service는 조율만 담당
4. **Aggregate Root 단위 Repository** — domain 레이어에 abstract class, infrastructure 레이어에 구현체
5. **NestJS DI로 Repository 주입** — `{ provide: AbstractClass, useClass: ImplClass }` 패턴
6. **Repository 조회는 `find<Noun>s` 하나만** — 단건 시 `take: 1` + `.then(r => r.<noun>s.pop())`
7. **Repository에 수정(update) 메서드 금지** — Aggregate 도메인 메서드로 수정 후 `save<Noun>`
8. **Mapping Table은 양쪽 도메인 모두에서 접근** — 도메인 간 작업 orchestration은 Service가 담당
9. **save/delete는 연결 엔티티 cascade 처리** — Service는 도메인 단위 메서드만 호출
10. **Interface DTO = Application 객체의 thin wrapper** — 로직 없이 extends만
11. **에러는 enum으로 타입화** — free-form 문자열 금지
12. **Controller에서 에러 타입 → HTTP 예외 변환** — `generateErrorResponse` 유틸 사용
13. **Domain/Service에서 HttpException throw 금지** — plain Error만 사용
