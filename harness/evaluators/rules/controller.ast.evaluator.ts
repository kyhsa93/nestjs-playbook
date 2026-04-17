import { walkTsFiles, getDecoratorTexts } from '../shared/ast-utils'
import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

export function evaluateControllerAST(root: string): EvaluatorResult {
  const files = walkTsFiles(`${root}/src`)
  const failures: EvaluatorFailure[] = []
  let score = 25

  for (const file of files) {
    if (!file.endsWith('controller.ts')) continue

    const decorators = getDecoratorTexts(file)

    for (const d of decorators) {
      if (d.includes("@Controller('create") || d.includes("@Controller('get")) {
        failures.push({
          ruleId: 'ast.controller.verb-path',
          severity: 'medium',
          message: file
        })
        score -= 5
      }
    }
  }

  return {
    name: 'controller-ast',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
