# Pagination / 공통 응답 패턴

목록 조회 API의 페이지네이션과 응답 구조를 정의한다.

## 페이지네이션 방식

오프셋 기반 페이지네이션을 기본으로 사용한다.

| 파라미터 | 타입 | 설명 | 기본값 |
|---------|------|------|--------|
| `page` | number | 페이지 번호 (0부터 시작) | 0 |
| `take` | number | 페이지 크기 | 20 |
| `sort` | string | 정렬 기준 (`createdAt:desc`) | 선택 |

```
GET /orders?page=0&take=20&status=pending&status=paid&sort=createdAt:desc
```

## Query DTO

```typescript
// src/order/application/query/get-orders-query.ts
export class GetOrdersQuery {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly page: number = 0

  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly take: number = 20

  @IsOptional()
  @IsEnum(OrderStatus, { each: true })
  readonly status?: OrderStatus[]

  @IsOptional()
  @IsString()
  readonly sort?: string
}
```

- `@Type(() => Number)`: querystring은 문자열이므로 숫자로 변환
- `page`와 `take`에 기본값을 지정하여 클라이언트가 생략할 수 있도록 한다

## Repository 인터페이스

목록 조회 메서드는 항상 **도메인 객체 배열 + count**를 반환한다. 키 이름은 도메인 객체명의 복수형을 사용한다.

```typescript
// src/order/domain/order-repository.ts
export abstract class OrderRepository {
  abstract findOrders(query: {
    orderId?: string
    userId?: string
    status?: OrderStatus[]
    take: number
    page: number
  }): Promise<{ orders: Order[]; count: number }>

  abstract saveOrder(order: Order): Promise<void>
  abstract deleteOrder(orderId: string): Promise<void>
}
```

### 단건 조회 패턴

별도의 `findOne` 메서드를 만들지 않는다. `findOrders`에 `take: 1`을 전달하고 `.then()` 체이닝으로 변환한다.

```typescript
const order = await this.orderRepository
  .findOrders({ orderId, take: 1, page: 0 })
  .then((r) => r.orders.pop())

if (!order) throw new Error(OrderErrorMessage['주문을 찾을 수 없습니다.'])
```

## Repository 구현체 — QueryBuilder 패턴

```typescript
// src/order/infrastructure/order-repository-impl.ts
async findOrders(query: {
  orderId?: string
  userId?: string
  status?: OrderStatus[]
  take: number
  page: number
}): Promise<{ orders: Order[]; count: number }> {
  const qb = this.manager
    .createQueryBuilder(OrderEntity, 'order')
    .leftJoinAndSelect('order.items', 'item')

  // 동적 where 조건
  if (query.orderId) {
    qb.andWhere('order.orderId = :orderId', { orderId: query.orderId })
  }
  if (query.userId) {
    qb.andWhere('order.userId = :userId', { userId: query.userId })
  }
  if (query.status) {
    qb.andWhere('order.status IN (:...status)', { status: query.status })
  }

  qb.take(query.take).skip(query.page * query.take)

  const [entities, count] = await qb.getManyAndCount()
  return { orders: entities.map(this.toDomain), count }
}
```

### 동적 where 조건 규칙

- 각 조건은 `if (query.field)` 가드로 감싸서 값이 있을 때만 적용
- 배열 조건은 `IN (:...param)` 스프레드 문법 사용
- `andWhere`로 조건을 누적 — `where`는 첫 호출에만 사용하거나 QueryBuilder에 위임

## 응답 구조

### 목록 조회 응답

Controller에서 Query 결과를 Response DTO로 감싼다.

```typescript
// src/order/interface/dto/get-orders-response-body.ts
export class GetOrdersResponseBody {
  @ApiProperty({ type: [GetOrderResponseBody] })
  readonly orders: GetOrderResponseBody[]

  @ApiProperty()
  readonly count: number
}
```

```json
{
  "orders": [
    { "orderId": "abc123", "status": "pending", "totalAmount": 30000 }
  ],
  "count": 42
}
```

- 키 이름은 도메인 객체명 복수형 (`orders`, `users`, `payments`)
- `result`, `data`, `items` 같은 범용 키를 사용하지 않는다

### 단건 조회 응답

```json
{
  "orderId": "abc123",
  "status": "pending",
  "totalAmount": 30000,
  "items": [
    { "itemId": "item-1", "quantity": 2, "price": 15000 }
  ]
}
```

범용 래퍼(`{ success: true, data: { ... } }`)로 감싸지 않는다. 도메인 객체를 직접 반환한다.

## 원칙

- **오프셋 기반 페이지네이션 기본**: `page` (0부터), `take` (페이지 크기) 파라미터를 사용한다.
- **단건 조회 메서드 없음**: `findOrders({ take: 1 }).then(r => r.orders.pop())` 패턴을 사용한다.
- **응답 키는 도메인 복수형**: `{ orders: [...], count: N }` — 범용 키(`data`, `result`) 금지.
- **범용 래퍼 없음**: `{ success, data }` 패턴을 사용하지 않는다. 에러는 HTTP 상태 코드로 구분한다.
- **동적 where는 조건부 체이닝**: `if (query.field) qb.andWhere(...)` 패턴으로 조건을 누적한다.
