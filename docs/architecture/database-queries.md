# 데이터베이스 쿼리 패턴

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

#### 단일 Repository 호출

```typescript
public async createOrder(command: CreateOrderCommand): Promise<void> {
  const order = new Order({ ... })
  await this.orderRepository.saveOrder(order)  // 내부에서 outbox 저장 포함
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
