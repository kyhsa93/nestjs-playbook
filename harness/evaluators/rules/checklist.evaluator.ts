import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (full.endsWith('.ts')) files.push(full)
  }
  return files
}

export function evaluateChecklist(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 100

  const files = walk(path.join(root, 'src'))

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (file.includes('/domain/')) {
      if (content.includes('@Injectable(') || content.includes('@Module(')) {
        failures.push({
          ruleId: 'checklist.step2.domain-no-decorator',
          severity: 'high',
          message: `domain layer decorator 금지 위반: ${file}`
        })
        score -= 8
      }

      if (content.includes('typeorm')) {
        failures.push({
          ruleId: 'checklist.step2.domain-no-orm',
          severity: 'high',
          message: `domain layer ORM import 금지 위반: ${file}`
        })
        score -= 8
      }
    }

    if (file.includes('/application/')) {
      if (content.includes('HttpException')) {
        failures.push({
          ruleId: 'checklist.step3.application-no-http-exception',
          severity: 'high',
          message: `application layer HttpException 사용 금지 위반: ${file}`
        })
        score -= 8
      }

      if (content.includes('@Controller(')) {
        failures.push({
          ruleId: 'checklist.step3.application-no-controller',
          severity: 'high',
          message: `application layer controller 사용 금지: ${file}`
        })
        score -= 8
      }
    }

    if (file.includes('/interface/')) {
      if (content.includes('console.log(')) {
        failures.push({
          ruleId: 'checklist.step14.no-console-log',
          severity: 'medium',
          message: `console.log 제거 필요: ${file}`
        })
        score -= 4
      }
    }

    if (file.endsWith('.ts') && content.includes('TODO')) {
      failures.push({
        ruleId: 'checklist.step14.no-todo',
        severity: 'low',
        message: `TODO 제거 필요: ${file}`
      })
      score -= 2
    }
  }

  return {
    name: 'checklist',
    score: Math.max(score, 0),
    maxScore: 100,
    failures
  }
}
