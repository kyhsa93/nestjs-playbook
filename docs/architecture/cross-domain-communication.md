# Bounded Context 간 통신 패턴

같은 프로세스 내 다른 BC를 호출할 때는 **동기(Adapter)** 와 **비동기(Integration Event)** 두 가지 방식 중 하나를 선택한다.

### 선택 기준

| 판단 기준 | 동기 (Adapter) | 비동기 (Integration Event) |
|----------|--------------|--------------------------|
| 응답이 현재 요청 처리에 필요한가? | 예 | 아니오 |
| 호출 대상 BC가 상태를 변경하는가? | 아니오 (조회만) | 예 |
| 실패 시 현재 트랜잭션을 롤백해야 하는가? | 예 | 아니오 (최종 일관성 허용) |
| 호출 방향이 단방향인가? | 대체로 양방향 가능 | 단방향 (이벤트 발행) |

> 조회가 아닌 **상태 변경**이 외부 BC에서 필요하다면, 동기 호출로 두 BC를 하나의 트랜잭션으로 묶지 않는다. Integration Event를 통해 각 BC가 독립적으로 처리하게 한다.

### 패턴 선택 흐름

```
현재 요청의 응답에 외부 BC 데이터가 필요한가?
  └─ 예 → Adapter 패턴 (동기 조회)
  └─ 아니오 → 내 BC의 도메인 작업 완료 후 외부 BC에 알릴 필요가 있는가?
                └─ 예 → Integration Event (비동기)
                └─ 아니오 → 외부 BC 호출 불필요
```

---

### 동기 호출 — Adapter 패턴 (ACL)

외부 BC의 서비스를 **현재 요청 내에서 즉시 조회**해야 할 때 사용한다.

Adapter는 **Anticorruption Layer(ACL)** 역할을 한다. 외부 BC의 모델·인터페이스가 변경되어도 내부 도메인 모델은 영향받지 않는다.

```
[주문 BC Application] → UserAdapter (interface) → UserAdapterImpl → [사용자 BC Service]
                         (내 application/adapter/)  (내 infrastructure/)
```

구현 위치와 예시는 [cross-domain.md](cross-domain.md) 참조.

**적합한 상황:**
- 주문 상세 응답에 사용자 이름을 함께 포함해야 하는 경우
- 결제 처리 전 잔액 조회가 필요한 경우

**주의:**
- 외부 BC의 Repository나 Service를 Application 레이어에서 직접 주입하지 않는다.
- Adapter를 통해 외부 BC의 **쓰기 메서드**를 호출하지 않는다. 쓰기가 필요하면 Integration Event로 전환을 검토한다.

---

### 비동기 호출 — Integration Event

내 BC의 도메인 작업이 완료된 후 **외부 BC가 이에 반응해 상태를 변경**해야 할 때 사용한다.

```
[주문 BC] → Domain Event → Application EventHandler → Integration Event → Outbox → SQS
                                                                                      ↓
                                                              [결제 BC] ← IntegrationEventController
```

발행·수신 구현은 [domain-events.md](domain-events.md) 참조.

**적합한 상황:**
- 주문 취소 후 결제 BC에서 환불을 처리해야 하는 경우
- 주문 완료 후 알림 BC에서 이메일을 발송해야 하는 경우

**주의:**
- Integration Event는 내부 Domain Event를 그대로 외부에 노출하지 않는다. Application EventHandler가 변환 지점이다.
- 수신 측은 at-least-once 전달을 전제로 멱등하게 구현한다.

---

### 두 패턴 혼용

하나의 유스케이스에서 두 패턴을 모두 사용할 수 있다.

```typescript
// 주문 취소 — 동기 조회 + 비동기 후속 처리
public async cancelOrder(command: CancelOrderCommand): Promise<void> {
  // 1. Adapter로 동기 조회 (응답에 필요)
  const user = await this.userAdapter.findUsers({ userId: command.userId, take: 1, page: 0 })
                  .then((r) => r.users.pop())
  if (!user) throw new Error(ErrorMessage['사용자를 찾을 수 없습니다.'])

  const order = await this.orderRepository.findOrders({ orderId: command.orderId, take: 1, page: 0 })
                  .then((r) => r.orders.pop())
  if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

  order.cancel(command.reason)

  // 2. save → Domain Event → Integration Event (결제 BC에 환불 요청은 비동기)
  await this.transactionManager.run(async () => {
    await this.orderRepository.saveOrder(order)
  })
}
```

---

### Context Map 패턴과의 대응

| Context Map 패턴 | 구현 방식 |
|----------------|----------|
| ACL (Anticorruption Layer) | Adapter 패턴 — 외부 모델 오염 방지 |
| OHS/PL (Open Host Service / Published Language) | Integration Event 발행 — 버전 명시(`order.cancelled.v1`) |
| Conformist | Adapter 없이 외부 BC 모델을 직접 사용 (권장하지 않음) |
| Customer-Supplier | Adapter + Integration Event 조합 |

---

### 관련 문서

- [cross-domain.md](cross-domain.md) — Adapter 패턴 구현 상세
- [domain-events.md](domain-events.md) — Integration Event 발행·수신 상세
- [module-pattern.md](module-pattern.md) — 모듈 간 imports/exports 구성
