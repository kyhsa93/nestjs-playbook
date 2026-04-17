import { walkTsFiles, readSourceFile } from '../shared/ast-utils'
import { EvaluatorResult, EvaluatorFailure } from '../shared/types'
import ts from 'typescript'

export function evaluateRepositoryPatternAST(root: string): EvaluatorResult {
  const files = walkTsFiles(`${root}/src`)
  const failures: EvaluatorFailure[] = []
  let score = 25

  for (const file of files) {
    if (!file.endsWith('-repository.ts')) continue

    const sf = readSourceFile(file)
    let isAbstract = false

    sf.forEachChild((node) => {
      if (ts.isClassDeclaration(node)) {
        if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword)) {
          isAbstract = true
        }
      }
    })

    if (!isAbstract) {
      failures.push({ ruleId: 'ast.repository.abstract', severity: 'high', message: file })
      score -= 5
    }
  }

  return { name: 'repository-pattern-ast', score: Math.max(score, 0), maxScore: 25, failures }
}
