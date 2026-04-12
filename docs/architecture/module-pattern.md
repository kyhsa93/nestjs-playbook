# NestJS 모듈 패턴

### 도메인 기준 모듈 구성 원칙

NestJS 모듈은 **Bounded Context(도메인)** 단위로 구성한다. 기술 레이어(controller, service, repository)가 아닌 비즈니스 도메인이 모듈 분리의 기준이다.

```
src/
  order/                 ← OrderModule — 주문 도메인의 모든 레이어를 포함
    domain/
    application/
    interface/
    infrastructure/
    order-module.ts
  user/                  ← UserModule — 사용자 도메인의 모든 레이어를 포함
    domain/
    application/
    interface/
    infrastructure/
    user-module.ts
  payment/               ← PaymentModule — 결제 도메인
    ...
    payment-module.ts
  common/                ← 공유 유틸 (모듈 아님)
  database/              ← DatabaseModule — TypeORM DataSource, TransactionManager (@Global)
  outbox/                ← OutboxModule — OutboxWriter, OutboxRelay, EventConsumer, EventHandlerRegistry (@Global)
  auth/                  ← AuthModule — 인증 공유 모듈
  app-module.ts          ← 루트 모듈: 도메인 모듈 조합
```

**원칙:**
- **1 Bounded Context = 1 NestJS Module**: 주문, 사용자, 결제 등 도메인 단위로 모듈을 나눈다.
- **모듈 내에 4개 레이어(domain/application/interface/infrastructure)를 포함**한다. 레이어별로 모듈을 나누지 않는다.
- **모듈 간 직접 의존을 최소화**한다. 다른 도메인의 데이터가 필요하면 해당 모듈을 `imports`하고 `exports`된 서비스를 사용한다.
- **공유 인프라**(TypeORM DataSource, AuthGuard 등)는 별도 모듈로 분리하여 필요한 도메인 모듈에서 주입받는다.

### 루트 모듈 — 도메인 모듈 조합

```typescript
// app-module.ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AuthModule } from '@/auth/auth-module'
import { validateConfig } from '@/config/config-validator'
import { databaseConfig } from '@/config/database.config'
import { jwtConfig } from '@/config/jwt.config'
import { s3Config } from '@/config/s3.config'
import { OrderModule } from '@/order/order-module'
import { PaymentModule } from '@/payment/payment-module'
import { UserModule } from '@/user/user-module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, s3Config],
      validate: validateConfig,
    }),
    AuthModule,
    OrderModule,
    UserModule,
    PaymentModule,
    ...(process.env.NODE_ENV === 'prd' ? [] : [DevToolModule])
  ]
})
export class AppModule {}
```

### 모듈 간 의존 — Adapter를 통한 외부 도메인 호출

다른 도메인의 기능이 필요할 때, **해당 도메인의 Service나 Repository를 직접 주입하지 않는다.** 대신 Application 레이어에 Adapter 인터페이스(abstract class)를 정의하고, Infrastructure 레이어에서 실제 외부 도메인 모듈을 호출하는 구현체를 작성한다.

**이유:**
- Application 레이어가 외부 도메인의 구체적인 Service/Repository 타입에 의존하지 않는다.
- 외부 도메인의 내부 구조가 변경되어도 Adapter 구현체만 수정하면 된다.
- 테스트 시 Adapter를 mock하여 외부 도메인 의존 없이 단위 테스트할 수 있다.

```
[Order 도메인]                                [User 도메인]
  application/                                  application/
    adapter/                                      user-service.ts
      user-adapter.ts (abstract class)
    order-service.ts (UserAdapter 주입)
  infrastructure/
    user-adapter-impl.ts (UserService 호출)  ←imports→  UserModule
```

**Step 1 — Application 레이어에 Adapter 인터페이스 정의**

```typescript
// order/application/adapter/user-adapter.ts — abstract class
export abstract class UserAdapter {
  abstract findUsers(query: {
    readonly take: number
    readonly page: number
    readonly userId?: string
  }): Promise<{ users: { userId: string; name: string }[]; count: number }>
}
```

- Adapter 인터페이스는 **호출하는 쪽(Order 도메인)이 필요로 하는 형태**로 정의한다.
- 외부 도메인의 전체 API를 노출하지 않고, 필요한 메서드만 정의한다.
- 조회 메서드 네이밍은 Repository와 동일하게 `find<Noun>s` 패턴을 따른다. 단건 조회 시 `take: 1` + `.then(r => r.<noun>s.pop())` 패턴을 사용한다.

