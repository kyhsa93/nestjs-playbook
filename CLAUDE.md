# NestJS 개발 가이드

DDD 기반 NestJS TypeScript 서버 프로젝트의 설계/구현 가이드이다.
`src/<domain>/{domain,application,interface,infrastructure}/` 4레이어 구조를 따른다.

## 작업 시 참조할 문서

아래 문서는 작업 단계에 맞춰 Read 도구로 읽고 규칙을 따른다.

| 작업 단계 | 읽을 문서 |
|----------|----------|
| 설계 (요구사항 분석~전술 설계) | `docs/01-development-process.md` |
| 구현 시작 전 | `docs/02-architecture.md`, `docs/03-conventions.md` |
| 새 도메인 추가 | `docs/04-reference.md` (전체 구현 템플릿) |
| 작업 완료 후 자기 검토 | `docs/05-checklist.md` (STEP 1~14 순서대로 점검) |
