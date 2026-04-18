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
  }
  // Task Queue / Scheduler / SQS 관련 suffix 컨벤션은 각 도메인 evaluator
  // (task-queue, scheduler)로 이관하여 file-naming은 파일명 규칙만 담당한다.

  return {
    name: 'file-naming',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
