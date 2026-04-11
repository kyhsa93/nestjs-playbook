# AI Agent 자기 검토 체크리스트

작업 완료 후, 아래 체크리스트를 순서대로 검토한다.
각 항목을 점검하여 위반이 발견되면 즉시 수정한 뒤 다음 항목으로 넘어간다.

### 검증 수행 규칙

- 각 STEP을 검증할 때 반드시 해당 파일을 Read 도구로 읽고 실제 코드와 대조한다.
- 코드를 읽지 않고 통과 처리하는 것은 금지한다.
- 위반 발견 시 즉시 수정한 후 다음 STEP으로 넘어간다.

---

## STEP 1 — 파일 구조 및 네이밍

```
[ ] kebab-case가 아닌 파일명이 있는가?
    → 있다면 kebab-case로 변경
[ ] 서비스 파일이 .service.ts 형식으로 되어 있는가?
    → 있다면 <domain>-service.ts 형식으로 변경
[ ] 모듈 파일이 .module.ts 형식으로 되어 있는가?
    → 있다면 <domain>-module.ts 형식으로 변경
[ ] DTO 파일명이 동사 우선이 아닌가?
    → 올바른 예: get-order-request-param.ts, create-order-request-body.ts
[ ] enum이 다른 파일 내에 인라인으로 선언되어 있는가?
    → 있다면 <domain>-enum.ts 파일로 분리하여 모듈 루트에 위치
[ ] 상수(const)가 다른 파일 내에 인라인으로 선언되어 있는가?
    → 있다면 <domain>-constant.ts 파일로 분리하여 모듈 루트에 위치
[ ] enum / 상수 파일이 모듈 루트가 아닌 곳에 위치하는가?
    → 있다면 <domain>-module.ts와 같은 디렉토리로 이동
[ ] Param(읽기) 파일이 application/query/에 배치되어 있는가?
    → 읽기용 Param은 query/ 디렉토리에 위치
[ ] Param(쓰기, URL 파라미터만 받는 경우) 파일이 application/command/에 배치되어 있는가?
    → 쓰기용 Param은 command/에 <verb>-<noun>-command.ts로 정의
[ ] 컨트롤러 파일명이 <domain>-controller.ts 형식인가?
    → <domain>.controller.ts 또는 다른 형식은 변경
[ ] Domain 레이어 파일명이 규칙을 따르는가?
    → Aggregate Root: <aggregate-root>.ts, Entity: <entity>.ts, Value Object: <value-object>.ts, Domain Event: <domain-event>.ts
[ ] Repository 인터페이스 파일명이 <aggregate>-repository.ts 형식인가? (domain/ 레이어)
[ ] Query/Result 파일명이 <verb>-<noun>-query.ts / <verb>-<noun>-result.ts 형식인가?
    → 동사(get, find 등)는 Controller 메서드명과 일치
[ ] Adapter 파일명이 규칙을 따르는가?
    → 인터페이스: <external-domain>-adapter.ts (application/adapter/)
    → 구현체: <external-domain>-adapter-impl.ts (infrastructure/)
[ ] 기술 인프라 Service 파일명이 규칙을 따르는가?
    → 인터페이스: <concern>-service.ts (application/service/)
    → 구현체: <concern>-service-impl.ts (infrastructure/)
[ ] @nestjs/cqrs 사용 시: Handler 파일명이 규칙을 따르는가?
    → CommandHandler: <verb>-<noun>-command-handler.ts
    → QueryHandler: <verb>-<noun>-query-handler.ts
    → EventHandler: <domain-event>-handler.ts (application/event/)
[ ] 설정 파일명이 <concern>.config.ts 형식이고 config/ 디렉토리에 위치하는가?
[ ] 설정 검증 파일이 config-validator.ts 형식이고 config/ 디렉토리에 위치하는가?
[ ] 클래스명이 네이밍 규칙을 따르는가?
    → Aggregate Root: 도메인 명사 (Order, User)
    → Value Object: 도메인 개념 (Money, Address, OrderItem)
    → Domain Event: 과거형 (OrderPlaced, OrderCancelled)
    → Repository 인터페이스: <Aggregate>Repository / 구현체: <Aggregate>RepositoryImpl
    → Adapter 인터페이스: <ExternalDomain>Adapter / 구현체: <ExternalDomain>AdapterImpl
    → Command: <Verb><Noun>Command / Query: <Verb><Noun>Query / Result: <Verb><Noun>Result
    → DTO: <Verb><Noun>Request<Type> / <Verb><Noun>Response<Type>
    → ErrorMessage enum: <Domain>ErrorMessage
    → @nestjs/cqrs Handler: <Verb><Noun>CommandHandler / <Verb><Noun>QueryHandler / <DomainEvent>Handler
```

