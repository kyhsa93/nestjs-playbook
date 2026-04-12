# 에러 처리 패턴

### Controller — catch-and-rethrow

```typescript
return this.service.doSomething(param).catch((error) => {
  this.logger.error(error)
  throw generateErrorResponse(error.message, [
    [ErrorMessage['주문을 찾을 수 없습니다.'], NotFoundException],
    [ErrorMessage['이미 취소된 주문입니다.'], BadRequestException]
  ])
})
```

> `generateErrorResponse`는 에러 메시지 → HTTP 예외 변환을 담당하는 프로젝트 공통 유틸이다.
> ```typescript
> // src/common/generate-error-response.ts
> export function generateErrorResponse(
>   message: string,
>   mappings: [string, new (msg: string) => HttpException][]
> ): HttpException {
>   const matched = mappings.find(([msg]) => msg === message)
>   const [, ExceptionClass] = matched ?? [null, InternalServerErrorException]
>   return new ExceptionClass(message)
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

### Import alias — 에러 메시지 enum 임포트 시

```typescript
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'
```

### 에러 응답 형식 — 표준 JSON 구조

모든 에러 응답은 아래 형식을 따른다. 클라이언트는 이 형식을 기반으로 에러 처리를 구현한다.

```json
{
  "statusCode": 404,
  "message": "주문을 찾을 수 없습니다.",
  "error": "Not Found"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `statusCode` | `number` | HTTP 상태 코드 |
| `message` | `string` | ErrorMessage enum에 정의된 에러 메시지 |
| `error` | `string` | HTTP 상태 텍스트 |

Validation 실패 시 (class-validator):

```json
{
  "statusCode": 400,
  "message": ["orderId must be a string", "reason must be longer than or equal to 1 characters"],
  "error": "Bad Request"
}
```

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
