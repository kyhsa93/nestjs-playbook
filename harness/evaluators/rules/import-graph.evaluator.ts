import { walkTsFiles, parseImports, classifyLayer } from '../shared/ast-utils'
import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

export function evaluateImportGraph(root: string): EvaluatorResult {
  const files = walkTsFiles(`${root}/src`)
  const failures: EvaluatorFailure[] = []
  let score = 25

  for (const file of files) {
    const fromLayer = classifyLayer(file)
    const imports = parseImports(file)

    for (const imp of imports) {
      if (imp.startsWith('.')) {
        const toLayer = classifyLayer(imp)

        if (fromLayer === 'domain' && toLayer === 'infrastructure') {
          failures.push({
            ruleId: 'ast.layer.violation',
            severity: 'high',
            message: `domain -> infrastructure 의존 금지: ${file}`
          })
          score -= 5
        }
      }
    }
  }

  return {
    name: 'import-graph',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
