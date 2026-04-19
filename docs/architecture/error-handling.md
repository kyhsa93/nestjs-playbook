# 에러 처리 패턴

### Controller — catch-and-rethrow

```typescript
return this.service.doSomething(param).catch((error) => {
  this.logger.error(error)
  throw generateErrorResponse(error.message, [
    [ErrorMessage['주문을 찾을 수 없습니다.'], NotFoundException, ErrorCode.ORDER_NOT_FOUND],
    [ErrorMessage['이미 취소된 주문입니다.'], BadRequestException, ErrorCode.ORDER_ALREADY_CANCELLED]
  ])
})
```

> `generateErrorResponse`는 에러 메시지 → HTTP 예외 변환 + 고유 에러 코드 부여를 담당하는 프로젝트 공통 유틸이다.
> 매핑 튜플은 `[에러 메시지, HttpException 클래스, 에러 코드]` 3-튜플이다.
> ```typescript
> // src/common/generate-error-response.ts
> import { HttpException, HttpStatus, InternalServerErrorException } from '@nestjs/common'
>
> type ExceptionCtor = new (response: string | object) => HttpException
>
> export function generateErrorResponse(
>   message: string,
>   mappings: [string, ExceptionCtor, string][]
> ): HttpException {
>   const matched = mappings.find(([msg]) => msg === message)
>   const [, ExceptionClass, code] = matched ?? [null, InternalServerErrorException, 'INTERNAL_ERROR']
>   const probe = new ExceptionClass(message)
>   const statusCode = probe.getStatus()
>   const error = HttpStatus[statusCode] ?? probe.name
>   return new ExceptionClass({ statusCode, code, message, error })
> }
> ```

### Domain / Service — plain Error throw (HttpException X)

Domain 레이어와 Application Service에서는 plain `Error`만 throw한다.
에러 메시지는 Aggregate 내부 포함 모든 곳에서 `ErrorMessage` enum을 참조한다.

```typescript
// domain/order.ts — Aggregate 내부에서도 enum 참조
import { OrderErrorMessage } from '@/order/order-error-message'
if (this._status === 'cancelled') throw new Error(OrderErrorMessage['이미 취소된 주문입니다.'])

// application/command/order-command-service.ts — Command Service
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'
if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])
```

### 에러 메시지 — enum으로 정의 (free-form 문자열 X)

```typescript
export enum OrderErrorMessage {
  '주문을 찾을 수 없습니다.' = '주문을 찾을 수 없습니다.',
  '이미 취소된 주문입니다.' = '이미 취소된 주문입니다.',
  '결제 완료된 주문은 취소할 수 없습니다.' = '결제 완료된 주문은 취소할 수 없습니다.',
  '결제 정보를 찾을 수 없습니다.' = '결제 정보를 찾을 수 없습니다.',
  '주문 항목은 최소 1개 이상이어야 합니다.' = '주문 항목은 최소 1개 이상이어야 합니다.',
  '상품 가격은 0보다 커야 합니다.' = '상품 가격은 0보다 커야 합니다.',
  '수량은 0보다 커야 합니다.' = '수량은 0보다 커야 합니다.',
}
```

> 위 enum은 Order 도메인 예시이다. 실제 프로젝트에서는 Domain Service 등에서 사용하는 에러 메시지도 동일한 enum 파일에 추가한다.

### 에러 코드 — enum으로 정의 (메시지와 1:1 매핑)

모든 에러 상황은 메시지와 별개로 고유한 에러 코드(string)를 가진다. HTTP 상태 코드가 "범주"라면 에러 코드는 "정확한 원인"이다.
클라이언트는 메시지 텍스트가 아닌 `code`로 분기 처리해야 하므로 코드는 안정적이어야 하며 번역/수정되는 메시지 문자열과 분리한다.

```typescript
// order-error-code.ts — <domain>-error-code.ts
export enum OrderErrorCode {
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_ALREADY_CANCELLED = 'ORDER_ALREADY_CANCELLED',
  ORDER_PAID_NOT_CANCELLABLE = 'ORDER_PAID_NOT_CANCELLABLE',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  ORDER_ITEMS_REQUIRED = 'ORDER_ITEMS_REQUIRED',
  INVALID_PRICE = 'INVALID_PRICE',
  INVALID_QUANTITY = 'INVALID_QUANTITY'
}
```

코드 작성 규칙:
- 파일명: `<domain>-error-code.ts` (모듈 루트)
- 클래스명: `<Domain>ErrorCode`
- 키/값: `SCREAMING_SNAKE_CASE`, 값은 키와 동일 문자열
- 프로젝트 전역 유일 — 다른 도메인 코드와 충돌 시 prefix 추가 (`USER_ORDER_NOT_FOUND` 등은 금지. 해당 도메인의 `ErrorCode`만 사용)
- `<Domain>ErrorMessage`의 모든 항목에 대해 1:1 매핑되는 코드가 존재해야 한다

### Import alias — 에러 메시지 / 에러 코드 enum 임포트 시

```typescript
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'
import { OrderErrorCode as ErrorCode } from '@/order/order-error-code'
```

### 에러 응답 형식 — 표준 JSON 구조

모든 에러 응답은 아래 형식을 따른다. 클라이언트는 이 형식을 기반으로 에러 처리를 구현한다.

```json
{
  "statusCode": 404,
  "code": "ORDER_NOT_FOUND",
  "message": "주문을 찾을 수 없습니다.",
  "error": "Not Found"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `statusCode` | `number` | HTTP 상태 코드 |
| `code` | `string` | `<Domain>ErrorCode` enum 값. 클라이언트 분기 처리의 기준 |
| `message` | `string` | `<Domain>ErrorMessage` enum에 정의된 에러 메시지 (사용자 표시용) |
| `error` | `string` | HTTP 상태 텍스트 |

Validation 실패 시 (class-validator) — 프레임워크가 던지는 케이스로 `code`는 `VALIDATION_FAILED` 고정:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": ["orderId must be a string", "reason must be longer than or equal to 1 characters"],
  "error": "Bad Request"
}
```

> Validation 실패 응답에 `code`를 붙이려면 `app.useGlobalPipes(new ValidationPipe({ exceptionFactory: ... }))`에서 `BadRequestException({ statusCode: 400, code: 'VALIDATION_FAILED', message, error: 'Bad Request' })` 형태로 반환한다.

### 전역 예외 필터

```typescript
// src/common/http-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import { Response } from 'express'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()

    this.logger.error({ status, message: exception.message })

    response.status(status).json(
      typeof exceptionResponse === 'string'
        ? { statusCode: status, message: exceptionResponse, error: exception.name }
        : exceptionResponse
    )
  }
}
```
