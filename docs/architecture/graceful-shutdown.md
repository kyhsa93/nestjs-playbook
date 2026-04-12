# Graceful Shutdown

컨테이너 오케스트레이션 환경(Kubernetes, ECS 등)에서 SIGTERM 수신 시 진행 중인 요청을 안전하게 처리한 뒤 종료하는 패턴이다.

## main.ts 설정

```typescript
// src/main.ts
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { HttpExceptionFilter } from '@/common/http-exception.filter'
import { AppModule } from '@/app-module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Graceful Shutdown — SIGTERM/SIGINT 수신 시 NestJS 라이프사이클 훅 활성화
  app.enableShutdownHooks()

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }))

  app.useGlobalFilters(new HttpExceptionFilter())

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true
  })

  const document = SwaggerModule.createDocument(app,
    new DocumentBuilder()
      .setTitle(process.env.APP_NAME ?? 'API')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'token')
      .build()
  )
  SwaggerModule.setup('api', app, document)

  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
```

`app.enableShutdownHooks()`를 호출해야 `OnApplicationShutdown`, `BeforeApplicationShutdown` 라이프사이클 훅이 동작한다. 이 호출이 없으면 SIGTERM을 받아도 훅이 실행되지 않고 프로세스가 즉시 종료된다.

## 라이프사이클 훅

NestJS는 두 가지 종료 라이프사이클 훅을 제공한다. 실행 순서에 주의한다.

```
SIGTERM 수신
  → BeforeApplicationShutdown.beforeApplicationShutdown(signal)
    → 진행 중인 요청 처리 완료 대기, 새 요청 수락 중단
  → HTTP 서버 종료
  → OnApplicationShutdown.onApplicationShutdown(signal)
    → DB 연결 해제, 메시지 브로커 연결 해제 등 리소스 정리
  → 프로세스 종료
```

| 훅 | 시점 | 용도 |
|----|------|------|
| `BeforeApplicationShutdown` | HTTP 서버 종료 전 | 진행 중인 요청 완료 대기, 헬스체크 실패 전환 |
| `OnApplicationShutdown` | HTTP 서버 종료 후 | DB·Redis·메시지 브로커 연결 해제 |

## Infrastructure 레이어에서 리소스 정리

리소스 정리 로직은 해당 연결을 관리하는 Infrastructure 레이어 모듈에 구현한다.

### DB 연결 해제

TypeORM을 사용하는 경우, TypeORM 모듈이 자체적으로 연결을 해제하므로 별도 처리가 불필요하다. 커스텀 DataSource를 직접 관리하는 경우에만 아래 패턴을 적용한다.

```typescript
// src/common/infrastructure/database-shutdown.ts
import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { DataSource } from 'typeorm'

@Injectable()
export class DatabaseShutdown implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown() {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy()
    }
  }
}
```

### Redis 연결 해제

```typescript
// src/common/infrastructure/redis-shutdown.ts
import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisShutdown implements OnApplicationShutdown {
  constructor(private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit()
  }
}
```

### 메시지 브로커 연결 해제 (예: Bull Queue)

```typescript
// src/common/infrastructure/queue-shutdown.ts
import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull'

@Injectable()
export class QueueShutdown implements OnApplicationShutdown {
  constructor(@InjectQueue('task') private readonly queue: Queue) {}

  async onApplicationShutdown() {
    await this.queue.close()
  }
}
```

## 헬스체크 연동

로드밸런서/오케스트레이터가 종료 중인 인스턴스로 새 트래픽을 보내지 않도록 readiness 상태를 전환한다.

```typescript
// src/common/interface/health-controller.ts
import { Controller, Get } from '@nestjs/common'

import { ShutdownState } from '@/common/infrastructure/shutdown-state'

@Controller('health')
export class HealthController {
  constructor(private readonly shutdownState: ShutdownState) {}

  @Get('live')
  live() {
    return { status: 'ok' }
  }

  @Get('ready')
  ready() {
    if (this.shutdownState.isShuttingDown) {
      throw new Error('shutting down')
    }
    return { status: 'ok' }
  }
}
```

```typescript
// src/common/infrastructure/shutdown-state.ts
import { BeforeApplicationShutdown, Injectable } from '@nestjs/common'

@Injectable()
export class ShutdownState implements BeforeApplicationShutdown {
  private shuttingDown = false

  get isShuttingDown(): boolean {
    return this.shuttingDown
  }

  beforeApplicationShutdown() {
    this.shuttingDown = true
  }
}
```

ShutdownState는 `@Global()` 모듈에 등록하여 어디서든 주입받을 수 있도록 한다.

## Dockerfile / 컨테이너 연동

```dockerfile
# node를 PID 1로 실행 — SIGTERM을 직접 수신
CMD ["node", "dist/main.js"]
```

- `npm run start:prod`를 사용하면 npm 프로세스가 중간에 끼어 SIGTERM 전달이 지연된다.
- `node`를 직접 실행하여 PID 1로 SIGTERM을 즉시 수신하도록 한다.

### Kubernetes 연동

```yaml
# deployment.yaml
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - name: app
      livenessProbe:
        httpGet:
          path: /health/live
          port: 3000
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 3000
```

| 설정 | 값 | 설명 |
|------|---|------|
| `terminationGracePeriodSeconds` | 30 | SIGTERM 이후 SIGKILL까지 대기 시간. 앱의 최대 요청 처리 시간보다 여유 있게 설정 |
| `readinessProbe` | `/health/ready` | ShutdownState가 종료 상태로 전환되면 503 반환 → 로드밸런서가 트래픽 차단 |
| `livenessProbe` | `/health/live` | 프로세스 생존 확인. 종료 중에도 200 반환 (진행 중인 요청 처리를 위해) |

### 종료 흐름 요약

```
1. Kubernetes가 SIGTERM 전송
2. BeforeApplicationShutdown: ShutdownState.shuttingDown = true
3. readinessProbe 실패 → 로드밸런서가 새 트래픽 차단
4. 진행 중인 요청 처리 완료
5. HTTP 서버 종료
6. OnApplicationShutdown: DB·Redis·Queue 연결 해제
7. 프로세스 정상 종료 (exit code 0)
```

## 원칙

- **`enableShutdownHooks()` 필수**: main.ts에서 반드시 호출한다. 이 호출 없이는 라이프사이클 훅이 동작하지 않는다.
- **리소스 정리는 `OnApplicationShutdown`에서**: HTTP 서버가 종료된 후 실행되므로 안전하다.
- **readiness 전환은 `BeforeApplicationShutdown`에서**: HTTP 서버 종료 전에 새 요청 수락을 중단한다.
- **CMD에 `node` 직접 사용**: npm/yarn wrapper 없이 SIGTERM을 즉시 수신한다.
- **종료 로직에서 예외를 던지지 않는다**: `onApplicationShutdown`에서 예외가 발생하면 다른 모듈의 정리가 실행되지 않을 수 있다. try-catch로 감싸고 로그만 남긴다.
