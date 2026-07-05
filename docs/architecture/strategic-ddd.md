# 전략적 설계 — Subdomain, Bounded Context, Context Map

전술적 설계(Aggregate, Repository, Domain Event) 이전에 수행하는 **문제 공간 분석**이다. 어떤 영역에 얼마나 투자할지, BC 경계를 어디에 그을지, BC 간 관계를 어떻게 관리할지를 결정한다.

---

### Subdomain 분류

비즈니스 도메인을 기능 영역별로 나누고, 각 영역의 전략적 가치를 분류한다.

| 유형 | 정의 | 구현 전략 |
|------|------|----------|
| **Core Domain** | 이 비즈니스만의 경쟁력. 직접 구현해야 하며 가장 많은 투자가 필요한 영역 | DDD 전술 패턴 전체 적용. 도메인 전문가와 긴밀히 협업 |
| **Supporting Subdomain** | Core를 지원하지만 차별화 요소는 아닌 영역 | 직접 구현하되 Core보다 단순하게. CQRS 생략 가능 |
| **Generic Subdomain** | 업종에 관계없이 공통으로 필요한 영역 | 외부 솔루션 도입 우선 검토 (인증, 알림, 결제 게이트웨이 등) |

**예시 — 이커머스:**

```
Core Domain      : 주문, 상품 추천
Supporting       : 재고, 배송 추적
Generic          : 인증(Auth0), 이메일 발송(SES), 결제(PG사)
```

> Core Domain에 시간과 설계 비용을 집중한다. Supporting은 단순하게, Generic은 직접 구현하지 않는다.

---

### Bounded Context

**Bounded Context(BC)** 는 특정 도메인 모델이 유효한 명시적 경계다. 같은 단어라도 BC에 따라 의미가 다를 수 있다.

#### BC 경계 식별 기준

- **용어의 의미가 달라지는 지점**: "상품"이 카탈로그 BC에서는 전시 정보, 주문 BC에서는 구매 항목
- **독립적으로 배포·변경할 수 있어야 하는 단위**
- **서로 다른 팀이 담당하는 영역**

#### NestJS 모듈과의 대응

**1 Bounded Context = 1 NestJS Module**. BC 경계가 모듈 경계다.

```
주문 BC   → OrderModule   (src/order/)
사용자 BC → UserModule    (src/user/)
결제 BC   → PaymentModule (src/payment/)
```

각 BC 내부 구현(Aggregate, Repository, Service)은 외부에 노출하지 않는다. 다른 BC는 `exports`된 Service만 사용하거나, Integration Event로 통신한다.

#### 유비쿼터스 언어(Ubiquitous Language)

BC 내에서 개발자·도메인 전문가가 **동일한 용어**를 사용한다. 코드의 클래스명·메서드명이 곧 유비쿼터스 언어다.

```typescript
// 주문 BC — "Order"는 구매 의사를 담은 트랜잭션 단위
export class Order { ... }

// 배송 BC — "Order"는 물리적 발송 작업 단위 (같은 단어, 다른 의미 → 다른 BC)
export class ShipmentOrder { ... }
```

BC 경계를 넘어 모델을 공유하면 용어 혼란과 결합이 생긴다. 각 BC가 자기 모델을 독립적으로 유지한다.

---

### Context Map

BC 간의 관계 유형을 정의한다. 관계 유형에 따라 NestJS 구현 방식이 결정된다.

#### 관계 유형과 구현 방식

| 패턴 | 설명 | NestJS 구현 |
|------|------|------------|
| **ACL** (Anticorruption Layer) | 하류 BC가 상류 모델의 오염을 방지하기 위해 변환 계층을 둠 | Adapter 패턴 — `application/adapter/` + `infrastructure/*-adapter-impl.ts` |
| **OHS/PL** (Open Host Service / Published Language) | 상류 BC가 안정적인 공개 계약을 제공 | Integration Event 발행 — 버전 명시(`order.cancelled.v1`) |
| **Customer-Supplier** | 하류(Customer)가 상류(Supplier)에 요구사항을 전달하며 협력 | Adapter + Integration Event 조합. 상류 팀과 인터페이스 합의 필요 |
| **Conformist** | 하류가 상류 모델을 그대로 따름. 변환 없음 | 외부 모델을 직접 사용 — 상류 변경에 취약하므로 권장하지 않음 |
| **Shared Kernel** | 두 BC가 일부 모델을 공유 | `src/shared/` 공유 모듈. 변경 시 양측 합의 필요. 최소화 권장 |
| **Partnership** | 두 팀이 동시에 성공·실패하므로 긴밀히 협력 | 모듈 간 직접 의존 허용. 독립 배포가 어려워지므로 제한적으로만 사용 |

#### Context Map 다이어그램 예시

```
[주문 BC] --ACL--> [사용자 BC]          ← 주문이 사용자 정보를 Adapter로 조회
[주문 BC] --OHS/PL--> [결제 BC]         ← 주문이 Integration Event를 발행, 결제가 수신
[주문 BC] --ACL--> [외부 배송 API]      ← 외부 시스템은 항상 ACL로 격리
[인증 BC] --OHS/PL--> [주문·결제·사용자 BC]  ← 인증은 공개 서비스로 모든 BC가 사용
```

#### 패턴별 구현 위치

**ACL (Adapter 패턴)**
```
order/
  application/adapter/user-adapter.ts          ← 인터페이스 (abstract class)
  infrastructure/user-adapter-impl.ts          ← 구현체 (UserService 호출)
```
→ 상세 구현은 [cross-domain.md](cross-domain.md) 참조

**OHS/PL (Integration Event)**
```
order/
  application/integration-event/order-cancelled-integration-event.ts  ← 공개 계약
  application/event/order-cancelled-handler.ts                        ← 발행
payment/
  interface/integration-event/payment-integration-event-controller.ts ← 수신
```
→ 상세 구현은 [domain-events.md](domain-events.md) 참조

---

### 설계 순서

전략적 설계는 전술적 설계보다 먼저 수행한다.

```
1. Subdomain 분류       — Core / Supporting / Generic 식별
2. BC 식별              — 용어 경계, 팀 경계, 배포 단위 기준
3. Context Map 작성     — BC 간 관계 유형 결정
4. 유비쿼터스 언어 정의 — BC별 핵심 용어 사전 작성
       ↓
5. 전술적 설계 (Aggregate, Repository, Domain Event, Application Service)
```

전략적 설계 산출물(Subdomain 분류표, BC 정의서, Context Map)을 사용자와 합의한 후 전술 설계로 진입한다. 상세 절차는 [development-process.md](../development-process.md) 참조.

---

### 관련 문서

- [cross-domain-communication.md](cross-domain-communication.md) — BC 간 통신 패턴 선택 기준
- [cross-domain.md](cross-domain.md) — Adapter 패턴 구현 상세
- [domain-events.md](domain-events.md) — Integration Event 발행·수신 상세
- [module-pattern.md](module-pattern.md) — NestJS 모듈 구성 (1 BC = 1 Module)
- [development-process.md](../development-process.md) — 전략적 설계 절차 (Agent 2: Strategic Designer)
