# 핵심 설계 원칙 요약

1. **도메인 우선 디렉토리 구조** — `src/<domain>/` 하위에 domain/application/interface/infrastructure 4개 레이어 배치
2. **Domain 레이어는 프레임워크 무의존** — 순수 TypeScript. NestJS 데코레이터(@Injectable 등) 사용 금지
3. **비즈니스 규칙은 Aggregate Root에 캡슐화** — Application Service는 조율만 담당
4. **Aggregate Root 단위 Repository** — domain 레이어에 abstract class, infrastructure 레이어에 구현체
5. **NestJS DI로 Repository 주입** — `{ provide: AbstractClass, useClass: ImplClass }` 패턴
6. **Repository 조회는 `find<Noun>s` 하나만** — 단건 시 `take: 1` + `.then(r => r.<noun>s.pop())`
7. **Repository에 수정(update) 메서드 금지** — Aggregate 도메인 메서드로 수정 후 `save<Noun>`
8. **Mapping Table은 양쪽 도메인 모두에서 접근** — 도메인 간 작업 orchestration은 Service가 담당
9. **save/delete는 연결 엔티티 cascade 처리** — Service는 도메인 단위 메서드만 호출
10. **Interface DTO = Application 객체의 thin wrapper** — 로직 없이 extends만
11. **에러는 enum으로 타입화** — free-form 문자열 금지
12. **Controller에서 에러 타입 → HTTP 예외 변환** — `generateErrorResponse` 유틸 사용
13. **Domain/Service에서 HttpException throw 금지** — plain Error만 사용
