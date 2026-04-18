# Baseline

하네스 과제의 출발점이 되는 **최소 NestJS 프로젝트**다. 에이전트는 이 skeleton 위에 도메인 모듈을 추가/수정하여 과제를 완성한다.

## 포함된 것

- NestJS 부트스트랩 (`src/main.ts`, `AppModule`)
- `ConfigModule.forRoot({ isGlobal: true })`
- `ScheduleModule.forRoot()` — `@Cron` 활성화
- `DatabaseModule` + TypeORM 설정
- `TransactionManager` (AsyncLocalStorage 기반)
- `BaseEntity` (createdAt/updatedAt/deletedAt)
- `src/common/is-unique-violation.ts` 헬퍼
- `src/config/config-validator.ts` 환경 변수 검증
- Swagger 설정, Jest 설정, TypeScript strict 모드

## 포함되지 않은 것 (과제 단위로 추가)

- `src/<domain>/` 모듈 — 과제에 맞게 추가
- `src/outbox/` — Domain Events를 사용하는 과제에서 추가
- `src/task-queue/` — Task Queue를 사용하는 과제에서 추가

상세 구조는 [`docs/architecture/directory-structure.md`](../../docs/architecture/directory-structure.md)를 참고한다.

## 실행

```bash
npm install
cp .env.example .env
npm run start:dev
```

## 빌드 / 테스트

```bash
npm run typecheck
npm run build
npm test
```
