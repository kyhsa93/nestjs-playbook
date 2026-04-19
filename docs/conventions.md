# 코딩 컨벤션

## 1. 파일 네이밍 규칙

- 모든 파일명: `kebab-case`
- Command Service: `<domain>-command-service.ts` (`application/command/`에 배치)
- Query Service: `<domain>-query-service.ts` (`application/query/`에 배치)
- Query 인터페이스: `<domain>-query.ts` (`application/query/`에 배치)
- Query 구현체: `<domain>-query-impl.ts` (`infrastructure/`에 배치)
- 모듈: `<domain>-module.ts` (NOT `<domain>.module.ts`)
- 컨트롤러: `<domain>-controller.ts`
- 에러 메시지: `<domain>-error-message.ts`
- 에러 코드: `<domain>-error-code.ts` (모듈 루트에 위치, 메시지와 1:1 매핑)
- enum: `<domain>-enum.ts` (모듈 루트 디렉토리에 위치)
- 상수: `<domain>-constant.ts` (모듈 루트 디렉토리에 위치)
- Aggregate Root: `<aggregate-root>.ts` (domain 레이어)
- Entity: `<entity>.ts` (domain 레이어)
- Value Object: `<value-object>.ts` (domain 레이어)
- Domain Event: `<domain-event>.ts` (domain 레이어)
- Repository 인터페이스: `<aggregate>-repository.ts` (domain 레이어)
- Repository 구현체: `<aggregate>-repository-impl.ts` (infrastructure 레이어)
- DTO: 동사 우선, 서술적 — `get-orders-request-querystring.ts`, `create-order-request-body.ts`
- 커맨드: `<verb>-<noun>-command.ts`
- 쿼리: `<verb>-<noun>-query.ts` / 결과: `<verb>-<noun>-result.ts` (동사는 `get`, `find` 등 Controller 메서드명과 일치시킨다)
- Param (읽기): `<verb>-<noun>-param.ts` — URL 파라미터를 받는 읽기용 객체. `query/`에 배치한다.
- Param (쓰기): URL 파라미터만 받는 쓰기 요청도 `<verb>-<noun>-command.ts`로 정의한다. `command/`에 배치한다.
- Adapter 인터페이스: `<external-domain>-adapter.ts` (`application/adapter/`에 배치)
- Adapter 구현체: `<external-domain>-adapter-impl.ts` (`infrastructure/`에 배치)
- 기술 인프라 Service 인터페이스: `<concern>-service.ts` (`application/service/`에 배치) — 암복호화·스토리지 등 기술 인프라 추상화
- 기술 인프라 Service 구현체: `<concern>-service-impl.ts` (`infrastructure/`에 배치)
- CommandHandler (`@nestjs/cqrs`): `<verb>-<noun>-command-handler.ts`
- QueryHandler (`@nestjs/cqrs`): `<verb>-<noun>-query-handler.ts`
- EventHandler (`@nestjs/cqrs`): `<domain-event>-handler.ts` (`application/event/`에 배치)
- 설정 파일: `<concern>.config.ts` (`config/`에 배치) — `database.config.ts`, `jwt.config.ts` 등
- 설정 검증: `config-validator.ts` (`config/`에 배치)

---

## 2. 클래스 네이밍 규칙

- Command Service: `OrderCommandService`, `UserCommandService`
- Query Service: `OrderQueryService`, `UserQueryService`
- Query 인터페이스: `OrderQuery`, `UserQuery`
- Query 구현체: `OrderQueryImpl`, `UserQueryImpl`
- 컨트롤러: `OrderController`, `UserController`
- 모듈: `OrderModule`, `UserModule`
- Aggregate Root: `Order`, `User` (도메인 명사)
- Value Object: `Money`, `Address`, `OrderItem`
- Domain Event: `OrderPlaced`, `OrderCancelled` (과거형)
- Repository 인터페이스: `OrderRepository`, `UserRepository`
- Repository 구현체: `OrderRepositoryImpl`, `UserRepositoryImpl`
- Adapter 인터페이스: `UserAdapter`, `PaymentAdapter` (외부 도메인명 + Adapter)
- Adapter 구현체: `UserAdapterImpl`, `PaymentAdapterImpl`
- DTO: `GetOrderRequestParam`, `GetOrdersResponseBody`, `FindUsersRequestQuerystring`
- 커맨드: `CancelOrderCommand`, `CreateUserCommand`
- 에러 메시지 enum: `OrderErrorMessage`, `UserErrorMessage`
- 에러 코드 enum: `OrderErrorCode`, `UserErrorCode` (값은 `SCREAMING_SNAKE_CASE` 고정 문자열)
- 쿼리 결과: `GetOrdersResult`, `FindUsersResult`
- CommandHandler (`@nestjs/cqrs`): `CancelOrderCommandHandler`, `CreateOrderCommandHandler`
- QueryHandler (`@nestjs/cqrs`): `GetOrdersQueryHandler`, `GetOrderQueryHandler`
- EventHandler (`@nestjs/cqrs`): `OrderCancelledHandler`, `OrderPlacedHandler`

