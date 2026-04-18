// domain-event-outbox evaluator — when Aggregates emit domain events, verify
// that the Repository saves them through the outbox pattern (guide:
// docs/architecture/domain-events.md).
//
// Applicability gate: skipped when no Aggregate in src/**/domain/ declares a
// domain events array/push pattern.
//
// Heuristic rules:
// 1. If an Aggregate exposes `domainEvents` (getter) and/or pushes events
//    (`_events.push(new ...Event(`), an `outbox/` module (or similar) must
//    exist. Guide places it at `src/outbox/`.
// 2. At least one Repository implementation should reference an
//    `OutboxWriter` (or equivalent: `saveAll` + `outbox`) to persist events
//    atomically alongside the Aggregate.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { classifyLayer, walkTsFiles } from '../shared/ast-utils'

export function evaluateDomainEventOutbox(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  // Find Aggregate-like files that declare domain event patterns
  const domainFiles = files.filter((f) => classifyLayer(f) === 'domain')
  const aggregatesWithEvents = domainFiles.filter((f) => {
    const c = fs.readFileSync(f, 'utf-8')
    return /\b(?:domainEvents|_events)\b/.test(c) && /\bpush\s*\(\s*new\s+\w+Event\b/.test(c)
  })

  // Applicability gate
  if (aggregatesWithEvents.length === 0) {
    return { name: 'domain-event-outbox', score: 0, maxScore: 0, failures: [] }
  }

  let score = 15

  // Rule 1: src/outbox/ 디렉토리가 존재해야 함
  const outboxDir = path.join(srcDir, 'outbox')
  if (!fs.existsSync(outboxDir)) {
    failures.push({
      ruleId: 'domain-event-outbox.module-missing',
      severity: 'high',
      message: `Domain Events(${aggregatesWithEvents.length}개 Aggregate)이 발행되는데 src/outbox/ 공유 모듈 부재 — Outbox 패턴 구성 필요`
    })
    score -= 6
  }

  // Rule 2: 적어도 한 Repository 구현체가 OutboxWriter(또는 outbox saveAll 패턴)를 사용
  const infraFiles = files.filter((f) => classifyLayer(f) === 'infrastructure')
  const repoImpls = infraFiles.filter((f) => /-repository-impl\.ts$/.test(path.basename(f)))

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
        message: `Repository 구현체가 OutboxWriter/outbox saveAll 패턴을 사용하지 않음 — Aggregate가 발행한 도메인 이벤트가 트랜잭션으로 저장되지 않을 위험`
      })
      score -= 5
    }
  } else {
    failures.push({
      ruleId: 'domain-event-outbox.repository-impl-missing',
      severity: 'medium',
      message: `Domain Events가 발행되는데 Repository 구현체(-repository-impl.ts)를 찾지 못함`
    })
    score -= 3
  }

  // Rule 3: clearEvents() 호출 흔적 (이벤트가 outbox에 저장된 뒤 정리되는 관례)
  const clearEventsCalled = infraFiles.some((f) => /\bclearEvents\s*\(\s*\)/.test(fs.readFileSync(f, 'utf-8')))
  if (!clearEventsCalled) {
    failures.push({
      ruleId: 'domain-event-outbox.clear-events-missing',
      severity: 'low',
      message: `Repository 구현체에서 Aggregate.clearEvents() 호출 흔적 없음 — 이벤트 중복 발행 방지 관례 확인 권장`
    })
    score -= 1
  }

  void rel   // keep name convention consistency with other evaluators
  return { name: 'domain-event-outbox', score: Math.max(score, 0), maxScore: 15, failures }
}
