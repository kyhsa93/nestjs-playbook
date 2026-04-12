# 공유 모듈 구조

도메인에 속하지 않는 공유 코드는 아래 경로에 배치한다:

```
src/
  common/                          # 프로젝트 공통 유틸
    generate-error-response.ts
    generate-id.ts
    http-exception.filter.ts
    logging.interceptor.ts
  database/                        # 데이터베이스 모듈 (@Global)
    database-module.ts
    base.entity.ts
    data-source.ts
    transaction-manager.ts
  outbox/                          # Outbox 모듈 (@Global)
    outbox-module.ts
    outbox.entity.ts
    outbox-writer.ts
    outbox-relay.ts
    event-consumer.ts
    event-handler-registry.ts
  auth/                            # 인증 모듈 (공유)
    auth-module.ts
    auth-service.ts                # 토큰 발급/검증 (JWT)
    auth.guard.ts                  # Bearer 토큰 추출 Guard
    auth-error-message.ts
    interface/
      auth-controller.ts           # POST /auth/sign-in 등
      dto/
  <domain>/                        # 도메인 모듈
    ...
```

- `src/common/` — 에러 처리, 필터, 인터셉터 등 프레임워크 공통 코드
- `src/database/` — DatabaseModule: TypeORM DataSource, TransactionManager (`@Global`)
- `src/outbox/` — OutboxModule: OutboxWriter, OutboxRelay, EventConsumer, EventHandlerRegistry (`@Global`)
- `src/auth/` — 인증/인가 공유 모듈