---

## 3. Enum / 상수 파일 분리 규칙

- **모든 enum, 상수는 반드시 별도의 파일로 정의한다** — 다른 파일 내에 인라인으로 선언하지 않는다
- **모듈 내에서 사용하는 enum과 상수는 `<domain>-module.ts`가 위치한 디렉토리에 둔다**
  - `<domain>-enum.ts` — 해당 모듈에서 사용하는 모든 enum
  - `<domain>-constant.ts` — 해당 모듈에서 사용하는 모든 상수
- Application 레이어(Query/Result/Command)에 사용되는 enum도 동일하게 모듈 루트에 정의하고 import해서 사용한다

```typescript
// order-enum.ts — 모듈 루트에 위치
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled'
}

// order-constant.ts — 모듈 루트에 위치
export const MAX_ORDER_AMOUNT = 9_999_999
export const ALLOW_ORDER_STATUS_ARRAY = ['pending', 'paid']
```

---

## 4. TypeScript 타이핑 패턴

### DTO / Result 클래스 — `public readonly` 필수

```typescript
export class Order {
  @ApiProperty()
  public readonly orderId: string

  @ApiProperty({ nullable: true, type: String })
  public readonly description: string | null

  @ApiProperty({ nullable: true, type: Date })
  public readonly completedAt: Date | null
}
```

### Command 객체 — `Object.assign` 생성자 패턴

```typescript
export class CancelOrderCommand {
  public readonly orderId: string
  public readonly reason: string
  public readonly refundAmount?: number

  constructor(command: CancelOrderCommand) {
    Object.assign(this, command)
  }
}
```

### 리터럴 유니온 타입 — 도메인 값에 사용

```typescript
public readonly status: 'pending' | 'confirmed' | 'cancelled'
public readonly result: 'success' | 'fail'
public readonly scope: 'all' | 'payment'
```

### 시간대 규칙 — KST (UTC+9) 기준

- DB에 시간 값을 저장할 때 UTC를 KST로 변환하여 저장한다.
- DB에서 읽은 시간 값은 이미 KST이므로 변환 없이 그대로 응답한다.
- 서버/DB 타임존(TZ) 설정은 변경하지 않는다.

```typescript
// KST 변환 유틸
function toKST(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
}

// 저장 시 — UTC → KST 변환 후 저장
const manager = this.transactionManager.getManager()
await manager.save(OrderEntity, { createdAt: toKST(new Date()) })

// 조회 시 — DB 값이 이미 KST이므로 그대로 반환
const order = await this.orderRepo.findOne({ where: { orderId } })
return order.createdAt // KST 그대로 응답
```

```typescript
// 잘못된 방식 — UTC 값을 그대로 저장
await manager.save(OrderEntity, { createdAt: new Date() }) // UTC 기준 저장됨

// 잘못된 방식 — DB에서 읽은 KST 값을 다시 변환
return toKST(order.createdAt) // 이중 변환으로 18시간 오차 발생
```

### Null 처리 규칙

- DB 필드: `string | null` (undefined X)
- optional 파라미터: `?` 사용 (`T | undefined`)
- `any` 사용 금지

### ORM — Repository 구현체에서 TypeORM Repository와 TransactionManager 주입

```typescript
constructor(
  @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
  private readonly transactionManager: TransactionManager
) {
  super()
}
```

### 복잡한 타입 — type alias 사용

```typescript
type OrderWithItems = Order & { items: OrderItem[] }
```

---

## 5. REST API 엔드포인트 설계 규칙

### URL 구조 — 리소스 중심, 복수 명사

URL은 **행위(동사)가 아닌 리소스(명사)**를 나타낸다. HTTP 메서드가 행위를 표현한다.