**Step 2 — Infrastructure 레이어에 Adapter 구현체 작성**

```typescript
// order/infrastructure/user-adapter-impl.ts
import { Injectable } from '@nestjs/common'

import { UserAdapter } from '@/order/application/adapter/user-adapter'
import { UserService } from '@/user/application/user-service'

@Injectable()
export class UserAdapterImpl extends UserAdapter {
  constructor(private readonly userService: UserService) {}

  public async findUsers(query: {
    readonly take: number
    readonly page: number
    readonly userId?: string
  }): Promise<{ users: { userId: string; name: string }[]; count: number }> {
    return this.userService.getUsers(query)
  }
}
```

- 구현체에서 외부 도메인의 `exports`된 Service를 주입받아 호출한다.
- 외부 도메인의 응답을 Adapter 인터페이스가 정의한 형태로 변환한다.

**Step 3 — Application Service에서 Adapter 사용**

```typescript
// order/application/order-service.ts
@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly userAdapter: UserAdapter
  ) {}

  public async getOrderWithUser(param: { orderId: string }): Promise<GetOrderWithUserResult> {
    const order = await this.orderRepository
      .findOrders({ orderId: param.orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(ErrorMessage['주문을 찾을 수 없습니다.'])

    const user = await this.userAdapter
      .findUsers({ userId: order.userId, take: 1, page: 0 })
      .then((r) => r.users.pop())

    return { orderId: order.orderId, status: order.status, userName: user?.name ?? null }
  }
}
```

**Step 4 — Module 등록**

```typescript
// user/user-module.ts — UserService를 exports
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [UserController],
  providers: [
    UserService,
    { provide: UserRepository, useClass: UserRepositoryImpl }
  ],
  exports: [UserService]
})
export class UserModule {}

// order/order-module.ts — UserModule imports + Adapter DI 연결
@Module({
  imports: [UserModule, TypeOrmModule.forFeature([OrderEntity, OrderItemEntity])],
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    { provide: UserAdapter, useClass: UserAdapterImpl }
  ]
})
export class OrderModule {}
```

> **주의**: 모듈 간 순환 의존(A → B → A)이 발생하면 설계를 재검토한다. 순환 의존은 Bounded Context 경계가 잘못 설정되었다는 신호일 수 있다. `forwardRef()`로 우회하기보다 도메인 경계를 재조정하거나, 이벤트 기반 통신으로 전환한다.

### 기술 인프라 Service — 암복호화·외부 API 클라이언트 등의 인터페이스 분리

암복호화, 파일 스토리지, 외부 API 클라이언트 등 **기술적 구현이 핵심인 기능**은 Application 레이어에 Service 인터페이스(abstract class)를 정의하고, Infrastructure 레이어에서 구현체를 제공한다.

**이유:**
- Application Service가 특정 라이브러리·SDK에 직접 의존하지 않는다.
- 구현 기술이 바뀌어도(예: AES → AWS KMS) Service 구현체만 교체하면 된다.
- 테스트 시 Service를 mock하여 외부 의존 없이 단위 테스트할 수 있다.

**Adapter와의 차이:**
- **Adapter**: 다른 도메인의 Service를 호출하기 위한 인터페이스 (도메인 간 통신)
- **기술 인프라 Service**: 기술 인프라 구현을 추상화하기 위한 인터페이스 (기술 관심사 분리)

```
[Order 도메인]
  application/
    service/
      crypto-service.ts (abstract class)     ← 인터페이스 정의
    order-service.ts (CryptoService 주입)
  infrastructure/
    crypto-service-impl.ts (AES 구현)        ← 실제 구현체
```

**Step 1 — Application 레이어에 Service 인터페이스 정의**

```typescript
// order/application/service/crypto-service.ts — abstract class
export abstract class CryptoService {
  abstract encrypt(plainText: string): Promise<string>
  abstract decrypt(cipherText: string): Promise<string>
}
```

- Service 인터페이스는 **사용하는 쪽(Application Service)이 필요로 하는 형태**로 정의한다.
- 구현 기술의 세부사항(알고리즘, 키 관리 등)은 인터페이스에 노출하지 않는다.

