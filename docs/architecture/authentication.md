# 인증 패턴

### 인증 흐름

```
[요청]
1. 클라이언트: Authorization: Bearer <access_token> 헤더를 포함하여 API 호출
2. AuthGuard: 헤더에서 토큰 추출 → AuthService.verify()로 검증
3. AuthService: 토큰 디코딩 → 사용자 정보 반환
4. AuthGuard: request.user에 사용자 정보 할당 → Controller로 전달

[토큰 발급]
1. 클라이언트 → 서버: POST /auth/sign-in (credentials)
2. AuthService: 인증 정보 검증 → Access Token 발급
3. 서버 → 클라이언트: { accessToken }
```

### 디렉토리 구조

```
src/
  auth/
    auth-module.ts
    auth-service.ts              ← 토큰 발급/검증 (JWT)
    auth.guard.ts                ← Bearer 토큰 추출 및 검증 Guard
    auth-error-message.ts
    interface/
      auth-controller.ts         ← POST /auth/sign-in 등
      dto/
        sign-in-request-body.ts
        sign-in-response-body.ts
```

### AuthGuard — Bearer 토큰 추출 및 검증

모든 인증 필요 Controller에 클래스 레벨로 적용한다. `Authorization` 헤더에서 `Bearer` 토큰을 추출하고, `AuthService.verify()`로 검증한 뒤 `request.user`에 사용자 정보를 할당한다.

```typescript
// src/auth/auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

import { AuthService } from '@/auth/auth-service'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException()

    const token = authorization.replace('Bearer ', '')
    const user = await this.authService.verify(token)
    if (!user) throw new UnauthorizedException()

    request.user = user
    return true
  }
}
```

### AuthService — 토큰 발급 및 검증

```typescript
// src/auth/auth-service.ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

import { AuthErrorMessage as ErrorMessage } from '@/auth/auth-error-message'

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  public async sign(payload: { userId: string }): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn')
    })
  }

  public async verify(token: string): Promise<{ userId: string } | null> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret')
      })
    } catch {
      return null
    }
  }
}
```

### AuthModule

```typescript
// src/auth/auth-module.ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'

import { AuthService } from '@/auth/auth-service'
import { AuthGuard } from '@/auth/auth.guard'
import { AuthController } from '@/auth/interface/auth-controller'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard]
})
export class AuthModule {}
```

### Controller에서 사용

```typescript
// 인증 필요 Controller — 클래스 레벨에 AuthGuard 적용
@Controller()
@ApiBearerAuth('token')
@ApiTags('Order')
@UseGuards(AuthGuard)
export class OrderController {
  // request.user로 인증된 사용자 정보 접근
  @Get('/orders')
  public async getOrders(
    @Req() req: Request & { user: { userId: string } }
  ): Promise<GetOrdersResponseBody> { ... }
}
```

```typescript
// 인증 불필요 Controller — AuthGuard 없음
@Controller()
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/auth/sign-in')
  @ApiCreatedResponse({ type: SignInResponseBody })
  public async signIn(@Body() body: SignInRequestBody): Promise<SignInResponseBody> {
    // 인증 정보 검증 후 토큰 발급
    const accessToken = await this.authService.sign({ userId: body.userId })
    return { accessToken }
  }
}
```

### Swagger 인증 설정

```typescript
// main.ts
const document = SwaggerModule.createDocument(app, 
  new DocumentBuilder()
    .setTitle('API')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'token')
    .build()
)
```

- `addBearerAuth`의 두 번째 인자 `'token'`은 Controller의 `@ApiBearerAuth('token')`과 일치시킨다.
- Swagger UI에서 Authorize 버튼으로 토큰을 입력하면 모든 요청에 `Authorization: Bearer <token>` 헤더가 자동 포함된다.

### Interceptor — 로깅/변환

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
      tap(() => this.logger.log(`${method} ${url} — ${Date.now() - now}ms`))
    )
  }
}
```
