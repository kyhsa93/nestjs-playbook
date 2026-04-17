# Middleware / Guard / Interceptor / Pipe

NestJS 요청 파이프라인의 4개 구성 요소를 구분하여 사용한다.

## 실행 순서

```
요청 → Middleware → Guard → Interceptor (전) → Pipe → Handler → Interceptor (후) → 응답
```

각 구성 요소는 명확한 역할이 있으며, 역할에 맞지 않는 로직을 배치하지 않는다.

## 역할 구분

| 구성 요소 | 역할 | 접근 가능 정보 | 예시 |
|----------|------|--------------|------|
| **Middleware** | 요청/응답 전처리, 컨텍스트 설정 | `req`, `res`, `next` | Correlation ID 주입, 바디 파싱 |
| **Guard** | 인가 (요청 허용/거부) | `ExecutionContext` | 인증 토큰 검증, 역할 기반 접근 제어 |
| **Interceptor** | 요청/응답 변환, 횡단 관심사 | `ExecutionContext`, `CallHandler` | 로깅, 응답 시간 측정, 응답 변환 |
| **Pipe** | 입력 데이터 변환/검증 | 파라미터 값 | DTO 변환, `ValidationPipe` |

## Middleware

요청이 라우트 핸들러에 도달하기 전에 실행된다. Express middleware와 동일한 `(req, res, next)` 시그니처를 사용한다.

### 사용 시점

- 모든 요청에 대한 전처리 (Correlation ID, 요청 로깅)
- 요청 객체에 컨텍스트 정보 주입

### 구현 패턴

```typescript
// src/common/correlation-id.middleware.ts
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers['x-correlation-id'] as string) ?? randomUUID()
    res.setHeader('x-correlation-id', correlationId)
    CorrelationIdStore.run(correlationId, () => next())
  }
}
```

### 등록

```typescript
// src/app-module.ts
@Module({ /* ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}
```

### 레이어 배치

`src/common/`에 배치한다. 도메인 모듈이 아닌 공통 모듈에 속한다.

## Guard

요청의 인가 여부를 결정한다. `canActivate()` 메서드가 `true`를 반환하면 요청이 계속 진행되고, `false`면 `ForbiddenException`이 발생한다.

### 사용 시점

- 인증 토큰 검증 (JWT Bearer)
- 역할 기반 접근 제어 (RBAC)

### 구현 패턴

```typescript
// src/auth/auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) return false
    request.user = await this.authService.verify(token)
    return true
  }
}
```

### 적용

Controller **클래스 레벨**에서 적용한다. 메서드 레벨 적용은 지양한다.

```typescript
@UseGuards(AuthGuard)
@Controller('orders')
export class OrderController { /* ... */ }
```

### 레이어 배치

`src/auth/`에 배치한다. 상세 패턴은 [authentication.md](authentication.md) 참조.

## Interceptor

요청 전후에 실행되며, 응답을 변환하거나 횡단 관심사(로깅, 타이밍 등)를 처리한다.

### 사용 시점

- HTTP 요청/응답 로깅 (메서드, URL, 소요 시간)
- 응답 데이터 변환
- 타임아웃 처리

### 구현 패턴

```typescript
// src/common/logging.interceptor.ts
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
        duration_ms: Date.now() - now
      }))
    )
  }
}
```

### 적용

전역 적용 또는 Controller 클래스 레벨에서 적용한다.

```typescript
// 전역 — main.ts
app.useGlobalInterceptors(new LoggingInterceptor())

// 클래스 레벨
@UseInterceptors(LoggingInterceptor)
@Controller('orders')
export class OrderController { /* ... */ }
```

### 레이어 배치

`src/common/`에 배치한다.

## Pipe

파라미터를 변환하거나 검증한다. 주로 `ValidationPipe`를 전역으로 사용한다.

### 사용 시점

- DTO 유효성 검증 (`ValidationPipe`)
- 파라미터 타입 변환 (`ParseIntPipe`, `ParseUUIDPipe`)

### 전역 설정

```typescript
// src/main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true
}))
```

### 개별 파라미터 적용

```typescript
@Get(':orderId')
getOrder(@Param('orderId', ParseUUIDPipe) orderId: string) { /* ... */ }
```

## 사용 기준 정리

| 해야 할 일 | 사용할 구성 요소 |
|-----------|----------------|
| 모든 요청에 Correlation ID 주입 | Middleware |
| 인증 토큰 검증 | Guard |
| 역할 기반 접근 제어 | Guard |
| HTTP 요청/응답 로깅 | Interceptor |
| 응답 시간 측정 | Interceptor |
| DTO 유효성 검증 | Pipe (ValidationPipe) |
| 파라미터 타입 변환 | Pipe (ParseIntPipe 등) |

## 데코레이터 적용 레벨 규칙

Guard와 Interceptor는 **클래스 레벨**에서 적용한다. 메서드 레벨 적용은 지양한다.

```typescript
// 올바른 방식 — 클래스 레벨
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
@Controller('orders')
export class OrderController { /* ... */ }

// 지양 — 메서드 레벨 (특별한 사유가 있을 때만)
@Get(':orderId')
@UseGuards(AuthGuard)
getOrder() { /* ... */ }
```

## 원칙

- **역할에 맞는 구성 요소를 사용**: 인가는 Guard, 로깅은 Interceptor, 검증은 Pipe. 혼용하지 않는다.
- **Guard/Interceptor는 클래스 레벨 적용**: 메서드별 적용은 예외적으로만 사용한다.
- **Middleware는 공통 전처리 전용**: Correlation ID, 바디 파싱 등 모든 요청에 적용되는 로직만 Middleware로 구현한다.
- **Domain 레이어에서 사용 금지**: Middleware, Guard, Interceptor, Pipe는 모두 Interface/Infrastructure 레이어에 속한다.
