# 크로스 도메인 호출 패턴

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
