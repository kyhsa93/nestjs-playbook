# 로컬 개발 환경

로컬 개발 시 외부 인프라(DB, S3 등)를 **Docker Compose**로 실행하고, AWS 서비스는 **LocalStack**으로 대체한다.

### 디렉토리 구조

```
project-root/
  docker-compose.yml                 ← 로컬 인프라 정의
  localstack/
    init-aws.sh                      ← LocalStack 초기화 스크립트 (S3 버킷 생성 등)
  .env.development                   ← 로컬 개발용 환경 변수
```

### docker-compose.yml

```yaml
services:
  database:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dev -d app']
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  localstack:
    image: localstack/localstack
    ports:
      - '4566:4566'
    environment:
      SERVICES: s3,sqs,secretsmanager
      DEFAULT_REGION: ap-northeast-2
    volumes:
      - ./localstack:/etc/localstack/init/ready.d
    healthcheck:
      test: ['CMD-SHELL', 'awslocal s3 ls']
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    build: .
    ports:
      - '3000:3000'
    env_file:
      - .env.development
    depends_on:
      database:
        condition: service_healthy
      redis:
        condition: service_healthy
      localstack:
        condition: service_healthy
    profiles:
      - app

volumes:
  db-data:
```

### 서비스 구성

| 서비스 | 이미지 | 용도 | 포트 |
|--------|--------|------|------|
| `database` | `postgres:16-alpine` | PostgreSQL DB | 5432 |
| `redis` | `redis:7-alpine` | 캐시, 세션, 큐 (필요 시) | 6379 |
| `localstack` | `localstack/localstack` | AWS 서비스 대체 (S3, SQS 등) | 4566 |
| `app` | 프로젝트 빌드 | NestJS 앱 (선택적) | 3000 |

### Health Check

모든 인프라 서비스에 `healthcheck`를 설정한다. `app` 서비스는 `depends_on`에서 `condition: service_healthy`를 사용하여 인프라가 준비된 후에 기동한다.

### profiles — 앱 서비스 선택적 실행

`app` 서비스에 `profiles: [app]`을 설정하여 **기본 실행 시 인프라만 기동**하고, 앱은 로컬에서 `npm run start:dev`로 실행한다. 앱도 컨테이너로 실행하려면 `--profile app`을 사용한다.

```bash
# 인프라만 기동 (기본 — 개발 시)
docker compose up -d

# 인프라 + 앱 함께 기동
docker compose --profile app up -d
```

### LocalStack 초기화 스크립트

```bash
#!/bin/bash
# localstack/init-aws.sh
awslocal s3 mb s3://app-files
awslocal sqs create-queue --queue-name app-events
```

- `localstack/init-aws.sh`에 S3 버킷, SQS 큐 등 필요한 리소스를 생성한다.
- `init/ready.d/`에 배치하면 LocalStack 기동 시 자동 실행된다.
- 실행 권한 필요: `chmod +x localstack/init-aws.sh`

### .env.development

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=dev
DATABASE_PASSWORD=dev
DATABASE_NAME=app

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS (LocalStack)
AWS_ENDPOINT=http://localhost:4566
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET=app-files

# JWT
JWT_SECRET=local-dev-secret
JWT_EXPIRES_IN=1h

# App
PORT=3000
NODE_ENV=development
```

### 앱이 컨테이너로 실행될 때의 환경 변수

앱이 Docker Compose 내에서 실행되면 `localhost` 대신 **서비스명**으로 연결해야 한다.

```env
# .env.docker — 앱 컨테이너용 (docker compose --profile app 시 사용)
DATABASE_HOST=database
REDIS_HOST=redis
AWS_ENDPOINT=http://localstack:4566
```

Docker Compose 네트워크 내에서는 서비스명이 호스트명으로 해석된다 (`database` → database 컨테이너 IP).

### AWS SDK에서 LocalStack 연동

`AWS_ENDPOINT` 환경 변수가 설정되면 해당 엔드포인트로 연결한다. 운영 환경에서는 이 변수를 설정하지 않으면 기본 AWS 엔드포인트를 사용한다.

```typescript
// S3Client 예시 — StorageService 구현체에 이미 적용됨
private readonly s3 = new S3Client({
  ...(process.env.AWS_ENDPOINT ? {
    endpoint: process.env.AWS_ENDPOINT,
    forcePathStyle: true          // LocalStack은 path-style 필수
  } : {})
})
```

### 실행 방법

```bash
# 1. 인프라 기동
docker compose up -d

# 2. 앱 실행 (로컬)
npm run start:dev

# --- 또는 ---

# 전체 컨테이너 기동 (앱 포함)
docker compose --profile app up -d

# 로그 확인
docker compose logs -f app

# 전체 종료
docker compose --profile app down

# 전체 종료 + 데이터 삭제
docker compose --profile app down -v
```

### 원칙

- **로컬 개발 시 외부 서비스에 직접 연결하지 않는다**: DB는 Docker Compose, AWS 서비스는 LocalStack을 사용한다.
- **healthcheck를 설정한다**: 인프라 서비스가 준비된 후에 앱이 기동되도록 한다.
- **profiles로 앱 서비스를 분리한다**: 기본 실행은 인프라만, `--profile app`으로 앱 포함.
- **환경 변수로 엔드포인트를 분기한다**: `AWS_ENDPOINT`가 있으면 LocalStack, 없으면 실제 AWS.
- **초기화 스크립트는 프로젝트에 포함한다**: `localstack/init-aws.sh`를 커밋하여 모든 개발자가 같은 환경을 재현할 수 있도록 한다.
- **docker-compose.yml은 개발 전용이다**: 운영 인프라는 별도로 관리한다.