---

## STEP 2 — Domain 레이어

```
[ ] domain/ 디렉토리에 Aggregate Root, Entity, Value Object, Domain Event, Repository 인터페이스가 있는가?
[ ] Aggregate Root에 비즈니스 규칙과 불변식이 캡슐화되어 있는가?
    → Application Service에 비즈니스 로직이 있다면 Aggregate로 이동
[ ] Domain 레이어 파일에 NestJS 데코레이터(@Injectable, @Module 등)가 사용되었는가?
    → 있다면 제거. Domain 레이어는 프레임워크 무의존
[ ] Domain 레이어 파일에 ORM 관련 import가 있는가? (TypeORM 등)
    → 있다면 제거. Infrastructure 레이어에서만 사용
[ ] Repository 인터페이스가 abstract class로 정의되어 있는가?
[ ] Repository 인터페이스가 domain/ 레이어에 위치하는가?
[ ] Aggregate 간 직접 참조 없이 ID 참조만 사용하는가?
[ ] Aggregate 외부에서 내부 상태를 직접 변경하는 코드가 있는가?
    → 있다면 Aggregate Root의 메서드를 통해 변경하도록 수정
[ ] Domain Service가 있다면 domain/ 레이어에 위치하고 프레임워크 데코레이터 없이 작성되어 있는가?
[ ] Value Object에 equals() 메서드(속성 기반 동등성 비교)가 구현되어 있는가?
[ ] Aggregate 생성 시 ID가 UUID v4 (하이픈 제거, 32자리 hex 문자열)로 생성되는가?
    → generateId()를 사용하여 생성자에서 할당 (params.orderId ?? generateId())
```

---

## STEP 3 — 레이어 아키텍처

```
[ ] Controller가 Service 호출 + .catch() 에러 변환 외에 다른 로직을 수행하는가?
    → 있다면 Service로 이동
[ ] Application Service가 비즈니스 로직을 직접 수행하는가? (상태 변경 조건 검사, 계산 등)
    → 있다면 Aggregate의 도메인 메서드로 이동
[ ] Service가 HttpException / NotFoundException 등을 throw하는가?
    → 있다면 plain Error로 교체
[ ] Service가 ORM 클라이언트(TypeORM Repository 등)를 직접 사용하는가?
    → 있다면 Repository 구현체로 이동
[ ] Repository 구현체가 비즈니스 로직을 포함하는가?
    → 있다면 Aggregate 또는 Service로 이동
[ ] Service 클래스의 멤버 구성 순서가 (1) private readonly 필드 → (2) constructor → (3) public 메서드 → (4) private 메서드인가?
[ ] Application 레이어의 디렉토리 구조가 02-architecture.md와 일치하는가? (command/, query/ 등)
    → 쓰기 유스케이스가 있다면 command/ 디렉토리와 Command 객체가 존재해야 한다
    → 읽기 유스케이스가 있다면 query/ 디렉토리와 Query/Result 객체가 존재해야 한다
[ ] Application Service가 Command Service와 Query Service로 분리되어 있는가?
    → Command Service: Repository를 주입받아 쓰기 작업 수행
    → Query Service: Query 인터페이스(abstract class)를 주입받아 읽기 작업 수행
[ ] Query Service에서 Repository를 직접 사용하는가?
    → 있다면 Query 인터페이스로 교체 (application/query/에 abstract class, infrastructure/에 구현체)
[ ] Query 인터페이스가 application/query/에 abstract class로 정의되어 있는가?
[ ] Query 구현체가 infrastructure/에 위치하고 Module에 { provide: Query, useClass: QueryImpl }로 등록되어 있는가?
[ ] Interface DTO가 extends 외에 추가 로직이나 필드를 가지는가?
    → 있다면 Application Query/Result/Command로 이동
[ ] @nestjs/cqrs 사용 시: Controller가 Service 대신 CommandBus/QueryBus를 주입받고 있는가?
[ ] @nestjs/cqrs 사용 시: CommandHandler/QueryHandler가 비즈니스 로직을 직접 수행하는가?
    → 있다면 Aggregate의 도메인 메서드로 이동 (Handler도 조율자 역할만 수행)
[ ] @nestjs/cqrs 사용 시: Module에 CqrsModule이 imports에 포함되어 있는가?
[ ] @nestjs/cqrs 사용 시: 모든 CommandHandler/QueryHandler/EventHandler가 Module providers에 등록되어 있는가?
[ ] @nestjs/cqrs 사용 시: Domain Event가 EventBus를 통해 발행되고 EventHandler에서 수신하는가?
[ ] 레이어 의존 방향이 올바른가? (Interface → Application → Domain ← Infrastructure)
    → 하위 레이어가 상위 레이어를 import하는 코드가 있다면 수정
[ ] Controller 메서드가 모두 public async이며 반환 타입 Promise<ResponseType>이 명시되어 있는가?
[ ] Aggregate 내부의 하위 Entity를 Aggregate Root의 Repository를 통해 함께 저장/조회하는가?
    → 하위 Entity에 별도 Repository를 만들지 않는다
[ ] Application 레이어(Query/Result/Command)에 @ApiProperty, class-validator 등 데코레이터를 사용하고 있는가?
    → 허용됨. 단, Domain 레이어에서는 사용 금지
```

