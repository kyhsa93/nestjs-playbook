import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { walkTsFiles } from '../shared/ast-utils'

export function evaluateCqrsPattern(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const files = walkTsFiles(path.join(root, 'src'))
  const hasCommandDir = files.some((file) => file.replace(/\\/g, '/').includes('/application/command/'))
  const hasQueryDir = files.some((file) => file.replace(/\\/g, '/').includes('/application/query/'))

  if (!hasCommandDir) {
    failures.push({
      ruleId: 'checklist.step3.application.command-directory-missing',
      severity: 'medium',
      message: 'application/command 디렉토리가 없습니다'
    })
    score -= 8
  }

  if (!hasQueryDir) {
    failures.push({
      ruleId: 'checklist.step3.application.query-directory-missing',
      severity: 'medium',
      message: 'application/query 디렉토리가 없습니다'
    })
    score -= 8
  }

  const queryServiceUsesRepository = files
    .filter((file) => file.replace(/\\/g, '/').includes('/application/query/'))
    .some((file) => {
      const content = fs.readFileSync(file, 'utf-8')
      return content.includes('Repository')
    })

  if (queryServiceUsesRepository) {
    failures.push({
      ruleId: 'checklist.step3.query.no-repository-direct-use',
      severity: 'high',
      message: 'query 계층에서 Repository 직접 사용이 감지되었습니다'
    })
    score -= 10
  }

  return {
    name: 'cqrs-pattern',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
