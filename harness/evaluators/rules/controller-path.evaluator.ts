import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

const VERB_PREFIXES = ['create', 'get', 'update', 'delete', 'set', 'add', 'remove']

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

    for (const verb of VERB_PREFIXES) {
      if (content.includes(`@Controller('${verb}`)) {
        failures.push({
          ruleId: 'controller.path.no-verb-prefix',
          severity: 'medium',
          message: `동사형 path 금지 (${verb}): ${file}`
        })
        score -= 5
        break
      }
    }
  }

  return {
    name: 'controller-path',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