---

## STEP 4 — Repository 패턴

```
[ ] Repository가 Aggregate Root 단위로 정의되어 있는가? (Entity/테이블 단위 X)
[ ] Repository 인터페이스(abstract class)가 domain/ 레이어에 있는가?
[ ] Repository 구현체가 infrastructure/ 레이어에 있는가?
[ ] Repository 구현체 파일명이 <aggregate>-repository-impl.ts 인가?
[ ] Repository 메서드명이 find<Noun>s / save<Noun> / delete<Noun> 패턴을 따르는가?
[ ] Repository에 update<Noun> 메서드가 있는가?
    → 있다면 제거. 조회 후 Aggregate 도메인 메서드로 수정, save<Noun>으로 저장
[ ] 단건 조회를 위해 별도 findOne / findById 메서드를 만들었는가?
    → 있다면 제거. Service에서 take: 1 + .then(r => r.<noun>s.pop()) 패턴 사용
[ ] Service가 save/delete 내부 cascade 순서를 직접 관리하는가?
    → 있다면 해당 cascade 로직을 Repository 구현체 내부로 이동
[ ] Repository 구현체에 @InjectRepository로 TypeORM Repository가 주입되어 있는가?
[ ] Repository 구현체에서 DB 레코드를 도메인 Aggregate 객체로 변환하고 있는가?
    → DB row를 그대로 반환하지 않고 new Aggregate(row)로 변환
[ ] Repository find 메서드 반환 타입의 키 이름이 도메인 객체명 복수형인가?
    → 올바른 예: { orders: Order[]; count: number }
    → 잘못된 예: { items: Order[]; count: number }, { result: Order[] }
```

---

## STEP 5 — NestJS 모듈 및 DI 연결

