// task-queue evaluator — enforces guide rules for Task Queue subsystem:
// - Task Controller (@TaskConsumer holder) lives in interface/ layer.
// - Task Controller injects CommandService, not DataSource/Repository/TaskExecutionLog.
// - Task Controller methods throw errors; no `.catch + generateErrorResponse` anti-pattern.
// - taskType passed to @TaskConsumer is globally unique across the codebase.
// - TaskQueue is used as abstract class from application layer (import path check).
//
// Rules are regex/AST-lite; sophisticated semantic analysis is out of scope.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { walkTsFiles, classifyLayer } from '../shared/ast-utils'

const TASK_CONSUMER_DECORATOR = /@TaskConsumer\(\s*['"`]([^'"`]+)['"`]/g

export function evaluateTaskQueue(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 20

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  const taskTypesSeen = new Map<string, string[]>() // taskType → list of files

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const hasTaskConsumer = /@TaskConsumer\s*\(/.test(content)
    const layer = classifyLayer(file)

    // Collect all taskTypes declared in this file
    const taskTypes: string[] = []
    let match: RegExpExecArray | null
    const re = new RegExp(TASK_CONSUMER_DECORATOR.source, 'g')
    while ((match = re.exec(content)) !== null) {
      taskTypes.push(match[1])
    }
    for (const t of taskTypes) {
      const list = taskTypesSeen.get(t) ?? []
      list.push(rel(file))
      taskTypesSeen.set(t, list)
    }

    // Rule 1: @TaskConsumer 메서드를 보유한 파일은 interface/ 레이어에 위치
    if (hasTaskConsumer && layer !== 'interface') {
      failures.push({
        ruleId: 'task-queue.controller.layer',
        severity: 'high',
        message: `Task Controller(@TaskConsumer 보유)가 interface/ 외 레이어(${layer})에 위치: ${rel(file)}`
      })
      score -= 5
    }

    // Rule 2: Task Controller는 DataSource / Repository<...> / TaskExecutionLog 직접 주입 금지
    // 단, task-queue 모듈 내부 인프라는 허용 (task-queue 디렉토리는 도메인이 아니므로 classifyLayer → unknown이라 pass)
    if (hasTaskConsumer) {
      if (/private\s+readonly\s+\w+\s*:\s*DataSource\b/.test(content)) {
        failures.push({
          ruleId: 'task-queue.controller.no-datasource',
          severity: 'high',
          message: `Task Controller가 DataSource를 직접 주입: ${rel(file)} (TaskExecutionLog abstract 또는 CommandService 경유 필요)`
        })
        score -= 4
      }
      if (/private\s+readonly\s+\w+\s*:\s*Repository<\w+>/.test(content)) {
        failures.push({
          ruleId: 'task-queue.controller.no-repository',
          severity: 'high',
          message: `Task Controller가 Repository<Entity>를 직접 주입: ${rel(file)}`
        })
        score -= 4
      }
      // 3단계 강한 원자성 패턴: TaskExecutionLog를 직접 주입, idempotencyKey 옵션은 지정하지 않음.
      // 두 가지를 동시에 쓰면 이중 ledger 체크로 의도 불분명 — 경고.
      const hasExecLogInjection = /private\s+readonly\s+\w+\s*:\s*TaskExecutionLog\b/.test(content)
      const hasIdempotencyKeyOption = /idempotencyKey\s*:/.test(content)
      if (hasExecLogInjection && hasIdempotencyKeyOption) {
        failures.push({
          ruleId: 'task-queue.controller.double-ledger-check',
          severity: 'medium',
          message: `Task Controller가 TaskExecutionLog를 직접 주입하면서 idempotencyKey 옵션도 함께 사용: ${rel(file)} — 이중 ledger 체크 의심. 3단계 원자성 패턴이면 idempotencyKey 제거, 2단계이면 TaskExecutionLog 주입 제거`
        })
        score -= 2
      }

      // Rule 3: Task Controller 메서드에서 .catch + generateErrorResponse 패턴 금지
      if (/generateErrorResponse\s*\(/.test(content)) {
        failures.push({
          ruleId: 'task-queue.controller.no-http-error-response',
          severity: 'high',
          message: `Task Controller에 generateErrorResponse(...) 사용: ${rel(file)} — 예외는 TaskQueueConsumer에 위임(throw)해야 함`
        })
        score -= 4
      }

      // Rule 4: Task Controller는 CommandService를 주입받아야 함 (heuristic)
      if (!/CommandService\b/.test(content)) {
        failures.push({
          ruleId: 'task-queue.controller.command-service-injection',
          severity: 'medium',
          message: `Task Controller에 CommandService 주입이 보이지 않음: ${rel(file)}`
        })
        score -= 3
      }
    }
  }

  // Rule 5: taskType 전역 유일성
  for (const [taskType, locations] of taskTypesSeen) {
    if (locations.length > 1) {
      failures.push({
        ruleId: 'task-queue.task-type.unique',
        severity: 'critical',
        message: `taskType '${taskType}'이 ${locations.length}곳에서 중복 등록됨 — ${locations.join(', ')}`
      })
      score -= 6
    }
  }

  // Rule 6 (정보성): Scheduler/Task Controller가 있는데 AppModule에 ScheduleModule/TaskQueueModule 등록 없음
  const hasTaskConsumerAnywhere = taskTypesSeen.size > 0
  const hasCronAnywhere = files.some((f) => /@Cron\s*\(/.test(fs.readFileSync(f, 'utf-8')))
  if (hasTaskConsumerAnywhere || hasCronAnywhere) {
    const appModule = files.find((f) => /app[-.]?module\.ts$/.test(path.basename(f)))
    if (appModule) {
      const appContent = fs.readFileSync(appModule, 'utf-8')
      if (hasCronAnywhere && !/ScheduleModule\.forRoot\s*\(/.test(appContent)) {
        failures.push({
          ruleId: 'task-queue.app-module.schedule-module',
          severity: 'critical',
          message: `@Cron 사용하는데 AppModule에 ScheduleModule.forRoot() 등록 없음 — @Cron 메서드가 조용히 동작 안 함`
        })
        score -= 6
      }
      if (hasTaskConsumerAnywhere && !/TaskQueueModule\b/.test(appContent)) {
        failures.push({
          ruleId: 'task-queue.app-module.task-queue-module',
          severity: 'high',
          message: `@TaskConsumer 사용하는데 AppModule에 TaskQueueModule import 없음 — @Global 모듈도 한 번은 등록 필요`
        })
        score -= 4
      }
    }
  }

  return { name: 'task-queue', score: Math.max(score, 0), maxScore: 20, failures }
}
