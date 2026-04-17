# Testing 아키텍처

3개 테스트 레이어로 구성하며, 각 레이어는 검증 범위와 의존성 전략이 다르다.

## 테스트 분류

| 레이어 | 검증 범위 | 의존성 전략 | 실행 속도 |
|--------|----------|------------|----------|
| Domain 단위 테스트 | Aggregate, Value Object, Domain Event | 프레임워크 없음 (순수 TypeScript) | 매우 빠름 |
| Application 단위 테스트 | Command/Query Service | Repository, Adapter를 mock | 빠름 |
| E2E 테스트 | Controller → Service → Repository 전체 경로 | SQLite in-memory 또는 testcontainers | 느림 |

## 테스트 디렉토리 구조

```
src/
  order/
    domain/
      order.spec.ts                          # Domain 단위 테스트
    application/
      command/
        order-command-service.spec.ts        # Application 단위 테스트
      query/
        order-query-service.spec.ts
test/
  order.e2e-spec.ts                          # E2E 테스트
  test-database.ts                           # SQLite in-memory 설정
```

- **Domain / Application 단위 테스트**: 해당 소스 파일과 같은 디렉토리에 `.spec.ts`로 배치
- **E2E 테스트**: 프로젝트 루트의 `test/` 디렉토리에 `.e2e-spec.ts`로 배치

## Domain 단위 테스트

프레임워크 없이 순수 TypeScript로 작성한다. NestJS Test 모듈을 사용하지 않는다.

```typescript
// src/order/domain/order.spec.ts
import { Order } from './order'
import { OrderCancelled } from './order-cancelled'

describe('Order', () => {
  const createOrder = (overrides = {}) => new Order({
    orderId: 'order-1',
    userId: 'user-1',
    items: [{ itemId: 'item-1', quantity: 2, price: 1000 }],
    status: 'pending',
    ...overrides
  })

  it('주문_항목이_비어있으면_when_생성_then_에러를_throw한다', () => {
    expect(() => createOrder({ items: [] }))
      .toThrow('주문 항목은 최소 1개 이상이어야 합니다.')
  })

  it('cancel_when_이미_취소된_주문_then_에러를_throw한다', () => {
    const order = createOrder({ status: 'cancelled' })
    expect(() => order.cancel('변심')).toThrow('이미 취소된 주문입니다.')
  })

  it('cancel_when_정상_주문_then_OrderCancelled_이벤트_발행', () => {
    const order = createOrder()
    order.cancel('변심')
    expect(order.domainEvents).toHaveLength(1)
    expect(order.domainEvents[0]).toBeInstanceOf(OrderCancelled)
  })
})
```

### 검증 대상

- Aggregate 생성 시 불변식 검증 (잘못된 입력 → 예외)
- 비즈니스 메서드 실행 후 상태 변경
- Domain Event 발행 여부 및 페이로드

## Application 단위 테스트

Repository와 Adapter를 mock으로 대체하여 Service 로직만 검증한다.

```typescript
// src/order/application/command/order-command-service.spec.ts
import { Test } from '@nestjs/testing'

import { OrderCommandService } from './order-command-service'
import { OrderRepository } from '../../domain/order-repository'
import { TransactionManager } from '@/database/transaction-manager'
import { OrderErrorMessage } from '../../order-error-message'

describe('OrderCommandService', () => {
  let service: OrderCommandService
  let orderRepository: jest.Mocked<OrderRepository>

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrderCommandService,
        {
          provide: OrderRepository,
          useValue: {
            findOrders: jest.fn(),
            saveOrder: jest.fn(),
            deleteOrder: jest.fn()
          }
        },
        {
          provide: TransactionManager,
          useValue: { run: jest.fn((fn) => fn()), getManager: jest.fn() }
        }
      ]
    }).compile()

    service = module.get(OrderCommandService)
    orderRepository = module.get(OrderRepository)
  })

  it('cancelOrder_when_주문이_존재하지_않으면_then_에러를_throw한다', async () => {
    orderRepository.findOrders.mockResolvedValue({ orders: [], count: 0 })

    await expect(service.cancelOrder({ orderId: 'non-existent-id', reason: '변심' }))
      .rejects.toThrow(OrderErrorMessage['주문을 찾을 수 없습니다.'])
  })
})
```

### Mock 패턴

```typescript
// abstract class를 jest.Mocked로 타이핑
let orderRepository: jest.Mocked<OrderRepository>

// useValue로 필요한 메서드만 mock 구현
{
  provide: OrderRepository,
  useValue: {
    findOrders: jest.fn(),
    saveOrder: jest.fn()
  }
}
```

- Repository: `jest.Mocked<AbstractClass>` 패턴 사용
- TransactionManager: `run`은 콜백을 즉시 실행하도록 mock
- Adapter: 외부 도메인 호출을 mock하여 격리

## E2E 테스트

HTTP 요청을 통해 전체 유스케이스 흐름을 검증한다.

### TestDatabaseModule — SQLite In-Memory

```typescript
// test/test-database.ts
import { TypeOrmModule } from '@nestjs/typeorm'

export const TestDatabaseModule = TypeOrmModule.forRoot({
  type: 'sqlite',
  database: ':memory:',
  entities: [__dirname + '/../src/**/*.entity.ts'],
  synchronize: true  // 테스트 환경에서만 사용
})
```

### E2E 테스트 구조

```typescript
// test/order.e2e-spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import * as request from 'supertest'

import { OrderModule } from '@/order/order-module'
import { TestDatabaseModule } from './test-database'

describe('OrderController (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TestDatabaseModule, OrderModule]
    }).compile()

    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  it('GET /orders/:orderId — 존재하는 주문 조회', () => {
    return request(app.getHttpServer())
      .get('/orders/1')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200)
  })

  afterAll(() => app.close())
})
```

### SQLite vs testcontainers 선택 기준

| 기준 | SQLite in-memory | testcontainers |
|------|-----------------|----------------|
| 속도 | 빠름 | 느림 (컨테이너 기동) |
| SQL 호환성 | PostgreSQL 전용 문법 사용 불가 | 운영 DB와 동일 |
| 설정 복잡도 | 낮음 | Docker 필요 |
| 권장 시점 | 기본 E2E 테스트 | PostgreSQL 전용 쿼리/마이그레이션 검증 |

## Jest 설정

```typescript
// jest.config.ts
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.entity.ts', '!src/**/*.module.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }
}
```

```typescript
// jest.e2e.config.ts
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }
}
```

## 테스트 네이밍

```
{도메인행위}_when_{조건}_then_{기대결과}
```

```typescript
// 예시
it('placeOrder_when_재고_부족_then_OutOfStockException_throw')
it('cancel_when_이미_취소된_주문_then_에러_throw')
it('getOrder_when_존재하지_않는_주문_then_404_반환')
```

## 원칙

- **Domain 테스트는 프레임워크 없이 작성**: `new Aggregate()`로 직접 생성하여 테스트한다. NestJS Test 모듈을 사용하지 않는다.
- **Application 테스트는 mock으로 격리**: Repository, Adapter를 mock으로 대체하여 Service 로직만 검증한다.
- **E2E 테스트는 SQLite in-memory 기본**: 운영 DB와의 SQL 차이가 문제되면 testcontainers를 사용한다.
- **운영 DB에 직접 연결 금지**: 테스트 환경은 항상 격리된 DB를 사용한다.
- **테스트 간 데이터 간섭 없음**: 각 테스트 스위트는 독립된 DB 상태에서 실행한다.
- **Aggregate 불변식 테스트 필수**: 모든 비즈니스 규칙에 대해 위반 시 예외 발생을 검증한다.
