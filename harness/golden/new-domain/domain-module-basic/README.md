# Golden — new-domain/domain-module-basic

Order 도메인을 예시로 쓰는 최소 솔루션. 아래 패턴을 담는다:

- 4레이어 (domain / application / interface / infrastructure)
- Aggregate Root `Order`
- Repository 인터페이스 (`OrderRepository`, abstract class) + 구현체
- Command: `createOrder`, `cancelOrder`
- Query Service + Query 인터페이스
- REST Controller
- Module DI 바인딩
- `@ApiProperty` / `class-validator` 데코레이터

`src/` 트리를 baseline의 `src/` 위에 그대로 overlay하면 완전한 submission이 된다. `scripts/verify-golden.sh`가 이 overlay를 수행하고 harness로 점수를 측정한다.
