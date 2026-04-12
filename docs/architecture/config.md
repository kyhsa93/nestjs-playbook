# 환경 설정 패턴

### 디렉토리 구조

```
src/
  config/
    database.config.ts        # DB 관련 설정
    jwt.config.ts             # JWT 관련 설정
    s3.config.ts              # S3 관련 설정
    config-validator.ts       # 환경 변수 검증 클래스
```

- 관심사별로 설정 파일을 분리한다.
- 모든 설정 파일은 `src/config/` 디렉토리에 위치한다.

### 루트 모듈에 ConfigModule 등록

```typescript
// app-module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { validateConfig } from '@/config/config-validator'
import { databaseConfig } from '@/config/database.config'
import { jwtConfig } from '@/config/jwt.config'
import { s3Config } from '@/config/s3.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, s3Config],
      validate: validateConfig,
    }),
    OrderModule,
    UserModule,
    PaymentModule,
  ]
})
export class AppModule {}
```

- `isGlobal: true` — 모든 모듈에서 `ConfigService`를 별도 import 없이 주입받을 수 있다.
- `load` — 관심사별로 분리한 설정 팩토리 함수를 등록한다.
- `validate` — 앱 기동 시 환경 변수를 검증한다. 검증 실패 시 기동을 중단한다.

### 설정 팩토리 함수

```typescript
// config/database.config.ts
export const databaseConfig = () => ({
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? '',
    name: process.env.DATABASE_NAME ?? 'app',
  },
})
```

```typescript
// config/jwt.config.ts
export const jwtConfig = () => ({
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
})
```

- 팩토리 함수는 네스팅된 객체를 반환하여 관심사별로 네임스페이스를 구분한다.
- `ConfigService`에서 `this.configService.get<string>('database.host')` 형태로 접근한다.

### 환경 변수 검증 — class-validator

앱 기동 시 필수 환경 변수가 누락되거나 잘못된 값이 들어오면 **즉시 프로세스를 종료**한다. 잘못된 설정으로 런타임에 장애가 발생하는 것보다, 기동 단계에서 빠르게 실패(fail-fast)하는 것이 안전하다.

```typescript
// config/config-validator.ts
import { plainToInstance } from 'class-transformer'
import { IsNotEmpty, IsNumber, IsString, validateSync } from 'class-validator'

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_HOST: string

  @IsNumber()
  DATABASE_PORT: number

  @IsString()
  @IsNotEmpty()
  DATABASE_USER: string

  @IsString()
  @IsNotEmpty()
  DATABASE_PASSWORD: string

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME: string

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string
}

export function validateConfig(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  })

  const errors = validateSync(validated, { skipMissingProperties: false })

  if (errors.length > 0) {
    console.error('Environment validation failed:')
    console.error(errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n'))
    process.exit(1)
  }

  return validated
}
```

- `plainToInstance`의 `enableImplicitConversion: true` — 문자열로 들어오는 환경 변수를 `@IsNumber()` 등 데코레이터 타입에 맞게 자동 변환한다.
- `validateSync` — 동기 검증. NestJS `ConfigModule`의 `validate` 옵션은 동기 함수를 기대한다.
- 검증 실패 시 `process.exit(1)` — 잘못된 설정 상태로 앱이 기동되는 것을 방지한다.

### ConfigService 사용

```typescript
// infrastructure 레이어 등에서 ConfigService 주입
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class SomeInfraService {
  constructor(private readonly configService: ConfigService) {}

  getDbHost(): string {
    return this.configService.get<string>('database.host')!
  }
}
```

- `ConfigService`는 `isGlobal: true`로 등록했으므로 별도 모듈 import 없이 주입 가능하다.
- 설정 값 접근 시 닷 노테이션(`'database.host'`)으로 네스팅된 값에 접근한다.
