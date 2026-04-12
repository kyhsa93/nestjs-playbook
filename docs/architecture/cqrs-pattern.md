# @nestjs/cqrs 적용 패턴

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
    private readonly transactionManager: TransactionManager
  ) {}

  public async execute(command: CancelOrderCommand): Promise<void> {
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
| Application 레이어 | `CommandService` + `QueryService` 분리 | Command/Query별 개별 Handler 파일 |
| Controller 의존성 | `OrderCommandService` + `OrderQueryService` 주입 | `CommandBus`, `QueryBus` 주입 |
| 이벤트 처리 | Outbox + SQS + `@HandleEvent` 핸들러 | Outbox + SQS + `@HandleEvent` 핸들러 (동일) |
| Module 등록 | `CommandService`, `QueryService`, `{ provide: Query, useClass: QueryImpl }` 등록 | 각 Handler를 개별 등록 |
| 읽기/쓰기 분리 | Command Service / Query Service로 분리 | Command/Query Handler로 분리 |

### 적용 기준

- **Service 방식 권장**: 유스케이스가 적고, 이벤트 기반 처리가 불필요한 단순한 도메인
- **@nestjs/cqrs 방식 권장**: 유스케이스가 많고, 읽기/쓰기 모델 분리가 필요하거나, Domain Event 기반 후속 처리가 있는 복잡한 도메인

> 두 방식은 한 프로젝트 내에서 도메인별로 혼용할 수 있다. Core Domain에는 CQRS를, Supporting/Generic Subdomain에는 Service 방식을 적용하는 것이 일반적이다.