```
[ ] 모듈이 도메인(Bounded Context) 단위로 구성되어 있는가?
    → 레이어 단위(controllers 모듈, services 모듈)로 나누지 않는다
[ ] 하나의 모듈 안에 domain/application/interface/infrastructure 4개 레이어가 포함되어 있는가?
[ ] 다른 도메인의 Service/Repository를 Application Service에서 직접 주입받고 있는가?
    → 있다면 Adapter 패턴으로 변경: application/adapter/에 인터페이스, infrastructure/에 구현체
[ ] Adapter 인터페이스가 application/adapter/에 abstract class로 정의되어 있는가?
[ ] Adapter 구현체가 infrastructure/에 위치하고, Module에 { provide: Adapter, useClass: AdapterImpl }로 등록되어 있는가?
[ ] 외부 도메인 모듈이 필요한 서비스를 exports하고, 사용하는 모듈에서 imports하고 있는가?
[ ] 모듈 간 순환 의존(A → B → A)이 존재하는가?
    → 있다면 Bounded Context 경계 재조정 또는 이벤트 기반 통신으로 전환
[ ] Module providers에 Repository가 { provide: AbstractClass, useClass: ImplClass } 형태로 등록되어 있는가?
[ ] Service constructor에서 abstract class 타입으로 Repository를 주입받고 있는가?
[ ] Module imports에 TypeOrmModule.forFeature([...entities])가 등록되어 있는가?
[ ] Module providers에 사용하는 모든 Service와 Repository가 등록되어 있는가?
[ ] 크로스 도메인 호출이 필요한 경우, Adapter를 통해 호출하고 있는가?
[ ] 암복호화·파일 스토리지·외부 API 클라이언트 등 기술 인프라를 Application Service에서 직접 구현하고 있는가?
    → 있다면 기술 인프라 Service 패턴으로 변경: application/service/에 인터페이스, infrastructure/에 구현체
[ ] 기술 인프라 Service 인터페이스가 application/service/에 abstract class로 정의되어 있는가?
[ ] 기술 인프라 Service 구현체가 infrastructure/에 위치하고, Module에 { provide: Service, useClass: ServiceImpl }로 등록되어 있는가?
[ ] 순환 의존 해결을 위해 forwardRef()를 사용하고 있는가?
    → 있다면 제거. Bounded Context 경계 재조정 또는 이벤트 기반 통신으로 전환
[ ] Adapter 인터페이스가 필요한 메서드만 정의하고, 외부 도메인의 전체 API를 노출하지 않는가?
[ ] Adapter 조회 메서드가 Repository와 동일한 find<Noun>s 패턴을 따르는가?
    → 단건 조회 시 take: 1 + .then(r => r.<noun>s.pop()) 패턴 사용
[ ] 단순 유틸 함수(날짜 포맷, 문자열 변환 등)를 기술 인프라 Service로 분리하고 있는가?
    → 있다면 일반 함수로 변경. 외부 시스템 연동·구현 기술 교체 가능성이 있는 기술 관심사에만 적용
[ ] ConfigModule.forRoot()이 AppModule에 isGlobal: true로 등록되어 있는가?
[ ] 환경 변수별 설정이 관심사별 파일(config/<concern>.config.ts)로 분리되어 있는가?
[ ] config-validator.ts에 class-validator로 필수 환경 변수 검증이 정의되어 있는가?
[ ] 검증 실패 시 process.exit(1)로 앱 기동을 중단하는가?
```

---

## STEP 6 — TypeScript 타이핑

```
[ ] DTO / Result / Query 클래스의 모든 필드가 public readonly인가?
[ ] Command 클래스에 Object.assign 생성자 패턴이 있는가?
[ ] any 타입을 사용한 곳이 있는가?
    → 있다면 구체적인 타입으로 교체
[ ] DB에서 오는 nullable 필드가 string | null 형태인가? (undefined 사용 금지)
[ ] 도메인 상태값(status 등)이 리터럴 유니온 타입으로 정의되어 있는가? (string 대신)
[ ] Service 메서드의 반환 타입이 명시되어 있는가?
[ ] Controller 메서드의 반환 타입이 명시되어 있는가?
[ ] DB 저장 시 시간 값을 UTC → KST(UTC+9)로 변환하여 저장하는가?
    → new Date()를 그대로 저장하면 UTC 기준으로 저장됨
[ ] DB에서 읽은 시간 값을 추가 변환 없이 그대로 응답하는가?
    → 이미 KST인 값을 다시 변환하면 이중 변환 오류 발생
[ ] optional 파라미터가 ? (T | undefined)로 선언되어 있는가?
    → DB nullable 필드는 T | null, optional 파라미터는 ?로 구분
[ ] 복잡한 타입에 type alias를 사용하고 있는가?
    → 올바른 예: type OrderWithItems = Order & { items: OrderItem[] }
```

---

## STEP 7 — 에러 처리