```
// 올바른 방식
GET    /orders              주문 목록 조회
GET    /orders/:orderId     주문 단건 조회
POST   /orders              주문 생성
PUT    /orders/:orderId     주문 전체 수정
PATCH  /orders/:orderId     주문 부분 수정
DELETE /orders/:orderId     주문 삭제

// 잘못된 방식
GET    /getOrders            동사를 URL에 넣지 않는다
POST   /createOrder          동사를 URL에 넣지 않는다
GET    /order/:orderId       단수형 사용 금지 — 항상 복수형
```

### HTTP 메서드와 응답 코드

| 메서드 | 용도 | 성공 코드 | 응답 바디 |
|--------|------|----------|----------|
| `GET` | 리소스 조회 | 200 OK | 있음 |
| `POST` | 리소스 생성 | 201 Created | 선택 (생성된 리소스 또는 비어있음) |
| `PUT` | 리소스 전체 수정 | 200 OK | 있음 |
| `PATCH` | 리소스 부분 수정 | 200 OK | 있음 |
| `DELETE` | 리소스 삭제 | 204 No Content | 없음 |

### 비 CRUD 행위 — 하위 리소스 또는 동사 경로

CRUD로 표현하기 어려운 행위는 **하위 리소스 경로**로 표현한다.

```
POST   /orders/:orderId/cancel        주문 취소
POST   /orders/:orderId/refund        주문 환불
POST   /users/:userId/verify-email    이메일 인증
POST   /payments/:paymentId/capture   결제 승인
```

### 계층 관계 — 중첩 리소스

리소스 간 소유/포함 관계는 URL 중첩으로 표현한다. 2단계까지만 중첩하고, 그 이상은 최상위 리소스로 분리한다.

```
// 올바른 방식 — 2단계 중첩
GET    /orders/:orderId/items                   주문 항목 목록
GET    /orders/:orderId/items/:itemId           주문 항목 단건

// 잘못된 방식 — 3단계 이상 중첩
GET    /users/:userId/orders/:orderId/items/:itemId    과도한 중첩
// → 대신 최상위로 분리
GET    /order-items/:itemId
```

### 목록 조회 — 페이지네이션과 필터링

```
GET /orders?page=0&take=20&status=pending&status=paid
```

- 페이지네이션: `page` (0부터 시작), `take` (페이지 크기)
- 필터: querystring으로 전달
- 정렬: `sort=createdAt:desc` 형식 (필요 시)

### URL 네이밍 규칙

- **복수 명사**: `/orders`, `/users`, `/payments` (단수형 사용 금지)
- **kebab-case**: `/order-items`, `/payment-methods` (camelCase, snake_case 금지)
- **소문자만 사용**: `/Orders` (X) → `/orders` (O)
- **후행 슬래시 없음**: `/orders/` (X) → `/orders` (O)
- **파일 확장자 없음**: `/orders.json` (X) → `/orders` (O)

### Deprecated 엔드포인트

사용을 중단할 엔드포인트는 즉시 삭제하지 않고 `@ApiOperation({ deprecated: true })`로 표시하여 클라이언트가 마이그레이션할 시간을 확보한다.

```typescript
@Post()
@ApiOperation({ operationId: 'createOrder', deprecated: true })
async create(@Body() body: CreateOrderRequest): Promise<OrderResponse> { ... }
```

- Swagger UI와 OpenAPI 스펙에 `deprecated: true`로 노출되어 클라이언트가 인지할 수 있다.
- 호출이 발생하면 `logger.warn()`으로 기록하여 잔존 사용자를 추적한다.
- 대체 엔드포인트와 제거 예정 시점을 `@ApiOperation({ description })`에 명시한다.

---

## 6. 메서드 네이밍 및 구성

### Controller 메서드

- `get`, `find`, `create`, `update`, `delete`, `reset`, `cancel`, `transfer` 등 동사 사용
- 모두 `public async` 이며 반환 타입 명시: `Promise<ResponseType>`
- 로직 없이 Service 위임 후 catch 처리만

### Service 메서드 구성 순서

1. `private readonly` 필드 (logger 등)
2. constructor (Repository 주입)
3. public 비즈니스 메서드
4. private 유틸/헬퍼 메서드

### Service 메서드 반환 타입 — 항상 명시

