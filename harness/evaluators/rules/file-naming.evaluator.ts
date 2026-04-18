import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

function walk(dir: string, collected: string[] = []): string[] {
  if (!fs.existsSync(dir)) return collected

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, collected)
      continue
    }
    collected.push(fullPath)
  }

  return collected
}

function isKebabCaseFileName(fileName: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9.]+$/.test(fileName)
}

export function evaluateFileNaming(submissionRoot: string): EvaluatorResult {
  const srcRoot = path.join(submissionRoot, 'src')
  const failures: EvaluatorFailure[] = []
  let score = 25

  const files = walk(srcRoot).filter((filePath) => filePath.endsWith('.ts'))

  for (const filePath of files) {
    const fileName = path.basename(filePath)
    if (!isKebabCaseFileName(fileName)) {
      failures.push({
        ruleId: 'checklist.step1.file-kebab-case',
        severity: 'medium',
        message: `kebab-case 규칙 위반: ${path.relative(submissionRoot, filePath)}`
      })
      score -= 3
    }

    if (fileName.endsWith('.service.ts')) {
      failures.push({
        ruleId: 'checklist.step1.service-file-name',
        severity: 'low',
        message: `서비스 파일명 규칙 검토 필요: ${path.relative(submissionRoot, filePath)}`
      })
      score -= 1
    }

    if (fileName.endsWith('.module.ts') && !/^[a-z0-9-]+-module\.ts$/.test(fileName)) {
      failures.push({
        ruleId: 'checklist.step1.module-file-name',
        severity: 'medium',
        message: `모듈 파일명 규칙 위반: ${path.relative(submissionRoot, filePath)}`
      })
      score -= 2
    }

    // Task Queue 관련 suffix 컨벤션 — scheduling.md와 directory-structure.md 기준.
    // 파일 내용으로 역할이 드러나는데 suffix가 규약을 벗어난 경우 경고.
    const content = fs.readFileSync(filePath, 'utf-8')

    const hasTaskConsumer = /@TaskConsumer\s*\(/.test(content)
    if (hasTaskConsumer && !/-task-controller\.ts$/.test(fileName)) {
      failures.push({
        ruleId: 'checklist.step1.task-controller-suffix',
        severity: 'medium',
        message: `@TaskConsumer 보유 파일은 *-task-controller.ts 형식이어야 함: ${path.relative(submissionRoot, filePath)}`
      })
      score -= 2
    }

    const hasCron = /@Cron\s*\(/.test(content)
    const isInfraLike = filePath.replace(/\\/g, '/').includes('/infrastructure/')
    const isTaskQueueInternal = filePath.replace(/\\/g, '/').includes('/src/task-queue/')
      || filePath.replace(/\\/g, '/').includes('/src/outbox/')
    if (hasCron && isInfraLike && !isTaskQueueInternal) {
      if (!/-scheduler\.ts$/.test(fileName)) {
        failures.push({
          ruleId: 'checklist.step1.scheduler-suffix',
          severity: 'medium',
          message: `@Cron 보유 Infrastructure 파일은 *-scheduler.ts 형식이어야 함: ${path.relative(submissionRoot, filePath)}`
        })
        score -= 2
      }
    }

    if (isTaskQueueInternal) {
      // 프레임워크 내부 파일은 역할에 맞는 suffix 권장
      if (/SQSClient|ReceiveMessageCommand|DeleteMessageCommand/.test(content)
        && !/-consumer\.ts$/.test(fileName) && !/-relay\.ts$/.test(fileName)) {
        failures.push({
          ruleId: 'checklist.step1.task-queue-role-suffix',
          severity: 'low',
          message: `SQS 수신/발행 파일은 역할에 맞는 suffix(-consumer.ts / -relay.ts) 권장: ${path.relative(submissionRoot, filePath)}`
        })
        score -= 1
      }
    }
  }

  return {
    name: 'file-naming',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
