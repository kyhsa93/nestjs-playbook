# Secret 관리

DB 비밀번호, JWT 시크릿, API 키 등 민감한 값은 환경 변수나 코드에 직접 넣지 않고 **AWS Secrets Manager**에 저장하여 런타임에 조회한다.

### 흐름

```
[앱 기동 시]
1. SecretService: Secrets Manager에서 시크릿 조회
2. SecretService: 메모리에 캐시 (TTL 기반)
3. 이후 동일 키 요청 시 캐시에서 반환

[캐시 만료 시]
4. SecretService: Secrets Manager에 다시 조회 → 캐시 갱신
```

### SecretService 인터페이스 (application/service/)

```typescript
// application/service/secret-service.ts — abstract class
export abstract class SecretService {
  abstract getSecret(secretId: string): Promise<string>
}
```

### SecretService 구현체 (infrastructure/)

Secrets Manager에서 값을 조회하고, TTL 기반 메모리 캐시를 적용한다.

```typescript
// infrastructure/secret-service-impl.ts
import { Injectable } from '@nestjs/common'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

import { SecretService } from '@/common/application/service/secret-service'

@Injectable()
export class SecretServiceImpl extends SecretService {
  private readonly client = new SecretsManagerClient({
    ...(process.env.AWS_ENDPOINT ? {
      endpoint: process.env.AWS_ENDPOINT
    } : {})
  })
  private readonly cache = new Map<string, { value: string; expiresAt: number }>()
  private readonly ttl = 5 * 60 * 1000  // 5분

  public async getSecret(secretId: string): Promise<string> {
    const cached = this.cache.get(secretId)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const result = await this.client.send(
      new GetSecretValueCommand({ SecretId: secretId })
    )
    const value = result.SecretString ?? ''
    this.cache.set(secretId, { value, expiresAt: Date.now() + this.ttl })
    return value
  }
}
```

- **TTL 캐시**: 동일 키를 5분 내에 다시 요청하면 API 호출 없이 캐시에서 반환한다.
- **AWS_ENDPOINT 분기**: LocalStack 사용 시 자동으로 로컬 엔드포인트로 연결한다.

### JSON 형태의 시크릿 사용

여러 값을 하나의 시크릿에 JSON으로 저장하고, 키별로 접근한다.

```typescript
// Secrets Manager에 저장된 값 예시:
// SecretId: "app/database"
// SecretString: {"host":"db.example.com","port":"5432","username":"admin","password":"s3cret"}

// 사용 시
const dbSecret = JSON.parse(await this.secretService.getSecret('app/database'))
const host = dbSecret.host
const password = dbSecret.password
```

### 설정 팩토리에서 SecretService 사용

시크릿을 앱 기동 시 한 번 조회하여 ConfigModule에 주입하는 패턴:

```typescript
// config/database.config.ts
import { ConfigModule, ConfigService, registerAs } from '@nestjs/config'

export const databaseConfig = registerAs('database', async () => {
  // 로컬 환경에서는 환경 변수 사용, 운영 환경에서는 Secrets Manager 사용
  if (process.env.NODE_ENV === 'development') {
    return {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      name: process.env.DATABASE_NAME
    }
  }

  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager')
  const client = new SecretsManagerClient({})
  const result = await client.send(new GetSecretValueCommand({ SecretId: 'app/database' }))
  const secret = JSON.parse(result.SecretString ?? '{}')
  return {
    host: secret.host,
    port: parseInt(secret.port ?? '5432', 10),
    username: secret.username,
    password: secret.password,
    name: secret.name
  }
})
```

### Module 등록

```typescript
// app-module.ts
@Module({
  providers: [
    { provide: SecretService, useClass: SecretServiceImpl }
  ],
  exports: [SecretService]
})
```

또는 `@Global()` 모듈로 분리:

```typescript
// secret/secret-module.ts
@Global()
@Module({
  providers: [{ provide: SecretService, useClass: SecretServiceImpl }],
  exports: [SecretService]
})
export class SecretModule {}
```

### LocalStack에서 시크릿 생성

```bash
# localstack/init-aws.sh에 추가
awslocal secretsmanager create-secret \
  --name app/database \
  --secret-string '{"host":"localhost","port":"5432","username":"dev","password":"dev","name":"app"}'

awslocal secretsmanager create-secret \
  --name app/jwt \
  --secret-string '{"secret":"local-dev-secret"}'
```

### Docker Compose — LocalStack SERVICES에 secretsmanager 추가

```yaml
localstack:
  image: localstack/localstack
  environment:
    SERVICES: s3,sqs,secretsmanager    # secretsmanager 추가
```

### 원칙

- **민감한 값은 환경 변수에 직접 넣지 않는다**: 운영 환경에서는 Secrets Manager에서 조회한다.
- **로컬 개발 시에는 환경 변수 또는 LocalStack을 사용한다**: 실제 Secrets Manager에 접근하지 않는다.
- **TTL 캐시를 적용한다**: 동일 시크릿을 반복 조회하지 않도록 메모리 캐시를 사용한다.
- **SecretService 인터페이스로 추상화한다**: 기술 인프라 Service 패턴과 동일하게 application/service/에 abstract class, infrastructure/에 구현체.
