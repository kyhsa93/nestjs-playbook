import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { walkTsFiles } from '../shared/ast-utils'

export function evaluateDtoValidation(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const files = walkTsFiles(path.join(root, 'src')).filter((file) => file.endsWith('.dto.ts'))

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (!content.includes('@Is') && !content.includes('@Validate')) {
      failures.push({
        ruleId: 'checklist.step6.dto.validation-missing',
        severity: 'medium',
        message: file
      })
      score -= 5
    }
  }

  return {
    name: 'dto-validation',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