```
[ ] Controller의 .catch() 블록이 this.logger.error(error) + throw generateErrorResponse(...) 형태인가?
[ ] generateErrorResponse 두 번째 인자의 에러 메시지가 ErrorMessage enum 값을 참조하는가?
    (free-form 문자열 직접 사용 금지)
[ ] Service에서 throw하는 에러 메시지가 모두 <Domain>ErrorMessage enum에 정의되어 있는가?
    → 없다면 enum에 추가 후 참조
[ ] Aggregate에서 throw하는 에러 메시지도 <Domain>ErrorMessage enum에 정의되어 있는가?
[ ] 에러 메시지 enum 파일이 <domain>-error-message.ts 형식으로 존재하는가?
[ ] Domain/Service에서 throw new HttpException / NotFoundException 등을 사용하는가?
    → 있다면 throw new Error(ErrorMessage['...'])로 교체
```

---

## STEP 8 — REST API 엔드포인트

```
[ ] URL이 동사가 아닌 복수 명사 리소스로 구성되어 있는가?
    → 올바른 예: GET /orders, POST /orders
    → 잘못된 예: GET /getOrders, POST /createOrder
[ ] 리소스명이 복수형인가?
    → 올바른 예: /orders, /users
    → 잘못된 예: /order, /user
[ ] URL이 kebab-case 소문자만 사용하는가?
    → 올바른 예: /order-items, /payment-methods
    → 잘못된 예: /orderItems, /PaymentMethods
[ ] HTTP 메서드가 올바르게 사용되는가?
    → GET: 조회, POST: 생성, PUT: 전체 수정, PATCH: 부분 수정, DELETE: 삭제
[ ] 비 CRUD 행위가 하위 리소스 경로로 표현되는가?
    → 올바른 예: POST /orders/:orderId/cancel
    → 잘못된 예: POST /cancelOrder/:orderId
[ ] 중첩 리소스가 2단계 이내인가?
    → 3단계 이상이면 최상위 리소스로 분리
[ ] 응답 코드가 HTTP 메서드에 맞는가?
    → GET/PUT/PATCH: 200, POST: 201, DELETE: 204
[ ] URL에 후행 슬래시(/)나 파일 확장자(.json)가 없는가?
```

---

## STEP 9 — Swagger 문서화

```
[ ] 모든 Controller 메서드에 @ApiOperation({ operationId: '...' })가 있는가?
[ ] 모든 Controller 메서드에 @ApiOkResponse / @ApiCreatedResponse / @ApiNoContentResponse 중 하나가 있는가?
[ ] 응답 바디가 있는 GET 엔드포인트의 @ApiOkResponse에 { type: ResponseBodyClass }가 명시되어 있는가?
[ ] POST 엔드포인트에 @ApiCreatedResponse()가 있는가?
[ ] 응답 바디가 없는 DELETE 엔드포인트에 @HttpCode(204) + @ApiNoContentResponse()가 있는가?
[ ] RequestBody / Param / Querystring DTO 필드에 class-validator 데코레이터가 있는가?
[ ] Query/Result 클래스의 모든 public 필드에 @ApiProperty 또는 @ApiPropertyOptional이 있는가?
[ ] @ApiProperty에 nullable 필드는 { nullable: true, type: ... }가 명시되어 있는가?
[ ] @ApiProperty에 배열 타입은 { type: [ItemClass] }로 명시되어 있는가?
[ ] Interface DTO(Request/Response)가 아닌 Application Query/Result에 @ApiProperty가 작성되어 있는가?
[ ] Querystring의 optional 필드에 @ApiPropertyOptional() + @IsOptional()이 함께 적용되어 있는가?
[ ] @ApiProperty에 숫자 필드의 minimum/maximum/default가 명시되어 있는가?
[ ] 구버전 엔드포인트에 @ApiOperation({ deprecated: true })가 표시되어 있는가?
    → 구버전 엔드포인트는 삭제하지 않고 deprecated 표시
```

---

## STEP 10 — import 구성

```
[ ] 상대경로 import(../, ./)가 사용된 곳이 있는가?
    → 있다면 절대경로로 교체 (@/ alias 또는 src/ 기반 — 프로젝트 설정에 따라 선택)
[ ] import가 2그룹(외부 패키지 → 빈 줄 → 내부 절대경로)으로 구성되어 있는가?
[ ] 내부 절대경로 import가 경로 기준 알파벳 순으로 정렬되어 있는가?
[ ] default export를 사용한 파일이 있는가?
    → 있다면 named export로 변경
[ ] Application Service에서 <Domain>ErrorMessage를 import할 때 as ErrorMessage alias를 사용하는가?
    (Domain 레이어에서는 전체 이름으로 import해도 무방)
```

