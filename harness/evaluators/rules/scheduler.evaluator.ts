// scheduler evaluator — AST-based enforcement for @Cron Scheduler files.
//
// Rules:
// - Scheduler with @Cron lives in infrastructure/ (exception: task-queue/ &
//   outbox/ framework-internal files).
// - Every @Cron method body has try-catch or uses runSafely() helper.
// - Domain Scheduler must NOT inject Repository/DataSource/CommandService
//   (should only depend on TaskQueue abstract).
//
// Applicability: if no @Cron decorators exist in src/, evaluator is skipped.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import {
  classifyLayer,
  listConstructorParams,
  listMethodDecorators,
  walkTsFiles
} from '../shared/ast-utils'

function isFrameworkInternal(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.includes('/src/task-queue/') || normalized.includes('/src/outbox/')
}

export function evaluateScheduler(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  // Applicability gate
  const anyCron = files.some((f) => /@Cron\s*\(/.test(fs.readFileSync(f, 'utf-8')))
  if (!anyCron) {
    return { name: 'scheduler', score: 0, maxScore: 0, failures: [] }
  }

  let score = 15

  for (const file of files) {
    const methods = listMethodDecorators(file)
    const cronMethods = methods.filter((m) => m.decorators.some((d) => d.name === 'Cron'))
    if (cronMethods.length === 0) continue

    const layer = classifyLayer(file)
    const frameworkInternal = isFrameworkInternal(file)

    // Rule 1: Scheduler가 infrastructure/ 레이어에 위치 (framework-internal은 예외)
    if (!frameworkInternal && layer !== 'infrastructure') {
      failures.push({
        ruleId: 'scheduler.layer',
        severity: 'high',
        message: `@Cron 사용 Scheduler가 infrastructure/ 외 레이어(${layer})에 위치: ${rel(file)}`
      })
      score -= 4
    }

    // Rule 1b: Scheduler 파일명 suffix 컨벤션 (framework-internal 제외)
    if (!frameworkInternal && !/-scheduler\.ts$/.test(path.basename(file))) {
      failures.push({
        ruleId: 'scheduler.file-suffix',
        severity: 'medium',
        message: `@Cron 보유 Infrastructure 파일은 *-scheduler.ts 형식이어야 함: ${rel(file)}`
      })
      score -= 2
    }

    // Rule 2: 각 @Cron 메서드가 try-catch 또는 runSafely로 감싸져 있어야 함
    for (const m of cronMethods) {
      const hasTry = /\btry\s*\{/.test(m.body)
      const hasCatch = /\bcatch\s*\(/.test(m.body)
      const usesRunSafely = /\brunSafely\s*\(/.test(m.body)
      if (!(hasTry && hasCatch) && !usesRunSafely) {
        failures.push({
          ruleId: 'scheduler.cron.try-catch',
          severity: 'medium',
          message: `Cron 메서드 ${m.methodName}에 try-catch(또는 runSafely 헬퍼) 부재: ${rel(file)} — @nestjs/schedule이 예외를 삼킴`
        })
        score -= 2
      }
    }

    // Rule 3: 도메인 Scheduler는 TaskQueue.enqueue만 호출 (비즈니스 DI 금지)
    if (!frameworkInternal) {
      const params = listConstructorParams(file)
      if (params.some((p) => /\bRepository<.+>/.test(p.typeText))) {
        failures.push({
          ruleId: 'scheduler.no-repository-injection',
          severity: 'high',
          message: `Scheduler가 Repository<Entity>를 주입 (비즈니스 로직 포함 의심): ${rel(file)} — TaskQueue에 위임`
        })
        score -= 3
      }
      if (params.some((p) => /\bDataSource\b/.test(p.typeText))) {
        failures.push({
          ruleId: 'scheduler.no-datasource-injection',
          severity: 'high',
          message: `Scheduler가 DataSource를 주입: ${rel(file)} — Scheduler는 TaskQueue.enqueue만 호출`
        })
        score -= 3
      }
      if (params.some((p) => /CommandService\b/.test(p.typeText))) {
        failures.push({
          ruleId: 'scheduler.no-command-service-injection',
          severity: 'medium',
          message: `Scheduler가 CommandService를 주입: ${rel(file)} — 비즈니스 실행은 Task Controller 담당`
        })
        score -= 2
      }
    }
  }

  return { name: 'scheduler', score: Math.max(score, 0), maxScore: 15, failures }
}
