import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

export function evaluateRepositoryPattern(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const domainPath = path.join(root, 'src')

  function walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): string[] => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? walk(full) : [full]
    })
  }

  const files = walk(domainPath)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (file.endsWith('-repository.ts')) {
      if (!content.includes('abstract class')) {
        failures.push({
          ruleId: 'repository.abstract-class',
          severity: 'high',
          message: `repository는 abstract class여야 함: ${file}`
        })
        score -= 5
      }
    }

    if (file.includes('/application/') && content.includes('Repository')) {
      if (content.includes('new ') || content.includes('typeorm')) {
        failures.push({
          ruleId: 'repository.no-direct-instantiation',
          severity: 'high',
          message: `application에서 repository 직접 생성 금지: ${file}`
        })
        score -= 5
      }
    }
  }

  return {
    name: 'repository-pattern',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