---

## STEP 11 — 모듈 데코레이터

```
[ ] Controller 클래스에 @ApiTags()가 있는가?
[ ] 인증이 필요한 Controller에 @ApiBearerAuth('token')이 있는가?
[ ] Guard/Interceptor가 메서드 레벨이 아닌 클래스 레벨에 적용되어 있는가?
[ ] Controller 클래스에 private readonly logger = new Logger(XxxController.name)가 있는가?
```

---

## STEP 12 — DB / 인프라 패턴

```
[ ] TypeORM Entity 프로퍼티명이 camelCase인가? (snake_case 컬럼은 @Column({ name: '...' })로 매핑)
[ ] 여러 Repository에 걸친 쓰기 작업이 TransactionManager.run()으로 묶여 있는가?
    → Command Service에서 2개 이상의 Repository를 호출하면 트랜잭션 필수
[ ] 단일 Repository만 호출하는 Command에 불필요한 TransactionManager.run()을 사용하지 않는가?
[ ] Repository 구현체가 쓰기 작업 시 transactionManager.getManager()를 사용하는가?
[ ] Repository 구현체 내부의 멀티스텝 쓰기에 transactionManager.getManager()를 사용하는가?
[ ] Module providers에 TransactionManager가 등록되어 있는가?
[ ] 동적 where 조건에 spread 패턴을 사용하는가?
[ ] Mapping table이 양쪽 도메인 Repository 구현체에서 접근 가능한가?
[ ] save/delete 시 하위 엔티티와 mapping table의 cascade가 Repository 구현체 내부에서 처리되는가?
    → Service가 cascade 순서를 직접 관리하지 않도록 한다
[ ] find + count (페이지네이션) 결과의 키 이름이 도메인 객체명 복수형인가?
    → 올바른 예: { orders: [...], count: 10 }
    → 잘못된 예: { result: [...], data: [...] }
[ ] 단건 조회 및 변환에 .then() 체이닝 패턴을 사용하는가?
    → 올바른 예: .findOrders({ orderId, take: 1, page: 0 }).then((r) => r.orders.pop())
[ ] 동적 where 조건에 QueryBuilder 조건부 체이닝 패턴을 사용하는가?
    → 올바른 예: if (query.status) qb.andWhere('order.status IN (:...status)', { status: query.status })
```

---

## STEP 13 — 테스트 패턴

```
[ ] Domain 레이어 단위 테스트가 프레임워크 없이 순수 TypeScript로 작성되어 있는가?
    → NestJS Test 모듈 없이 직접 new Aggregate()로 테스트
[ ] Application Service 테스트에서 Repository를 mock으로 대체하고 있는가?
    → jest.Mocked<AbstractClass> 패턴 사용
[ ] E2E 테스트에서 실제 HTTP 요청을 통해 유스케이스 흐름을 검증하는가?
[ ] Aggregate 불변식 위반 테스트가 작성되어 있는가? (잘못된 입력 → 예외 발생)
[ ] Domain Event 발행 여부를 검증하는 테스트가 있는가?
```

---

## STEP 14 — 전체 일관성 최종 확인

