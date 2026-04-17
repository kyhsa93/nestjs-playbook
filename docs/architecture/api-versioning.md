# API Versioning

API 버전이 필요한 경우 URL 접두사 방식을 사용한다.

## 방식

```
/v1/orders
/v2/orders
```

URL에 버전을 명시하여 클라이언트가 명확하게 버전을 선택할 수 있도록 한다. Header 기반 버전 관리는 사용하지 않는다.

## NestJS 설정

```typescript
// src/main.ts
import { VersioningType } from '@nestjs/common'

const app = await NestFactory.create(AppModule)

app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1'
})
```

`defaultVersion: '1'`을 설정하면 `@Version()` 데코레이터가 없는 Controller는 자동으로 `/v1/` 접두사가 적용된다.

## Controller 버전 지정

### 클래스 레벨 — 전체 엔드포인트에 버전 적용

```typescript
// src/order/interface/order-controller.ts
@Controller('orders')
@Version('1')
export class OrderController {
  @Get(':orderId')
  getOrder(@Param('orderId') orderId: string) { /* ... */ }
}
// → GET /v1/orders/:orderId
```

### 메서드 레벨 — 특정 엔드포인트만 버전 분리

```typescript
@Controller('orders')
export class OrderController {
  @Get(':orderId')
  @Version('1')
  getOrderV1(@Param('orderId') orderId: string) { /* ... */ }

  @Get(':orderId')
  @Version('2')
  getOrderV2(@Param('orderId') orderId: string) { /* ... */ }
}
```

### 여러 버전 동시 지원

```typescript
@Controller('orders')
@Version(['1', '2'])
export class OrderController { /* ... */ }
// → GET /v1/orders, GET /v2/orders 모두 동일 핸들러
```

## 구버전 Deprecation

구버전 엔드포인트는 삭제하지 않고 Swagger에서 deprecated로 표시한다.

```typescript
@Get(':orderId')
@Version('1')
@ApiOperation({ summary: '주문 조회 (v1)', deprecated: true })
getOrderV1(@Param('orderId') orderId: string) { /* ... */ }
```

- 구버전은 즉시 삭제하지 않는다. 클라이언트 마이그레이션 기간을 확보한 뒤 제거한다.
- Swagger UI에서 취소선으로 표시되어 클라이언트가 인지할 수 있다.

## 버전별 Controller 분리 기준

| 변경 규모 | 전략 |
|----------|------|
| 응답 필드 추가 (하위 호환) | 버전 올리지 않음 |
| 응답 구조 변경, 필드 제거 | 새 버전 Controller 분리 |
| 요청 파라미터 필수값 변경 | 새 버전 Controller 분리 |
| 엔드포인트 경로 변경 | 새 버전 Controller 분리 |

하위 호환이 유지되는 변경(필드 추가, 선택 파라미터 추가)은 버전을 올리지 않는다.

## 원칙

- **URL 접두사 방식만 사용**: `/v1/`, `/v2/` — Header 기반 버전 관리 금지.
- **하위 호환이면 버전을 올리지 않는다**: 필드 추가, 선택 파라미터 추가는 기존 버전에서 처리한다.
- **구버전은 삭제하지 않고 deprecated 표시**: `@ApiOperation({ deprecated: true })`로 표시하고 마이그레이션 기간을 확보한다.
- **defaultVersion 설정**: 버전 데코레이터가 없는 Controller에 기본 버전이 적용되도록 한다.
