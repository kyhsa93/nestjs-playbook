import { walkTsFiles, hasProviderArray } from '../shared/ast-utils'
import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

export function evaluateModuleDI(root: string): EvaluatorResult {
  const files = walkTsFiles(`${root}/src`)
  const failures: EvaluatorFailure[] = []
  let score = 25

  for (const file of files) {
    if (!file.endsWith('.module.ts')) continue

    if (!hasProviderArray(file)) {
      failures.push({
        ruleId: 'ast.module.providers-missing',
        severity: 'high',
        message: file
      })
      score -= 5
    }
  }

  return {
    name: 'module-di-ast',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
