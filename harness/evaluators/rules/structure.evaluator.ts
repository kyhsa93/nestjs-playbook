import * as fs from 'node:fs'
import * as path from 'node:path'
import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

export function evaluateStructure(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const required = ['domain', 'application', 'interface', 'infrastructure']
  const base = path.join(root, 'src')

  for (const dir of required) {
    const exists = fs.existsSync(base) && fs.readdirSync(base).some(d => {
      const full = path.join(base, d, dir)
      return fs.existsSync(full)
    })

    if (!exists) {
      failures.push({
        ruleId: 'structure.layer.missing',
        severity: 'high',
        message: `missing layer directory: ${dir}`
      })
      score -= 6
    }
  }

  return {
    name: 'structure',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