```typescript
// 올바른 방식
public async getOrder(param: { orderId: string }): Promise<GetOrderResult> { ... }
public async cancelOrder(command: CancelOrderCommand): Promise<void> { ... }

// 잘못된 방식
public async getOrder(param: { orderId: string }) { ... }  // 반환 타입 누락
```

### private 환경 분기 헬퍼 메서드

```typescript
private getPaymentApiUrl() {
  if (process.env.NODE_ENV === 'prd') return 'https://payment.api.example.com'
  return 'https://payment.dev.api.example.com'
}
```

---

## 7. import 구성 패턴

### 2그룹 순서

```typescript
// 1. 외부 패키지 (@nestjs/, 서드파티 등)
import { Injectable } from '@nestjs/common'
import * as dayjs from 'dayjs'

// 2. 내부 @/ alias imports (알파벳 순 — 경로 기준)
import { TransactionManager } from '@/database/transaction-manager'
import { formatDate } from '@/libs/datetime'
import { GetOrdersQuery } from '@/order/application/query/get-orders-query'
import { OrderRepository } from '@/order/domain/order-repository'
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'
```

### 상대경로 import 금지 — 절대경로만 사용

프로젝트 설정에 따라 아래 두 방식 중 하나를 사용한다:

**방식 1: `@/` alias (권장)**

`tsconfig.json`에 `"@/*": ["./src/*"]` alias가 정의된 프로젝트에서 사용한다.

```typescript
// 올바른 방식
import { OrderErrorMessage } from '@/order/order-error-message'
import { OrderRepository } from '@/order/domain/order-repository'
```

**방식 2: `src/` 기반 절대경로**

`@/` alias가 없고 `tsconfig.json`에 `"baseUrl": "./"` 가 설정된 프로젝트에서 사용한다.

```typescript
// 올바른 방식
import { OrderErrorMessage } from 'src/order/order-error-message'
import { OrderRepository } from 'src/order/domain/order-repository'
```

**공통 — 잘못된 방식**

```typescript
// 잘못된 방식 (상대경로)
import { OrderErrorMessage } from '../order-error-message'
import { OrderRepository } from './domain/order-repository'
```

### Named export 사용 (default export X)

```typescript
// 올바른 방식
export class OrderRepository { ... }

// 잘못된 방식
export default class OrderRepository { ... }
```

---

## 8. Swagger 문서화 패턴

모든 public 엔드포인트에 완전한 Swagger 문서화 필수:

```typescript
@ApiProperty({ description: '주문 ID', type: String, nullable: false })
@ApiProperty({ nullable: true, type: String })
@ApiProperty({ nullable: true, type: Date })
```

### DTO Validation — class-validator

```typescript
export class GetOrderRequestParam {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  public readonly orderId: string
}

export class CreateOrderRequestBody {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  public readonly description: string

  @ApiProperty({ enum: ['standard', 'express'] })
  @IsEnum(['standard', 'express'])
  public readonly deliveryType: 'standard' | 'express'
}
```

### Querystring — optional 필드 처리

```typescript
export class FindOrdersRequestQuerystring {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public readonly keyword?: string

  @ApiProperty({ minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  public readonly page: number

  @ApiProperty({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly take: number
}
```

### `@ApiProperty` 위치 — Query/Result vs Interface DTO

Application 레이어의 Query/Result 클래스에 `@ApiProperty`를 직접 작성한다.
Interface DTO는 `extends`로 상속하므로 별도로 데코레이터를 추가하지 않는다.

---

## 9. 로거 패턴

### 항상 클래스 필드로 선언

```typescript
private readonly logger = new Logger(OrderController.name)
```

### 구조화된 JSON 로그

```typescript
// 에러 로그
this.logger.error(error)

// 정보 로그 (외부 모니터링 연동 시 snake_case 필드명 권장)
this.logger.log({ message: '주문 완료', order_id: orderId, amount })
```

---

## 10. 주석 스타일

- 비즈니스 도메인 설명은 팀의 기본 언어로 인라인 주석 작성
- JSDoc 사용 안 함 — 순수 `//` 스타일만
- 긴 서비스 메서드는 섹션 주석으로 구분:

```typescript
// DB에서 주문 정보 조회
// 결제 수단 유효성 확인
// 주문 상태 변경
```

---

## 11. 커밋 메시지 컨벤션

