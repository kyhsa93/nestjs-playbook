// scheduler evaluator — enforces guide rules for @Cron Scheduler files:
// - Scheduler is placed in infrastructure/ layer (Application/Domain 금지).
// - Each @Cron method has try-catch + logger.error for @nestjs/schedule 예외 무음화 방어.
// - Scheduler delegates to TaskQueue.enqueue only — no direct business logic
//   or Repository access (heuristic: no Repository injection, no awaited DB call).
//
// Excluded from failures: task-queue/ top-level shared module (TaskOutboxRelay,
// TaskExecutionLogCleaner) which legitimately own @Cron for framework infra.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { walkTsFiles, classifyLayer } from '../shared/ast-utils'

function isFrameworkInternal(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.includes('/src/task-queue/') || normalized.includes('/src/outbox/')
}

// Extract method bodies declared after `@Cron(...)` decorator.
// Returns array of { methodName, body } so each can be checked for try-catch.
function extractCronMethods(content: string): Array<{ name: string; body: string }> {
  const results: Array<{ name: string; body: string }> = []
  const methodRegex = /@Cron\s*\([^)]*\)[\s\S]*?(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*Promise<[^>]*>)?\s*\{/g

  let match: RegExpExecArray | null
  while ((match = methodRegex.exec(content)) !== null) {
    const name = match[1]
    const bodyStart = match.index + match[0].length
    // Balance braces to find method end
    let depth = 1
    let i = bodyStart
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth += 1
      else if (content[i] === '}') depth -= 1
      i += 1
    }
    const body = content.slice(bodyStart, i - 1)
    results.push({ name, body })
  }
  return results
}

export function evaluateScheduler(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 15

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    if (!/@Cron\s*\(/.test(content)) continue

    const layer = classifyLayer(file)
    const frameworkInternal = isFrameworkInternal(file)

    // Rule 1: 도메인 Scheduler는 infrastructure/ 레이어에 위치
    if (!frameworkInternal && layer !== 'infrastructure') {
      failures.push({
        ruleId: 'scheduler.layer',
        severity: 'high',
        message: `@Cron 사용 Scheduler가 infrastructure/ 외 레이어(${layer})에 위치: ${rel(file)}`
      })
      score -= 4
    }

    // Rule 2: 각 @Cron 메서드가 try-catch로 실패 가시성 확보
    const cronMethods = extractCronMethods(content)
    for (const m of cronMethods) {
      const hasTry = /\btry\s*\{/.test(m.body)
      const hasCatch = /\bcatch\s*\(/.test(m.body)
      const hasRunSafely = /\brunSafely\s*\(/.test(m.body)
      if (!(hasTry && hasCatch) && !hasRunSafely) {
        failures.push({
          ruleId: 'scheduler.cron.try-catch',
          severity: 'medium',
          message: `Cron 메서드 ${m.name}에 try-catch(또는 runSafely 헬퍼) 부재: ${rel(file)} — @nestjs/schedule이 예외를 삼킴`
        })
        score -= 2
      }
    }

    // Rule 3: 도메인 Scheduler는 TaskQueue.enqueue만 호출 (비즈니스 로직 금지 heuristic)
    if (!frameworkInternal) {
      if (/private\s+readonly\s+\w+\s*:\s*Repository<\w+>/.test(content)) {
        failures.push({
          ruleId: 'scheduler.no-repository-injection',
          severity: 'high',
          message: `Scheduler가 Repository<Entity>를 주입 (비즈니스 로직 포함 의심): ${rel(file)} — TaskQueue에 위임`
        })
        score -= 3
      }
      if (/private\s+readonly\s+\w+\s*:\s*DataSource\b/.test(content)) {
        failures.push({
          ruleId: 'scheduler.no-datasource-injection',
          severity: 'high',
          message: `Scheduler가 DataSource를 주입: ${rel(file)} — Scheduler는 TaskQueue.enqueue만 호출해야 함`
        })
        score -= 3
      }
      // Scheduler가 CommandService를 주입받으면 비즈니스 로직을 직접 실행할 가능성
      if (/CommandService\b/.test(content)) {
        failures.push({
          ruleId: 'scheduler.no-command-service-injection',
          severity: 'medium',
          message: `Scheduler가 CommandService를 주입: ${rel(file)} — 비즈니스 실행은 Task Controller에 위임, Scheduler는 TaskQueue.enqueue만`
        })
        score -= 2
      }
    }
  }

  return { name: 'scheduler', score: Math.max(score, 0), maxScore: 15, failures }
}
