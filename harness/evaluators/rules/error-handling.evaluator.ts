import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { walkTsFiles } from '../shared/ast-utils'

export function evaluateErrorHandling(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const files = walkTsFiles(path.join(root, 'src'))

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (file.includes('/domain/') && content.includes('HttpException')) {
      failures.push({
        ruleId: 'checklist.step7.domain.no-http-exception',
        severity: 'high',
        message: file
      })
      score -= 8
    }

    if (file.includes('/application/') && content.includes('throw new Error(')) {
      failures.push({
        ruleId: 'checklist.step7.application.no-generic-error',
        severity: 'medium',
        message: file
      })
      score -= 5
    }
  }

  return {
    name: 'error-handling',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
