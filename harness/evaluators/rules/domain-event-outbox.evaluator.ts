// domain-event-outbox evaluator — Aggregate가 도메인 이벤트를 발행할 때 가이드의
// Outbox 패턴을 따르는지 + Integration Event 경계를 지키는지 검증
// (guide: docs/architecture/domain-events.md).
//
// Applicability gate: 아래 중 하나라도 존재해야 실행 — 없으면 skip(maxScore=0).
//   - domain/ 레이어의 Aggregate에 `_events.push(new XxxEvent(` 패턴
//   - 코드베이스 어디든 `@HandleEvent(` / `@HandleIntegrationEvent(` 사용
//   - 코드베이스 어디든 `eventBus.publish(` 호출
//
// Rules:
// 1. src/outbox/ 모듈 존재.
// 2. Repository 구현체 중 OutboxWriter / saveAll(outbox) 패턴 사용.
// 3. Repository 구현체에 clearEvents() 호출 흔적.
// 4. Application 레이어가 도메인 이벤트 객체를 직접 `new` 하지 않음
//    (이벤트는 Aggregate 내부 도메인 메서드에서만 생성).
// 5. Application 레이어의 OutboxWriter 참조는 `application/event/` EventHandler에서만 허용
//    (Command Service 등 다른 application 서브디렉토리에서는 금지).
// 6. @HandleEvent 보유 파일은 application/event/<domain-event>-handler.ts 위치.
// 7. @HandleIntegrationEvent 보유 파일은 interface/integration-event/<domain>-integration-event-controller.ts 위치.
// 8. EventBus.publish() 직접 호출 금지 — @nestjs/cqrs 사용 중에도 Outbox 경로 준수.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { classifyLayer, walkTsFiles } from '../shared/ast-utils'

const DOC_REF = 'docs/architecture/domain-events.md'

function collectDomainEventClassNames(domainFiles: string[]): Set<string> {
  const names = new Set<string>()
  for (const f of domainFiles) {
    const content = fs.readFileSync(f, 'utf-8')
    const regex = /_events\.push\s*\(\s*new\s+(\w+)\s*\(/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(content)) !== null) {
      names.add(m[1])
    }
  }
  return names
}

