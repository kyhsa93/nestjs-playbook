# Domain Service 패턴

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
// application/command/order-command-service.ts — Command Service에서 Domain Service 호출
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