**Step 2 — Infrastructure 레이어에 Service 구현체 작성**

```typescript
// order/infrastructure/crypto-service-impl.ts
import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

import { CryptoService } from '@/order/application/service/crypto-service'

@Injectable()
export class CryptoServiceImpl extends CryptoService {
  private readonly algorithm = 'aes-256-gcm'
  private readonly key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')

  public async encrypt(plainText: string): Promise<string> {
    const iv = randomBytes(16)
    const cipher = createCipheriv(this.algorithm, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, encrypted]).toString('base64')
  }

  public async decrypt(cipherText: string): Promise<string> {
    const buf = Buffer.from(cipherText, 'base64')
    const iv = buf.subarray(0, 16)
    const tag = buf.subarray(16, 32)
    const encrypted = buf.subarray(32)
    const decipher = createDecipheriv(this.algorithm, this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }
}
```

**Step 3 — Application Service에서 기술 인프라 Service 사용**

```typescript
// order/application/order-service.ts
@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly cryptoService: CryptoService
  ) {}

  public async createOrder(command: CreateOrderCommand): Promise<void> {
    const encryptedAddress = await this.cryptoService.encrypt(command.address)
    // ...
  }
}
```

**Step 4 — Module 등록**

```typescript
// order/order-module.ts
@Module({
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    { provide: CryptoService, useClass: CryptoServiceImpl }
  ]
})
export class OrderModule {}
```

> **적용 기준**: 단순 유틸 함수(날짜 포맷, 문자열 변환 등)는 기술 인프라 Service로 분리하지 않는다. 외부 시스템 연동이 있거나, 구현 기술이 교체될 가능성이 있는 기술적 관심사에 적용한다.
> 예: 암복호화, 파일 스토리지(S3/GCS), 메시지 큐(SQS/RabbitMQ), 외부 API 클라이언트, SMS/이메일 발송 등.

### 파일 업로드/다운로드 — Presigned URL 패턴

파일을 서버에서 직접 업로드/다운로드하지 않는다. **Presigned URL을 발급하여 클라이언트가 스토리지(S3 등)와 직접 통신**하도록 한다.

**이유:**
- 서버의 네트워크/메모리 부하를 방지한다 (대용량 파일이 서버를 경유하지 않음).
- 서버는 URL 발급과 메타데이터 관리만 담당한다.

#### 흐름

```
[업로드]
1. 클라이언트 → 서버: POST /orders/:orderId/attachments (파일명, 확장자 전달)
2. 서버: 파일 키 생성 → Presigned Upload URL 발급 → DB에 메타데이터 저장
3. 서버 → 클라이언트: { fileKey, extension, uploadUrl }
4. 클라이언트 → 스토리지: PUT uploadUrl (파일 바이너리 직접 업로드)

[다운로드]
1. 클라이언트 → 서버: GET /orders/:orderId/attachments/:fileKey
2. 서버: DB에서 파일 메타데이터 조회 → Presigned Download URL 발급
3. 서버 → 클라이언트: { downloadUrl }
4. 클라이언트 → 스토리지: GET downloadUrl (파일 직접 다운로드)
```

#### StorageService 인터페이스 (application/service/)

```typescript
// application/service/storage-service.ts — abstract class
export abstract class StorageService {
  abstract generateUploadUrl(key: string): Promise<string>
  abstract generateDownloadUrl(key: string): Promise<string>
}
```

#### StorageService 구현체 (infrastructure/)

```typescript
// infrastructure/storage-service-impl.ts — S3 구현 예시
import { Injectable } from '@nestjs/common'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { StorageService } from '@/order/application/service/storage-service'

@Injectable()
export class StorageServiceImpl extends StorageService {
  private readonly s3 = new S3Client({
    ...(process.env.AWS_ENDPOINT ? {
      endpoint: process.env.AWS_ENDPOINT,
      forcePathStyle: true
    } : {})
  })
  private readonly bucket = process.env.S3_BUCKET!

  public async generateUploadUrl(key: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.s3, command, { expiresIn: 3600 })
  }

  public async generateDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.s3, command, { expiresIn: 3600 })
  }
}
```

#### Entity에 파일 메타데이터 저장

