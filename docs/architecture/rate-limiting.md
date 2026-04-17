# Rate Limiting

`@nestjs/throttler`를 사용하여 API 요청 속도를 제한한다.

## 설치

```bash
npm install @nestjs/throttler
```

## 전역 설정

```typescript
// src/app-module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 3 },    // 1초에 3회
        { name: 'medium', ttl: 10000, limit: 20 },  // 10초에 20회
        { name: 'long', ttl: 60000, limit: 100 }    // 1분에 100회
      ]
    })
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ]
})
export class AppModule {}
```

`APP_GUARD`로 등록하면 모든 엔드포인트에 자동 적용된다. 여러 throttler를 동시에 등록하여 단기/중기/장기 제한을 중첩할 수 있다.

## 엔드포인트별 커스텀 제한

특정 엔드포인트에 다른 제한을 적용하려면 `@Throttle()` 데코레이터를 사용한다.

```typescript
import { Throttle, SkipThrottle } from '@nestjs/throttler'

@Controller('orders')
export class OrderController {
  // 이 엔드포인트만 1분에 5회로 제한
  @Post()
  @Throttle({ long: { ttl: 60000, limit: 5 } })
  createOrder(@Body() body: CreateOrderRequestBody) { /* ... */ }

  // 헬스체크는 제한에서 제외
  @Get('health')
  @SkipThrottle()
  health() { return { status: 'ok' } }
}
```

### 클래스 레벨 제외

```typescript
// 전체 Controller를 제한에서 제외
@SkipThrottle()
@Controller('internal')
export class InternalController { /* ... */ }
```

## 환경별 설정

```typescript
// src/config/throttle.config.ts
import { registerAs } from '@nestjs/config'

export default registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10)
}))
```

```typescript
// src/app-module.ts
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    throttlers: [{
      ttl: config.get<number>('throttle.ttl'),
      limit: config.get<number>('throttle.limit')
    }]
  })
})
```

## 응답 헤더

Throttler는 자동으로 응답 헤더에 제한 정보를 포함한다.

| 헤더 | 설명 |
|------|------|
| `X-RateLimit-Limit` | 허용된 최대 요청 수 |
| `X-RateLimit-Remaining` | 남은 요청 수 |
| `X-RateLimit-Reset` | 제한 초기화까지 남은 시간 (초) |

제한 초과 시 `429 Too Many Requests`를 반환한다.

## 원칙

- **전역 Guard로 등록**: `APP_GUARD`로 ThrottlerGuard를 등록하여 모든 엔드포인트에 기본 제한을 적용한다.
- **엔드포인트별 세분화**: 쓰기 API(POST, PUT, DELETE)는 읽기 API보다 제한을 강하게 설정한다.
- **내부 엔드포인트 제외**: 헬스체크, 메트릭 등 내부 엔드포인트는 `@SkipThrottle()`로 제외한다.
- **환경 변수로 제한값 관리**: 하드코딩하지 않고 환경별로 조정 가능하도록 한다.
