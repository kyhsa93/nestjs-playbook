import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

export function evaluateTestPresence(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const hasTestDir = fs.existsSync(path.join(root, 'test'))
  const hasSpecFile = fs.existsSync(path.join(root, 'src')) &&
    fs.readdirSync(path.join(root, 'src'), { recursive: true } as any)
      .some((f: string) => f.endsWith('.spec.ts'))

  if (!hasTestDir && !hasSpecFile) {
    failures.push({
      ruleId: 'checklist.step15.tests.missing',
      severity: 'high',
      message: '테스트 코드가 존재하지 않습니다'
    })
    score -= 10
  }

  return {
    name: 'test-presence',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
