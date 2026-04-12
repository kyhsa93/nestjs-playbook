# Dockerfile

### Dockerfile

```dockerfile
# ---- Stage 1: Build ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### .dockerignore

```
node_modules
dist
.git
.env*
docker-compose.yml
localstack
```

### 설계 원칙

**멀티스테이지 빌드**: Build 스테이지에서 TypeScript를 컴파일하고, Production 스테이지에는 컴파일된 JS와 프로덕션 의존성만 포함한다. 이미지 크기를 최소화한다.

| 항목 | 설명 |
|------|------|
| Base 이미지 | `node:20-alpine` — 경량 이미지 |
| Build 스테이지 | 전체 의존성 설치 + TypeScript 빌드 |
| Production 스테이지 | `--omit=dev`로 프로덕션 의존성만 설치, `dist/` 복사 |
| EXPOSE | 3000 (환경 변수 `PORT`로 변경 가능) |
| CMD | `node dist/main.js` — `npm run start:prod`보다 프로세스 시그널 처리에 유리 |

### 원칙

- **멀티스테이지 빌드 필수**: devDependencies와 소스 코드가 프로덕션 이미지에 포함되지 않도록 한다.
- **.dockerignore 유지**: `node_modules`, `dist`, `.env*`, `.git` 등을 빌드 컨텍스트에서 제외한다.
- **CMD에 `node`를 직접 사용**: `npm run`은 중간에 npm 프로세스가 끼어 SIGTERM 전달이 지연될 수 있다.
- **환경 변수는 이미지에 포함하지 않는다**: `.env` 파일은 `.dockerignore`로 제외하고, 실행 시 `--env-file` 또는 오케스트레이션 도구에서 주입한다.
