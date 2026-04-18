# Observability — 메트릭 · 트레이싱 · 알람

로깅(`logging.md`)만으로는 운영 신호를 포착하기 부족하다. 메트릭(metrics), 분산 트레이싱(tracing), 알람(alerting)을 함께 구성해 **3축(three pillars)** 을 맞춘다.

## 목차

- [기본 원칙](#기본-원칙)
- [메트릭 — Prometheus / OpenTelemetry Metrics](#메트릭--prometheus--opentelemetry-metrics)
- [트레이싱 — OpenTelemetry Traces](#트레이싱--opentelemetry-traces)
- [로그와의 상관관계 — traceId 전파](#로그와의-상관관계--traceid-전파)
- [알람 — 무엇을 알람할 것인가](#알람--무엇을-알람할-것인가)
- [대시보드 구성 권장](#대시보드-구성-권장)
- [원칙](#원칙)

## 기본 원칙

- **세 축 모두 동일한 `traceId`로 연결**한다. 로그·메트릭·트레이스 중 어느 것에서 시작해도 나머지 두 축으로 점프 가능해야 한다.
- **계측은 Infrastructure 레이어에서 시작**한다 — Domain/Application은 기술 계측에 의존하지 않는다. `NestInstrumentation`·`PinoLogger`·`HistogramMeter` 등은 Infrastructure 또는 공용 모듈에 배치.
- **측정 대상은 "사용자가 체감하는 것"**: 요청 지연, 성공률, 큐 적체, Task 처리 시간. 내부 구현 수치는 보조.

## 메트릭 — Prometheus / OpenTelemetry Metrics

### 최소 메트릭 세트 (모든 서비스 기본)

| 메트릭 | 타입 | 목적 |
|--------|------|------|
| `http_request_duration_seconds` | Histogram (labels: `method`, `route`, `status`) | HTTP 지연·success rate |
| `http_requests_total` | Counter | 전체 요청 수 |
| `task_processing_duration_seconds` | Histogram (labels: `task_type`, `status`) | Task 처리 시간 |
| `task_processed_total` | Counter | Task 처리 수 (success/failure) |
| `sqs_queue_age_seconds` | Gauge | 큐의 가장 오래된 메시지 나이 (`ApproximateAgeOfOldestMessage`) |
| `sqs_queue_depth` | Gauge | 큐 메시지 수 (`ApproximateNumberOfMessages`) |
| `sqs_dlq_depth` | Gauge | DLQ 메시지 수 — **알람 핵심** |
| `db_query_duration_seconds` | Histogram | DB 쿼리 지연 |
| `db_pool_connections_active` | Gauge | 현재 사용 중 커넥션 수 |

### NestJS 통합 패턴

```typescript
// src/observability/metrics-module.ts
import { Module } from '@nestjs/common'
import { PrometheusModule } from '@willsoto/nestjs-prometheus'

@Module({
  imports: [
    PrometheusModule.register({
      defaultLabels: { app: process.env.APP_NAME ?? 'api' },
      path: '/metrics',  // GET /metrics — Prometheus scrape 대상
      defaultMetrics: { enabled: true }
    })
  ]
})
export class MetricsModule {}
```

- `AppModule`에 `MetricsModule` import.
- `/metrics` 엔드포인트는 **내부 네트워크에서만 접근 가능**하도록 방화벽/쿠버네티스 NetworkPolicy로 제한.
- **인증 없이 노출할 경우 민감 정보(내부 경로, 사용량 패턴)가 새어나가지 않는지 검토**.

### 커스텀 메트릭 — TaskQueue 예시

```typescript
// src/task-queue/task-metrics.ts
import { Injectable } from '@nestjs/common'
import { Counter, Histogram } from 'prom-client'
import { InjectMetric } from '@willsoto/nestjs-prometheus'

@Injectable()
export class TaskMetrics {
  constructor(
    @InjectMetric('task_processing_duration_seconds')
    private readonly duration: Histogram<'task_type' | 'status'>,
    @InjectMetric('task_processed_total')
    private readonly processed: Counter<'task_type' | 'status'>
  ) {}

  public record(taskType: string, status: 'success' | 'failure', durationSec: number): void {
    this.duration.observe({ task_type: taskType, status }, durationSec)
    this.processed.inc({ task_type: taskType, status })
  }
}
```

`TaskQueueConsumer.poll()`의 dispatch 전후에서 `TaskMetrics.record`를 호출.

### SQS 지표 수집

SQS 지표는 CloudWatch에서 직접 가져오는 편이 간단하다. 자체 메트릭 수집이 필요하면 **별도 Cron**이 `GetQueueAttributes` API를 호출해 Gauge 업데이트.

```typescript
@Cron('*/30 * * * * *')  // 30초마다
public async updateQueueMetrics(): Promise<void> {
  const attrs = await this.sqs.send(new GetQueueAttributesCommand({
    QueueUrl: process.env.SQS_TASK_QUEUE_URL!,
    AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateAgeOfOldestMessage']
  }))
  this.queueDepth.set(Number(attrs.Attributes?.ApproximateNumberOfMessages ?? 0))
  this.queueAge.set(Number(attrs.Attributes?.ApproximateAgeOfOldestMessage ?? 0))
}
```

## 트레이싱 — OpenTelemetry Traces

NestJS는 `@opentelemetry/auto-instrumentations-node`로 HTTP·TypeORM·SQS 등을 **자동 계측**할 수 있다.

### 부트스트랩

```typescript
// src/tracing.ts — main.ts보다 먼저 import되어야 함
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.APP_NAME ?? 'api',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'dev'
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false }  // 소음 많음
  })]
})

sdk.start()
```

```typescript
// src/main.ts — tracing.ts를 최상단에서 import
import './tracing'
import { NestFactory } from '@nestjs/core'
// ...
```

### Task 경계에서의 트레이스 전파

Task 메시지 본문에 `traceparent` 헤더를 담아 **생산자 → TaskOutboxRelay → SQS → TaskQueueConsumer**로 context를 전파한다. 수신 측에서 `propagation.extract`로 복원하면 Task 실행이 원래 HTTP 요청의 트레이스 아래 span으로 붙는다.

```typescript
// 생산자 (TaskQueueOutbox.enqueue)
const carrier: Record<string, string> = {}
propagation.inject(context.active(), carrier)
await manager.save(TaskOutboxEntity, {
  ...,
  traceparent: carrier.traceparent ?? null
})

// 수신 (TaskQueueConsumer.poll)
const ctx = propagation.extract(ROOT_CONTEXT, { traceparent: row.traceparent ?? '' })
await context.with(ctx, () => this.registry.dispatch(taskType, payload))
```

## 로그와의 상관관계 — traceId 전파

로그 라인에 `traceId`를 포함시켜야 트레이스 ↔ 로그 cross-jump이 가능하다.

```typescript
// LoggingInterceptor 또는 custom formatter
const span = trace.getActiveSpan()
const traceId = span?.spanContext().traceId
logger.log({ message: '...', trace_id: traceId })
```

Grafana / Loki / Datadog 등 대부분의 로그 시스템이 `trace_id` 필드를 자동 인식해 트레이스 링크 제공.

## 알람 — 무엇을 알람할 것인가

알람은 **"사용자 영향 있음"** 신호만 남겨야 한다. 과한 알람은 무감각을 낳는다.

### Must-alert (즉시 호출)

| 조건 | 임계 | 근거 |
|------|------|------|
| HTTP 5xx rate | > 1% for 5분 | 사용자 요청 실패 |
| HTTP p99 latency | > 2초 for 5분 | 사용자 체감 지연 |
| DLQ depth | > 0 for 1분 | 독성 메시지 / Task 실패 누적 |
| SQS queue age | > 10분 | 처리 지연으로 task 쌓임 |
| DB pool 사용률 | > 90% for 3분 | 커넥션 고갈 직전 |
| 애플리케이션 비가용 | readiness probe 실패 | 배포/장애 |

### Warn (근무 시간 내 대응)

- Task 실패율 > 5%
- DB 쿼리 p95 > 500ms
- Memory 사용률 > 80%
- Task 처리량이 평상치의 50% 이하 / 200% 이상

### 금지 — 이런 것은 알람하지 마라

- 개별 요청 하나의 에러
- 시간대별 요청 수 편차 (주/야 패턴)
- 배포 직후 일시적 5xx spike (배포 자체 알람은 Slack notification 수준)

## 대시보드 구성 권장

서비스당 **1개 메인 대시보드**:

1. **Golden Signals** — 지연·트래픽·에러·포화 (Google SRE Book)
2. **Task Queue 패널** — 큐/DLQ depth, task 처리 시간, 실패율
3. **DB 패널** — 쿼리 p50/p95/p99, 커넥션 풀, slow query 목록
4. **리소스 패널** — CPU·메모리·GC

별도로 **`Oncall Runbook` 링크**를 대시보드 상단에 두어 알람 → 대시보드 → 대응 절차가 1클릭으로 연결되도록 한다.

## 원칙

- **3축(로그·메트릭·트레이스)는 `traceId`로 묶는다** — 분리되면 디버깅 비용 폭증.
- **계측 코드는 Domain에 두지 않는다** — Infrastructure 또는 공용 `observability/` 모듈.
- **알람은 "사용자 영향 있음"만** — 내부 이상 신호는 대시보드에.
- **대시보드는 서비스당 1개 메인** — 여러 개면 아무도 안 본다.
- **`/metrics` 엔드포인트는 내부망 한정** — 사용 패턴 누출 방지.
- **운영 `traceId` 1개로 디버깅 시간 80% 단축** — 다른 최적화보다 효과 크다.
- **Oncall Runbook 필수** — 알람이 울린 뒤 "어떻게 대응?" 답이 없으면 계측 의미 없음.

## 관련 문서

- [logging.md](./logging.md) — 구조화 로깅 · 로그 레벨 규약
- [graceful-shutdown.md](./graceful-shutdown.md) — readiness/liveness 헬스체크
- [scheduling.md](./scheduling.md) — Task Queue 관찰 가능성 (DLQ · queue age · 하트비트)