```
[ ] Controller의 .catch() 에서 발생할 수 있는 모든 에러가 generateErrorResponse 두 번째 인자에 매핑되어 있는가?
    → 누락된 에러가 있다면 [ErrorMessage['...'], ExceptionClass] 쌍 추가
[ ] 새로 추가한 파일이 Module의 providers / controllers에 등록되어 있는가?
[ ] Query / Command / Result 객체를 새로 만들었다면 Interface DTO가 extends로 감싸고 있는가?
[ ] 작업한 코드에서 TODO, console.log, 임시 주석이 남아있지 않은가?
[ ] 유비쿼터스 언어가 코드(클래스명, 메서드명, 변수명)에 일관되게 반영되어 있는가?
[ ] 주석 스타일이 // 인라인 주석만 사용하는가? (JSDoc 사용 금지)
[ ] 로거 출력이 구조화된 형태인가? (외부 모니터링 연동 시 snake_case 필드명)
[ ] 커밋 메시지가 Conventional Commits 형식(feat/fix/refactor + scope)을 따르는가?
[ ] 커밋 메시지의 scope가 서비스 도메인명(order, user, payment 등)인가?
    → 여러 도메인에 걸친 변경이면 scope 생략 또는 상위 개념 사용
[ ] 커밋 메시지의 description이 한글·서술형이며 끝에 마침표가 없는가?
    → 올바른 예: feat(order): 주문 취소 기능 추가
    → 잘못된 예: feat(order): 주문 취소 기능을 추가하라.
[ ] 커밋 메시지의 body가 "왜(why)" 변경했는지를 설명하는가? ("무엇(what)"이 아닌)
[ ] BREAKING CHANGE가 있는 경우 footer 또는 type 뒤 ! 표시로 명시되어 있는가?
[ ] 브랜치명이 Conventional Branch 형식(<type>/<scope>-<description>)을 따르는가?
[ ] 브랜치명이 모든 단어 kebab-case이고 main에서 분기했는가?
[ ] main 브랜치에 직접 commit/push하지 않고 PR을 통해 반영하는가?
[ ] PR 제목이 Conventional Commits 형식과 동일한가?
[ ] PR 본문이 Summary(변경 사항 1~3줄) + Test plan(테스트 체크리스트) 형식을 따르는가?
[ ] 머지 전략이 Squash and merge인가?
[ ] 테스트 네이밍이 {도메인행위}_when_{조건}_then_{기대결과} 패턴을 따르는가?
[ ] 긴 Service 메서드에 섹션 주석(// DB에서 주문 정보 조회 등)으로 논리적 구분이 되어 있는가?
```

---

## STEP 15 — 설계 산출물 형태 (설계 단계 작업인 경우)

> 설계 단계(RA, SD, DM, TD) 산출물을 작성한 경우에만 적용한다.

```
[ ] RA 산출물: 기능 요구사항이 FR-### 번호, 설명, 수용 기준(Acceptance Criteria), 우선순위(MoSCoW)를 포함하는가?
[ ] RA 산출물: 유스케이스가 UC-### 번호, Actor, 선행 조건, 주요 흐름(Happy Path), 예외 흐름, 후행 조건을 포함하는가?
[ ] RA 산출물: 제약 조건 정리표가 기술 스택, 외부 시스템, 일정, 규제, 트래픽 항목을 포함하는가?
[ ] SD 산출물: 서브도메인 분류표가 유형(Core/Supporting/Generic)과 구현 전략을 포함하는가?
[ ] SD 산출물: Bounded Context 정의서가 책임, 핵심 개념, 소속 서브도메인을 포함하는가?
[ ] SD 산출물: Context Map이 관계 유형(Partnership/Shared Kernel/Customer-Supplier/Conformist/ACL/OHS·PL)과 선택 이유를 포함하는가?
[ ] DM 산출물: 이벤트 스토밍 결과 매핑 테이블이 Actor/Command/Aggregate/Domain Event/Policy/External System 열을 포함하는가?
[ ] DM 산출물: 유비쿼터스 언어 용어 사전이 용어(영문)/용어(한글)/정의/소속 Context/비고 열을 포함하는가?
[ ] DM 산출물: 서로 다른 Context에서 같은 단어가 다른 의미로 쓰이는 경우 용어 사전에 명시되어 있는가?
[ ] DM 산출물: Aggregate별 도메인 모델 구조가 Root/Entity 목록/VO 목록/관계를 포함하는가?
[ ] DM 산출물: Domain Event 상세 목록이 이벤트명/발생 조건/포함 데이터/후속 처리(Policy) 열을 포함하는가?
[ ] DM 산출물: 비즈니스 규칙/불변식이 INV-### 번호와 위반 시 처리 방식을 포함하는가?
[ ] TD 산출물: 파일 구조 트리가 domain/application/infrastructure/interface 4레이어를 포함하는가?
[ ] TD 산출물: Module DI 구성이 provide/useClass 매핑을 명시하는가?
[ ] TD 산출물: Aggregate 설계서가 Root/내부 Entity/내부 VO/외부 참조(ID)/생성 규칙/불변식을 포함하는가?
[ ] TD 산출물: Repository 인터페이스 정의서가 find<Noun>s/save<Noun>/delete<Noun> 메서드를 포함하는가?
[ ] TD 산출물: Application Service 정의서가 유스케이스 매핑/처리 흐름/트랜잭션 범위/실패 시 처리를 포함하는가?
[ ] TD 산출물: Event 흐름도가 동기/비동기 처리 방식과 보상 트랜잭션을 포함하는가?
[ ] IM 산출물: Vertical Slicing(유스케이스 단위 구현)으로 진행하고 있는가?
    → 레이어 단위(수평)가 아닌 유스케이스 단위(수직)로 모든 레이어를 한 번에 구현
[ ] IM 산출물: 슬라이스 계획이 슬라이스 번호/유스케이스/포함 파일/우선순위 형식으로 정리되어 있는가?
```