export function evaluateDomainEventOutbox(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  const domainFiles = files.filter((f) => classifyLayer(f) === 'domain')
  const aggregatesWithEvents = domainFiles.filter((f) => {
    const c = fs.readFileSync(f, 'utf-8')
    return /\b(?:domainEvents|_events)\b/.test(c) && /\bpush\s*\(\s*new\s+\w+\s*\(/.test(c)
  })

  const hasHandleEvent = files.some((f) => /@HandleEvent\s*\(/.test(fs.readFileSync(f, 'utf-8')))
  const hasHandleIntegrationEvent = files.some((f) => /@HandleIntegrationEvent\s*\(/.test(fs.readFileSync(f, 'utf-8')))
  const hasEventBusPublish = files.some((f) => /\beventBus\s*\.\s*publish\s*\(/.test(fs.readFileSync(f, 'utf-8')))

  if (aggregatesWithEvents.length === 0 && !hasHandleEvent && !hasHandleIntegrationEvent && !hasEventBusPublish) {
    return { name: 'domain-event-outbox', score: 0, maxScore: 0, failures: [] }
  }

  let score = 15

  const outboxDir = path.join(srcDir, 'outbox')
  if (aggregatesWithEvents.length > 0 && !fs.existsSync(outboxDir)) {
    failures.push({
      ruleId: 'domain-event-outbox.module-missing',
      severity: 'high',
      message: `Domain Events(${aggregatesWithEvents.length}개 Aggregate)이 발행되는데 src/outbox/ 공유 모듈 부재 — Outbox 패턴 구성 필요`,
      docRef: DOC_REF
    })
    score -= 6
  }

  const infraFiles = files.filter((f) => classifyLayer(f) === 'infrastructure')
  const repoImpls = infraFiles.filter((f) => /-repository-impl\.ts$/.test(path.basename(f)))

  if (aggregatesWithEvents.length > 0) {
    if (repoImpls.length > 0) {
      const anyUsesOutbox = repoImpls.some((f) => {
        const c = fs.readFileSync(f, 'utf-8')
        return /\bOutboxWriter\b/.test(c)
          || /outbox[A-Za-z]*\.saveAll\s*\(/.test(c)
          || /\bdomainEvents\b[\s\S]*\boutbox\b/i.test(c)
      })
      if (!anyUsesOutbox) {
        failures.push({
          ruleId: 'domain-event-outbox.repository-does-not-persist-events',
          severity: 'high',
          message: `Repository 구현체가 OutboxWriter/outbox saveAll 패턴을 사용하지 않음 — Aggregate가 발행한 도메인 이벤트가 트랜잭션으로 저장되지 않을 위험`,
          docRef: DOC_REF
        })
        score -= 5
      }
    } else {
      failures.push({
        ruleId: 'domain-event-outbox.repository-impl-missing',
        severity: 'medium',
        message: `Domain Events가 발행되는데 Repository 구현체(-repository-impl.ts)를 찾지 못함`,
        docRef: DOC_REF
      })
      score -= 3
    }

    const clearEventsCalled = infraFiles.some((f) => /\bclearEvents\s*\(\s*\)/.test(fs.readFileSync(f, 'utf-8')))
    if (!clearEventsCalled) {
      failures.push({
        ruleId: 'domain-event-outbox.clear-events-missing',
        severity: 'low',
        message: `Repository 구현체에서 Aggregate.clearEvents() 호출 흔적 없음 — 이벤트 중복 발행 방지 관례 확인 권장`,
        docRef: DOC_REF
      })
      score -= 1
    }
  }

  const eventClassNames = collectDomainEventClassNames(domainFiles)
  const applicationFiles = files.filter((f) => classifyLayer(f) === 'application')

  for (const f of applicationFiles) {
    const content = fs.readFileSync(f, 'utf-8')
    for (const name of eventClassNames) {
      const pattern = new RegExp(`\\bnew\\s+${name}\\s*\\(`)
      if (pattern.test(content)) {
        failures.push({
          ruleId: 'domain-event-outbox.command-service.event-construction',
          severity: 'high',
          message: `Application 레이어가 도메인 이벤트(${name})를 직접 생성: ${rel(f)} — 이벤트는 Aggregate 내부 도메인 메서드에서만 생성`,
          docRef: DOC_REF
        })
        score -= 4
        break
      }
    }
  }

  for (const f of applicationFiles) {
    const normalized = f.replace(/\\/g, '/')
    if (normalized.includes('/application/event/')) continue
    const content = fs.readFileSync(f, 'utf-8')
    if (/\bOutboxWriter\b/.test(content)) {
      failures.push({
        ruleId: 'domain-event-outbox.command-service.outbox-writer-injection',
        severity: 'high',
        message: `Application 레이어(application/event/ 외)가 OutboxWriter를 참조: ${rel(f)} — outbox는 Repository 구현체 또는 application/event/ EventHandler에서만 사용`,
        docRef: DOC_REF
      })
      score -= 4
    }
  }

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    if (!/@HandleEvent\s*\(/.test(content)) continue
    const normalized = f.replace(/\\/g, '/')
    const inEventDir = normalized.includes('/application/event/')
    const correctSuffix = /-handler\.ts$/.test(path.basename(f))
    if (!inEventDir || !correctSuffix) {
      failures.push({
        ruleId: 'domain-event-outbox.handler.layer',
        severity: 'medium',
        message: `@HandleEvent 보유 파일이 application/event/<domain-event>-handler.ts 경로를 따르지 않음: ${rel(f)}`,
        docRef: DOC_REF
      })
      score -= 2
    }
  }

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    if (!/@HandleIntegrationEvent\s*\(/.test(content)) continue
    const normalized = f.replace(/\\/g, '/')
    const inDir = normalized.includes('/interface/integration-event/')
    const correctSuffix = /-integration-event-controller\.ts$/.test(path.basename(f))
    if (!inDir || !correctSuffix) {
      failures.push({
        ruleId: 'domain-event-outbox.integration-event.controller.layer',
        severity: 'medium',
        message: `@HandleIntegrationEvent 보유 파일이 interface/integration-event/<domain>-integration-event-controller.ts 경로를 따르지 않음: ${rel(f)}`,
        docRef: DOC_REF
      })
      score -= 2
    }
  }

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    if (/\beventBus\s*\.\s*publish\s*\(/.test(content)) {
      failures.push({
        ruleId: 'domain-event-outbox.event-bus.direct-publish',
        severity: 'high',
        message: `EventBus.publish() 직접 호출: ${rel(f)} — @nestjs/cqrs 사용 중에도 Outbox → SQS 경로를 따라야 함`,
        docRef: DOC_REF
      })
      score -= 4
    }
  }

  return { name: 'domain-event-outbox', score: Math.max(score, 0), maxScore: 15, failures }
}
