# NestJS 개발 가이드

DDD 기반 NestJS TypeScript 서버 프로젝트의 설계/구현 가이드이다.
`src/<domain>/{domain,application,interface,infrastructure}/` 4레이어 구조를 따른다.

## 작업 시 참조할 문서

아래 문서는 작업 단계에 맞춰 Read 도구로 읽고 규칙을 따른다.

| 작업 | 읽을 문서 |
|------|----------|
| 설계 (요구사항 분석~전술 설계) | `docs/development-process.md` |
| 프로젝트 구조 확인 | `docs/architecture/directory-structure.md` |
| 레이어 역할 확인 | `docs/architecture/layer-architecture.md` |
| Repository 구현 | `docs/architecture/repository-pattern.md` |
| 모듈 구성 | `docs/architecture/module-pattern.md` |
| 에러 처리 | `docs/architecture/error-handling.md` |
| 도메인 이벤트 | `docs/architecture/domain-events.md` |
| DB 쿼리 | `docs/architecture/database-queries.md` |
| 인증 | `docs/architecture/authentication.md` |
| Domain Service | `docs/architecture/domain-service.md` |
| 크로스 도메인 호출 | `docs/architecture/cross-domain.md` |
| Aggregate ID | `docs/architecture/aggregate-id.md` |
| @nestjs/cqrs | `docs/architecture/cqrs-pattern.md` |
| 환경 설정 | `docs/architecture/config.md` |
| Secret 관리 | `docs/architecture/secret-manager.md` |
| 앱 부트스트랩 | `docs/architecture/bootstrap.md` |
| Graceful Shutdown | `docs/architecture/graceful-shutdown.md` |
| 로컬 개발 환경 | `docs/architecture/local-dev.md` |
| Dockerfile | `docs/architecture/dockerfile.md` |
| Presigned URL 파일 업로드 | `docs/architecture/module-pattern.md` (파일 업로드/다운로드 섹션) |
| 공유 모듈 구조 | `docs/architecture/shared-modules.md` |
| 레거시 기능 수정 (Vertical Slice 리팩토링) | `docs/development-process.md` (레거시 기능 수정 섹션) |
| Logging / Observability | `docs/architecture/logging.md` |
| Testing 아키텍처 | `docs/architecture/testing.md` |
| Pagination / 공통 응답 패턴 | `docs/architecture/pagination.md` |
| API Versioning | `docs/architecture/api-versioning.md` |
| Rate Limiting | `docs/architecture/rate-limiting.md` |
| Middleware / Guard / Interceptor / Pipe | `docs/architecture/middleware-interceptor.md` |
| Scheduling / Batch | `docs/architecture/scheduling.md` |
| 설계 원칙 | `docs/architecture/design-principles.md` |
| 코딩 컨벤션 | `docs/conventions.md` |
| 새 도메인 추가 | `docs/reference.md` |
| 작업 완료 후 자기 검토 | `docs/checklist.md` |