---

## STEP 16 — 가이드 수정 작업인 경우

> 코드 작업이 아니라 가이드 자체를 수정하는 경우에만 적용한다.

```
[ ] 새로 추가하거나 수정한 설명이 한글로 작성되어 있는가?
[ ] 새 규칙에 올바른 예시(// 올바른 방식)와 잘못된 예시(// 잘못된 방식)가 함께 작성되어 있는가?
[ ] 작성한 예시가 이 가이드의 다른 규칙(파일 네이밍, import, 타이핑, Swagger 등)을 위반하지 않는가?
    → 위반이 있다면 예시를 먼저 수정한 뒤 규칙을 확정
[ ] 가이드 변경 시 main 브랜치가 아닌 새 브랜치에서 PR을 생성하는가?
```

---

## 체크리스트 활용 방법

AI Agent는 작업 완료 후 다음 순서로 자기 검토를 수행한다:

1. **STEP 1~14를 순서대로** 점검한다.
2. 위반 항목 발견 시 **즉시 해당 파일을 수정**하고 체크한다.
3. 수정 후 **연관된 파일(Module, import 참조 등)에도 영향이 없는지** 확인한다.
4. 설계 단계 작업이었다면 **STEP 15**도 함께 점검한다.
5. 가이드 수정 작업이었다면 **STEP 16**도 함께 점검한다.
6. 모든 체크 완료 후 작업을 마무리한다.

> 체크리스트는 가이드의 규칙을 요약한 것이다.
> 항목의 의도가 불명확하다면 해당 문서를 참조한다:
> - STEP 1 파일 구조 및 네이밍 → [03-conventions.md](03-conventions.md) 섹션 1-3
> - STEP 2 Domain 레이어 → [02-architecture.md](02-architecture.md) 섹션 2, 8, 11
> - STEP 3 레이어 아키텍처 / @nestjs/cqrs → [02-architecture.md](02-architecture.md) 섹션 2, 12 / [03-conventions.md](03-conventions.md) 섹션 6
> - STEP 4 Repository 패턴 → [02-architecture.md](02-architecture.md) 섹션 3
> - STEP 5 NestJS DI → [02-architecture.md](02-architecture.md) 섹션 3, 4
> - STEP 6 TypeScript 타이핑 → [03-conventions.md](03-conventions.md) 섹션 4
> - STEP 7 에러 처리 → [02-architecture.md](02-architecture.md) 섹션 5
> - STEP 8 REST API 엔드포인트 → [03-conventions.md](03-conventions.md) 섹션 5
> - STEP 9 Swagger → [03-conventions.md](03-conventions.md) 섹션 8
> - STEP 10 import → [03-conventions.md](03-conventions.md) 섹션 7
> - STEP 11 모듈 데코레이터 → [02-architecture.md](02-architecture.md) 섹션 4
> - STEP 12 DB/인프라 → [02-architecture.md](02-architecture.md) 섹션 3, 6
> - STEP 13 테스트 패턴 → [03-conventions.md](03-conventions.md) 섹션 13
> - STEP 14 전체 일관성 → 전체 문서 참조
> - STEP 15 설계 산출물 형태 → [01-development-process.md](01-development-process.md) Agent 1~5
> - STEP 16 가이드 수정 → [README.md](README.md) 가이드 관리 원칙
