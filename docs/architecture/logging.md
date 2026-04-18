# Logging / Observability

NestJS 내장 Logger를 기반으로 구조화된 로깅을 적용하는 패턴이다.

## Logger 선언

모든 클래스에서 Logger를 클래스 필드로 선언한다. 생성자 인자로 클래스명을 전달하여 로그 출처를 식별한다.

```typescript
import { Logger } from '@nestjs/common'

export class OrderCommandService {
  private readonly logger = new Logger(OrderCommandService.name)
}
```

## 로그 레벨 정책

NestJS Logger는 5단계 레벨을 제공한다. 각 레벨의 용도를 지켜 사용한다.

| 레벨 | 메서드 | 용도 | 예시 |
|------|--------|------|------|
| `error` | `logger.error()` | 요청 처리 실패, 외부 시스템 장애 | DB 연결 실패, 외부 API 5xx |
| `warn` | `logger.warn()` | 정상 동작이지만 주의가 필요한 상황 | Deprecated 엔드포인트 호출, 재시도 발생 |
| `log` | `logger.log()` | 주요 비즈니스 이벤트, 상태 변경 | 주문 생성, 결제 완료, 앱 기동 |
| `debug` | `logger.debug()` | 개발/디버깅용 상세 정보 | 쿼리 파라미터, 중간 계산 결과 |
| `verbose` | `logger.verbose()` | 최대 상세 정보 | 전체 요청/응답 페이로드 |

### 환경별 로그 레벨 설정

```typescript
// src/main.ts
const app = await NestFactory.create(AppModule, {
  logger: process.env.NODE_ENV === 'production'
    ? ['error', 'warn', 'log']
    : ['error', 'warn', 'log', 'debug', 'verbose']
})
```

- **프로덕션**: `error`, `warn`, `log`만 출력
- **개발/스테이징**: 전체 레벨 출력

## 구조화된 로깅

외부 모니터링 시스템(Datadog, CloudWatch 등)과 연동할 때는 JSON 형식의 구조화된 로그를 사용한다.

### 필드 네이밍 규칙

로그 객체의 필드명은 **snake_case**를 사용한다.

```typescript
// 비즈니스 이벤트 로그
this.logger.log({ message: '주문 생성 완료', order_id: orderId, user_id: userId, amount })

// 에러 로그
this.logger.error({ message: 'SQS 전송 실패', event_id: event.eventId, error })
```

### 레이어별 로깅 기준

| 레이어 | 로깅 대상 | 레벨 |
|--------|----------|------|
| Interface (Controller) | 요청 에러 (catch 블록) | `error` |
| Application (Service) | 비즈니스 이벤트, 외부 시스템 호출 결과 | `log`, `error` |
| Infrastructure | 외부 연동 실패/재시도, 쿼리 성능 | `error`, `warn`, `debug` |
| Domain | 로깅하지 않음 (프레임워크 무의존) | — |

Domain 레이어에서는 `Logger`를 사용하지 않는다. 도메인 로직의 결과는 Application 레이어에서 로깅한다.

## Correlation ID — 요청 추적

분산 환경에서 하나의 요청이 여러 서비스를 거칠 때, 모든 로그에 동일한 Correlation ID를 포함하여 추적한다.

### CorrelationIdMiddleware

```typescript
// src/common/correlation-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

import { CorrelationIdStore } from '@/common/correlation-id-store'

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers['x-correlation-id'] as string) ?? randomUUID()
    CorrelationIdStore.run(correlationId, () => {
      res.setHeader('x-correlation-id', correlationId)
      next()
    })
  }
}
```

### AsyncLocalStorage 기반 저장소

```typescript
// src/common/correlation-id-store.ts
import { AsyncLocalStorage } from 'async_hooks'

const storage = new AsyncLocalStorage<string>()

export const CorrelationIdStore = {
  run: (id: string, fn: () => void) => storage.run(id, fn),
  getId: () => storage.getStore()
}
```

### Middleware 등록

```typescript
// src/app-module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'

import { CorrelationIdMiddleware } from '@/common/correlation-id.middleware'

@Module({ /* ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}
```

### 로그에 Correlation ID 포함

```typescript
import { CorrelationIdStore } from '@/common/correlation-id-store'

this.logger.log({
  message: '주문 생성 완료',
  correlation_id: CorrelationIdStore.getId(),
  order_id: orderId
})
```

## LoggingInterceptor — HTTP 요청/응답 로깅

모든 HTTP 요청의 메서드, URL, 응답 시간을 자동 로깅한다. `src/common/logging.interceptor.ts`에 위치한다.

```typescript
// src/common/logging.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'

import { CorrelationIdStore } from '@/common/correlation-id-store'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest()
    const { method, url } = req
    const now = Date.now()

    return next.handle().pipe(
      tap(() => this.logger.log({
        message: `${method} ${url}`,
        method,
        url,
        duration_ms: Date.now() - now,
        correlation_id: CorrelationIdStore.getId()
      }))
    )
  }
}
```

전역 적용은 [bootstrap.md](bootstrap.md)에서 `app.useGlobalInterceptors(new LoggingInterceptor())`로 등록하거나, Controller 클래스 레벨에서 `@UseInterceptors(LoggingInterceptor)`로 적용한다.

## 원칙

- **Logger는 클래스 필드로 선언**: `new Logger(ClassName.name)` — 로그 출처를 자동 식별한다.
- **Domain 레이어에서 로깅 금지**: Domain은 프레임워크 무의존을 유지한다.
- **구조화된 로그 사용**: 외부 모니터링 연동을 위해 JSON 객체로 로깅하고 필드명은 snake_case를 사용한다.
- **에러는 `logger.error()`로**: catch 블록에서 반드시 에러를 로깅한 뒤 예외를 던진다.
- **프로덕션에서 debug/verbose 비활성화**: 환경별 로그 레벨을 설정하여 불필요한 로그를 차단한다.
- **Correlation ID로 요청 추적**: 분산 환경에서는 모든 로그에 Correlation ID를 포함한다.

## 메트릭·트레이싱 (메모)

본 가이드는 특정 observability 스택을 강제하지 않는다. 운영 환경에서 다음을 고려한다.

- **메트릭**: 일반적으로 Prometheus(`/metrics` 엔드포인트 + 스크레이프). NestJS에서는 `@willsoto/nestjs-prometheus` 같은 패키지로 통합 가능.
- **트레이싱**: OpenTelemetry auto-instrumentation으로 HTTP/TypeORM/SQS span을 자동 수집. Task Queue를 쓰는 경우 `traceparent`를 `task_outbox`에 실어 Task 경계에서 context를 전파하면 HTTP 요청 → Task 처리가 단일 trace로 묶인다.
- **알람 최우선 항목**: DLQ depth > 0, SQS `ApproximateAgeOfOldestMessage`, HTTP 5xx rate, p99 지연, DB 커넥션 풀 포화.
- **로그 ↔ 트레이스 상관관계**: log 레코드에 `trace_id`를 포함시켜 trace → log 점프 가능하도록 한다.

구체 구현은 각 스택의 공식 문서 및 팀 컨벤션에 따른다.
