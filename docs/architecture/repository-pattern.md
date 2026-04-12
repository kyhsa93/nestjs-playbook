# Repository 패턴

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
