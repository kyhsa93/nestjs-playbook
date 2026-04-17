# Scheduling / Batch 작업

`@nestjs/schedule`을 사용하여 주기적 작업과 배치 처리를 구현한다.

## 설치

```bash
npm install @nestjs/schedule
```

## 모듈 설정

```typescript
// src/app-module.ts
import { ScheduleModule } from '@nestjs/schedule'

@Module({
  imports: [
    ScheduleModule.forRoot()
  ]
})
export class AppModule {}
```

## Cron 작업

### 레이어 배치

Cron 작업은 **Infrastructure 레이어**에 배치한다. 스케줄링은 기술 관심사이므로 Application/Domain 레이어에 `@Cron` 데코레이터를 사용하지 않는다.

```
src/
  order/
    infrastructure/
      order-cleanup-scheduler.ts     # Cron 작업 — Infrastructure
    application/
      command/
        order-command-service.ts      # 비즈니스 로직 — Application
```

### 구현 패턴

Scheduler는 Application Service에 위임하여 비즈니스 로직을 실행한다. Scheduler 자체에 비즈니스 로직을 작성하지 않는다.

```typescript
// src/order/infrastructure/order-cleanup-scheduler.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

import { OrderCommandService } from '../application/command/order-command-service'

@Injectable()
export class OrderCleanupScheduler {
  private readonly logger = new Logger(OrderCleanupScheduler.name)

  constructor(private readonly orderCommandService: OrderCommandService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredOrders() {
    this.logger.log({ message: '만료 주문 정리 시작' })
    try {
      const count = await this.orderCommandService.cleanupExpiredOrders()
      this.logger.log({ message: '만료 주문 정리 완료', cleaned_count: count })
    } catch (error) {
      this.logger.error({ message: '만료 주문 정리 실패', error })
    }
  }
}
```

### Cron 표현식

`CronExpression` 상수를 우선 사용한다. 커스텀 표현식이 필요한 경우에만 문자열을 직접 사용한다.

| 표현식 | 실행 주기 |
|--------|----------|
| `CronExpression.EVERY_MINUTE` | 매분 |
| `CronExpression.EVERY_HOUR` | 매시간 |
| `CronExpression.EVERY_DAY_AT_MIDNIGHT` | 매일 자정 |
| `CronExpression.EVERY_WEEK` | 매주 |
| `'0 */5 * * * *'` | 5분마다 (커스텀) |
| `'0 0 2 * * *'` | 매일 오전 2시 (커스텀) |

### Outbox Relay 예시

기존 가이드의 Outbox 패턴에서 사용하는 Cron 작업 예시:

```typescript
// src/outbox/outbox-relay.ts
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name)

  @Cron('*/5 * * * * *') // 5초마다
  async relay() {
    // 미발송 이벤트를 SQS로 전송
  }
}
```

## 모듈 등록

Scheduler를 해당 도메인 모듈의 `providers`에 등록한다.

```typescript
// src/order/order-module.ts
@Module({
  providers: [
    OrderCommandService,
    OrderCleanupScheduler,  // Scheduler 등록
    { provide: OrderRepository, useClass: OrderRepositoryImpl }
  ]
})
export class OrderModule {}
```

## 멱등성 보장

Cron 작업은 멱등하게 구현한다. 동일 작업이 여러 번 실행되어도 결과가 같아야 한다.

```typescript
// 멱등한 구현 — 이미 처리된 건은 건너뜀
async cleanupExpiredOrders(): Promise<number> {
  const { orders } = await this.orderRepository.findOrders({
    status: ['expired'],
    take: 100,
    page: 0
  })

  for (const order of orders) {
    order.archive()  // 이미 archive 상태면 내부에서 무시
    await this.orderRepository.saveOrder(order)
  }

  return orders.length
}
```

### 다중 인스턴스 환경

여러 서버 인스턴스가 동시에 실행되는 환경에서는 동일 Cron 작업이 중복 실행될 수 있다. 아래 방법으로 방지한다.

| 방법 | 설명 |
|------|------|
| DB 락 (Advisory Lock) | 작업 시작 시 락을 획득하고 완료 후 해제 |
| 리더 선출 | 하나의 인스턴스만 스케줄러를 실행하도록 설정 |
| 멱등성 보장 | 중복 실행되어도 결과가 같도록 설계 (기본 전략) |

## Interval / Timeout

단순 반복이나 지연 실행이 필요한 경우 Interval/Timeout 데코레이터를 사용한다.

```typescript
@Interval(30000)  // 30초마다
async checkPendingPayments() { /* ... */ }

@Timeout(5000)  // 앱 기동 5초 후 1회 실행
async warmupCache() { /* ... */ }
```

## 원칙

- **Scheduler는 Infrastructure 레이어에 배치**: `@Cron`, `@Interval` 데코레이터는 기술 관심사이므로 Domain/Application 레이어에 사용하지 않는다.
- **비즈니스 로직은 Application Service에 위임**: Scheduler는 Service 메서드를 호출만 한다. 직접 비즈니스 로직을 구현하지 않는다.
- **멱등하게 구현**: 동일 작업이 여러 번 실행되어도 결과가 같아야 한다.
- **에러 처리 필수**: Cron 작업에서 예외가 발생해도 프로세스가 종료되지 않도록 try-catch로 감싸고 로그를 남긴다.
- **CronExpression 상수 우선 사용**: 가독성을 위해 NestJS 제공 상수를 사용하고, 커스텀 표현식에는 주석을 달아 실행 주기를 명시한다.
