# Aggregate 생성과 ID 처리

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
  // 도메인 이벤트 outbox 저장은 domain-events.md 참조
}
```
