// task-queue evaluator — enforces guide rules for Task Queue subsystem.
// AST-based (listMethodDecorators, listConstructorParams, findClassDecorator).
//
// Rules:
// - Task Controller (@TaskConsumer holder) lives in interface/ layer.
// - Task Controller injects CommandService; not DataSource/Repository/TaskExecutionLog.
// - Task Controller body does not call generateErrorResponse (Task context 무의미).
// - taskType passed to @TaskConsumer is globally unique across the codebase.
// - If @Cron or @TaskConsumer is used, AppModule imports ScheduleModule/TaskQueueModule.
//
// Applicability: if neither @TaskConsumer nor @Cron are present anywhere in
// src/, the evaluator is skipped (maxScore = 0) so aggregate() excludes it
// from grade normalization.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import {
  classifyLayer,
  findClassDecorator,
  listConstructorParams,
  listMethodDecorators,
  walkTsFiles
} from '../shared/ast-utils'

function extractTaskTypeArg(argsText: string): string | null {
  // @TaskConsumer('order.archive', { ... }) → first string arg
  const m = argsText.match(/^\s*['"`]([^'"`]+)['"`]/)
  return m ? m[1] : null
}

function findAppModuleFile(files: string[]): string | null {
  // Prefer a file whose class declaration carries @Module and whose basename
  // matches app[-.]module.ts, then fall back to any @Module file with
  // ScheduleModule.forRoot() or *Module named AppModule.
  const candidates = files.filter((f) => /app[-.]?module\.ts$/i.test(path.basename(f)))
  for (const c of candidates) {
    if (findClassDecorator(c, 'Module')) return c
  }
  // Fallback: any file with @Module declaring an AppModule class
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    if (findClassDecorator(f, 'Module') && /class\s+AppModule\b/.test(content)) return f
  }
  return null
}

export function evaluateTaskQueue(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  // Applicability gate
  const hasTaskQueueUsage = files.some((f) => {
    const content = fs.readFileSync(f, 'utf-8')
    return /@TaskConsumer\s*\(/.test(content) || /@Cron\s*\(/.test(content)
  })
  if (!hasTaskQueueUsage) {
    return { name: 'task-queue', score: 0, maxScore: 0, failures: [] }
  }

  let score = 20
  const taskTypesSeen = new Map<string, string[]>()
  let anyTaskConsumer = false
  let anyCron = false

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const methods = listMethodDecorators(file)
    const fileHasTaskConsumer = methods.some((m) => m.decorators.some((d) => d.name === 'TaskConsumer'))
    const fileHasCron = methods.some((m) => m.decorators.some((d) => d.name === 'Cron'))
    if (fileHasTaskConsumer) anyTaskConsumer = true
    if (fileHasCron) anyCron = true

    // Collect taskType args from @TaskConsumer decorators
    for (const m of methods) {
      for (const d of m.decorators) {
        if (d.name !== 'TaskConsumer') continue
        const tt = extractTaskTypeArg(d.argsText)
        if (!tt) continue
        const list = taskTypesSeen.get(tt) ?? []
        list.push(rel(file))
        taskTypesSeen.set(tt, list)
      }
    }

    const layer = classifyLayer(file)

    // Rule 1: Task Controller in interface/
    if (fileHasTaskConsumer && layer !== 'interface') {
      failures.push({
        ruleId: 'task-queue.controller.layer',
        severity: 'high',
        message: `Task Controller(@TaskConsumer 보유)가 interface/ 외 레이어(${layer})에 위치: ${rel(file)}`,
        docRef: 'docs/architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어'
      })
      score -= 5
    }

    // Rule 1b: Task Controller 파일명 suffix 컨벤션
    if (fileHasTaskConsumer && !/-task-controller\.ts$/.test(path.basename(file))) {
      failures.push({
        ruleId: 'task-queue.controller.file-suffix',
        severity: 'medium',
        message: `@TaskConsumer 보유 파일은 *-task-controller.ts 형식이어야 함: ${rel(file)}`,
        docRef: 'docs/architecture/scheduling.md#레이어-배치'
      })
      score -= 2
    }

    // Rules 2-4: Task Controller injection/error-handling constraints
    if (fileHasTaskConsumer) {
      const params = listConstructorParams(file)
      const hasDataSource = params.some((p) => /\bDataSource\b/.test(p.typeText))
      const hasRepository = params.some((p) => /\bRepository<.+>/.test(p.typeText))
      const hasExecLog = params.some((p) => /\bTaskExecutionLog\b/.test(p.typeText))
      const hasCommandService = params.some((p) => /CommandService\b/.test(p.typeText))

      if (hasDataSource) {
        failures.push({
          ruleId: 'task-queue.controller.no-datasource',
          severity: 'high',
          message: `Task Controller가 DataSource를 직접 주입: ${rel(file)} (CommandService 또는 idempotencyKey 옵션 사용)`,
          docRef: 'docs/architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어'
        })
        score -= 4
      }
      if (hasRepository) {
        failures.push({
          ruleId: 'task-queue.controller.no-repository',
          severity: 'high',
          message: `Task Controller가 Repository<Entity>를 직접 주입: ${rel(file)}`,
          docRef: 'docs/architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어'
        })
        score -= 4
      }

      // 이중 ledger 체크 (TaskExecutionLog 주입 + idempotencyKey 옵션 동시)
      const hasIdempotencyKeyOption = /idempotencyKey\s*:/.test(content)
      if (hasExecLog && hasIdempotencyKeyOption) {
        failures.push({
          ruleId: 'task-queue.controller.double-ledger-check',
          severity: 'medium',
          message: `Task Controller가 TaskExecutionLog 주입 + idempotencyKey 옵션 동시 사용: ${rel(file)} — 이중 체크. 3단계 패턴이면 옵션 제거, 2단계이면 주입 제거`
        })
        score -= 2
      }

      if (!hasCommandService) {
        failures.push({
          ruleId: 'task-queue.controller.command-service-injection',
          severity: 'medium',
          message: `Task Controller에 CommandService 주입 없음: ${rel(file)}`
        })
        score -= 3
      }

      // Rule: Task Controller 메서드에서 generateErrorResponse 사용 금지
      for (const m of methods) {
        if (!m.decorators.some((d) => d.name === 'TaskConsumer')) continue
        if (/\bgenerateErrorResponse\s*\(/.test(m.body)) {
          failures.push({
            ruleId: 'task-queue.controller.no-http-error-response',
            severity: 'high',
            message: `Task Controller 메서드 ${m.methodName}가 generateErrorResponse 호출: ${rel(file)} — 예외는 throw로 전파해 TaskQueueConsumer에 위임해야 함`
          })
          score -= 4
        }
      }
    }
  }

  // Rule 5: taskType 전역 유일
  for (const [taskType, locations] of taskTypesSeen) {
    if (locations.length > 1) {
      failures.push({
        ruleId: 'task-queue.task-type.unique',
        severity: 'critical',
        message: `taskType '${taskType}'이 ${locations.length}곳에서 중복 등록됨 — ${locations.join(', ')}`,
        docRef: 'docs/architecture/scheduling.md#taskconsumer-데코레이터'
      })
      score -= 6
    }
  }

  // Rule 6: AppModule에 ScheduleModule.forRoot() / TaskQueueModule 등록 확인
  const appModule = findAppModuleFile(files)
  if (appModule) {
    const appContent = fs.readFileSync(appModule, 'utf-8')
    if (anyCron && !/ScheduleModule\.forRoot\s*\(/.test(appContent)) {
      failures.push({
        ruleId: 'task-queue.app-module.schedule-module',
        severity: 'critical',
        message: `@Cron 사용되는데 AppModule에 ScheduleModule.forRoot() 등록 없음 — Cron 메서드가 조용히 동작 안 함`,
        docRef: 'docs/architecture/scheduling.md#appmodule-설정'
      })
      score -= 6
    }
    if (anyTaskConsumer && !/TaskQueueModule\b/.test(appContent)) {
      failures.push({
        ruleId: 'task-queue.app-module.task-queue-module',
        severity: 'high',
        message: `@TaskConsumer 사용되는데 AppModule에 TaskQueueModule import 없음`,
        docRef: 'docs/architecture/scheduling.md#appmodule-설정'
      })
      score -= 4
    }
  }

  return { name: 'task-queue', score: Math.max(score, 0), maxScore: 20, failures }
}