[Conventional Commits](https://www.conventionalcommits.org/) 스펙을 따른다.

### 메시지 구조

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

- **첫 줄 (header)**: 필수. `type(scope): description` 형식. 72자 이내.
- **본문 (body)**: 선택. 빈 줄로 header와 구분. **무엇을** 변경했는지가 아니라 **왜** 변경했는지를 설명한다.
- **꼬리말 (footer)**: 선택. `BREAKING CHANGE:`, PR 번호, 이슈 번호 등을 기재한다.

### type 목록

| type | 설명 | 예시 |
|------|------|------|
| `feat` | 새로운 기능 추가 | `feat(order): 주문 취소 기능 추가` |
| `fix` | 버그 수정 | `fix(order): 결제 완료 후 주문 상태가 업데이트되지 않는 현상 수정` |
| `refactor` | 기능 변경 없이 코드 구조 변경 | `refactor(user): 사용자 조회 로직 Repository로 이동` |
| `docs` | 문서만 변경 | `docs: README 프로젝트 구조 설명 업데이트` |
| `test` | 테스트 추가 또는 수정 | `test(order): 주문 취소 불변식 단위 테스트 추가` |
| `chore` | 빌드, CI, 의존성 등 코드 외적인 작업 | `chore(ci): 배포 스크립트 수정` |
| `style` | 코드 포맷팅, 세미콜론 등 동작에 영향 없는 변경 | `style: import 정렬 수정` |
| `perf` | 성능 개선 | `perf(order): 주문 목록 조회 쿼리 최적화` |

### scope 규칙

- scope는 **서비스 도메인명**을 사용한다: `order`, `user`, `payment`, `auth` 등
- 여러 도메인에 걸친 변경이면 scope를 생략하거나 상위 개념을 사용한다
- 코드 외적인 변경은 대상을 scope로 사용한다: `ci`, `deps`, `docker` 등

### description 규칙

- 한글로 작성한다
- 명령형이 아닌 **서술형**으로 작성한다: "추가", "수정", "제거" (NOT "추가하라", "수정해")
- 첫 글자를 대문자로 시작하지 않는다 (scope 뒤 소문자 시작)
- 끝에 마침표를 붙이지 않는다

### BREAKING CHANGE

하위 호환성을 깨는 변경은 아래 두 가지 방법 중 하나로 표시한다:

```
# 방법 1: footer에 BREAKING CHANGE 기재
feat(order): 주문 응답 스키마 변경

BREAKING CHANGE: GetOrderResponseBody에서 totalPrice 필드가 totalAmount로 변경됨

# 방법 2: type 뒤에 ! 붙이기
feat(order)!: 주문 응답 스키마 변경
```

### 예시

```
# 기능 추가
feat(order): 주문 취소 기능 추가

# 버그 수정 + PR 번호
fix(order): 결제 완료 후 주문 상태가 업데이트되지 않는 현상 수정 (#123)

# 리팩터링 + 본문
refactor(user): 사용자 조회 로직 Repository로 이동 (#124)

Service에서 직접 ORM을 호출하던 로직을 UserRepositoryImpl로 이동.
Domain 레이어 분리 정책에 맞춰 변경.

# 여러 도메인에 걸친 변경
refactor: Repository 인터페이스를 abstract class로 통일

# 문서 변경
docs: enum 파일 분리 규칙 추가

# 테스트
test(order): 주문 생성 불변식 단위 테스트 추가

# BREAKING CHANGE
feat(order)!: 주문 응답 스키마 변경

BREAKING CHANGE: GetOrderResponseBody의 totalPrice → totalAmount 필드명 변경
```

---

## 12. 브랜치 및 PR 컨벤션

### 브랜치 네이밍 — Conventional Branch

브랜치명은 커밋 메시지의 `type/scope/description` 구조와 동일한 패턴을 따른다.

```
<type>/<scope>-<short-description>
```

| type | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능 개발 | `feat/order-cancel` |
| `fix` | 버그 수정 | `fix/order-status-update` |
| `refactor` | 리팩터링 | `refactor/user-repository-migration` |
| `docs` | 문서 변경 | `docs/architecture-adapter-pattern` |
| `test` | 테스트 추가/수정 | `test/order-cancel-invariant` |
| `chore` | 빌드, CI, 의존성 | `chore/ci-deploy-script` |

**규칙:**
- 모든 단어는 `kebab-case`로 작성한다.
- scope가 불필요하면 생략한다: `docs/conventional-commits-guide`
- `main` 브랜치에서 분기한다.
- `main` 브랜치에 직접 commit/push하지 않는다.

### PR 워크플로우

```
1. main에서 새 브랜치 생성
   git checkout main && git pull origin main
   git checkout -b <type>/<scope>-<short-description>

2. 작업 후 commit (Conventional Commits 형식)
   git add <files>
   git commit -m "<type>(<scope>): <description>"

3. 원격에 push
   git push -u origin <branch-name>

4. main 브랜치로 PR 생성
   gh pr create --base main --title "<type>(<scope>): <description>" --body "..."
```

### PR 제목

PR 제목은 Conventional Commits 형식과 동일하게 작성한다:

```
feat(order): 주문 취소 기능 추가
fix(order): 결제 완료 후 주문 상태가 업데이트되지 않는 현상 수정
docs: Adapter 패턴 가이드 추가
```

### PR 본문

```markdown
## Summary
- 변경 사항을 1~3줄로 요약

## Test plan
- [ ] 테스트 항목 1
- [ ] 테스트 항목 2
```

### 머지 전략

- **Squash and merge**를 기본으로 사용한다. 커밋 히스토리를 깔끔하게 유지한다.
- 머지 후 원격 브랜치는 자동 삭제한다.

---

## 13. 테스트 패턴

### 단위 테스트 — Domain 레이어 (Aggregate, Value Object)

Domain 레이어 단위 테스트는 프레임워크 없이 순수 TypeScript로 작성한다.

```typescript
// order/domain/order.spec.ts
describe('Order', () => {
  it('주문 항목이 비어있으면 생성 시 에러를 throw한다', () => {
    expect(() => new Order({
      orderId: 'order-1',
      userId: 'user-1',
      items: [],
      status: 'pending'
    })).toThrow('주문 항목은 최소 1개 이상이어야 합니다.')
  })

  it('이미 취소된 주문을 다시 취소하면 에러를 throw한다', () => {
    const order = new Order({
      orderId: 'order-1',
      userId: 'user-1',
      items: [{ itemId: 1, quantity: 2 }],
      status: 'cancelled'
    })
    expect(() => order.cancel('변심')).toThrow('이미 취소된 주문입니다.')
  })

  it('주문 취소 시 OrderCancelled 이벤트가 발행된다', () => {
    const order = new Order({
      orderId: 'order-1',
      userId: 'user-1',
      items: [{ itemId: 1, quantity: 2 }],
      status: 'pending'
    })
    order.cancel('변심')
    expect(order.domainEvents).toHaveLength(1)
    expect(order.domainEvents[0]).toBeInstanceOf(OrderCancelled)
  })
})
```

### 단위 테스트 — Application Service

Application Service 테스트는 Repository를 mock으로 대체한다.

```typescript
// order/application/command/order-command-service.spec.ts
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

  it('주문이 존재하지 않으면 에러를 throw한다', async () => {
    orderRepository.findOrders.mockResolvedValue({ orders: [], count: 0 })

    await expect(service.cancelOrder({ orderId: 'non-existent-id', reason: '변심' }))
      .rejects.toThrow(OrderErrorMessage['주문을 찾을 수 없습니다.'])
  })
})
```

### E2E 테스트 — Controller 레이어

```typescript
// test/order.e2e-spec.ts
describe('OrderController (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = module.createNestApplication()
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

### 테스트 DB 설정 — SQLite In-Memory

E2E 테스트와 통합 테스트에서는 **SQLite in-memory DB**를 사용하여 테스트 환경을 격리한다.

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

```typescript
// test/order.e2e-spec.ts
describe('OrderController (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TestDatabaseModule,  // 실제 DB 대신 SQLite in-memory 사용
        OrderModule
      ]
    }).compile()

    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterAll(() => app.close())
})
```

**원칙:**
- E2E/통합 테스트는 `synchronize: true`인 SQLite in-memory DB를 사용한다.
- 테스트마다 DB가 초기화되므로 테스트 간 데이터 간섭이 없다.
- 운영 DB와 SQLite 간 SQL 차이가 문제될 경우 **testcontainers**로 실제 DB를 사용한다.

### 테스트 네이밍 패턴

```
{도메인 행위}_when_{조건}_then_{기대 결과}
예: placeOrder_whenStockInsufficient_thenThrowsOutOfStockException
```
