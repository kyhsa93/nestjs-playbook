import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

export function evaluateControllerPath(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  function walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? walk(full) : [full]
    })
  }

  const files = walk(path.join(root, 'src')).filter(f => f.endsWith('controller.ts'))

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (content.includes("@Controller('create") || content.includes("@Controller('get")) {
      failures.push({
        ruleId: 'controller.path.naming',
        severity: 'medium',
        message: `동사형 path 금지: ${file}`
      })
      score -= 5
    }
  }

  return {
    name: 'controller-path',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