파일을 소유하는 Entity는 **파일 키(fileKey)와 확장자(extension)** 를 컬럼으로 가진다. 파일 자체는 스토리지에 저장하고, DB에는 메타데이터만 기록한다.

```typescript
// infrastructure/entity/order-attachment.entity.ts
import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm'

import { BaseEntity } from '@/database/base.entity'
import { OrderEntity } from '@/order/infrastructure/entity/order.entity'

@Entity('order_attachment')
export class OrderAttachmentEntity extends BaseEntity {
  @PrimaryColumn({ type: 'char', length: 32 })
  fileKey: string

  @Column({ type: 'char', length: 32 })
  orderId: string

  @Column({ type: 'varchar', length: 10 })
  extension: string

  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'orderId' })
  order: OrderEntity
}
```

- **fileKey**: 스토리지 내의 파일 식별자 (UUID v4 하이픈 제거). Presigned URL 발급 시 이 키를 사용한다.
- **extension**: 파일 확장자 (`pdf`, `png`, `xlsx` 등). 다운로드 시 원본 파일명 복원에 사용한다.
- 파일명, 크기 등 추가 메타데이터가 필요하면 컬럼을 추가한다.

#### Application Service에서 사용

```typescript
public async createAttachment(command: CreateAttachmentCommand): Promise<CreateAttachmentResult> {
  const fileKey = generateId()
  const uploadUrl = await this.storageService.generateUploadUrl(
    `${command.orderId}/${fileKey}.${command.extension}`
  )
  await this.attachmentRepository.saveAttachment({
    fileKey,
    orderId: command.orderId,
    extension: command.extension
  })
  return { fileKey, extension: command.extension, uploadUrl }
}

public async getAttachmentUrl(param: { fileKey: string }): Promise<{ downloadUrl: string }> {
  const attachment = await this.attachmentRepository
    .findAttachments({ fileKey: param.fileKey, take: 1, page: 0 })
    .then((r) => r.attachments.pop())
  if (!attachment) throw new Error(ErrorMessage['파일을 찾을 수 없습니다.'])
  const downloadUrl = await this.storageService.generateDownloadUrl(
    `${attachment.orderId}/${attachment.fileKey}.${attachment.extension}`
  )
  return { downloadUrl }
}
```

#### 원칙

- **서버는 파일 바이너리를 처리하지 않는다**: 업로드/다운로드 모두 Presigned URL을 통해 클라이언트↔스토리지 직접 통신.
- **DB에는 메타데이터만 저장한다**: fileKey, extension, 소유 Entity의 ID.
- **StorageService 인터페이스를 통해 스토리지 구현을 추상화한다**: S3, GCS, MinIO 등 구현체만 교체.

### 모듈 선언 — 최소화, 명시적

```typescript
@Module({
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: OrderRepository, useClass: OrderRepositoryImpl },
    AuthService
  ]
})
export class OrderModule {}
```

### 환경 기반 조건부 모듈 로딩

```typescript
// app.module.ts
...(process.env.NODE_ENV === 'prd' ? [] : [DevToolModule])
```

### Controller 데코레이터 패턴 (필수 항목들)

```typescript
@Controller('route-prefix')
@ApiTags('TagName')
@ApiBearerAuth('token')
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
export class OrderController {
  private readonly logger = new Logger(OrderController.name)
  constructor(private readonly orderService: OrderService) {}
}
```

- `@ApiTags()`: Swagger 그룹핑을 위해 항상 사용
- `@ApiBearerAuth('token')`: 인증 필요 컨트롤러에 항상 사용
- `@ApiOperation({ operationId: 'methodName' })`: 코드 제너레이션 지원
- `@ApiOperation({ deprecated: true })`: 구버전 엔드포인트 표시 (삭제 X)
- 가드/인터셉터: 메서드 레벨이 아닌 클래스 레벨에 적용

### @Controller 라우트 접두사 — 예외 케이스

```typescript
// 접두사를 컨트롤러에 일괄 적용하는 경우
@Controller('orders')
export class OrderController {
  @Get()           // → GET /orders
  @Get(':id')      // → GET /orders/:id
}

// 예외 케이스 — 메서드별로 전체 경로를 명시
@Controller()
export class OrderController {
  @Get('/orders')          // → GET /orders
  @Get('/orders/:id')      // → GET /orders/:id
}
```
