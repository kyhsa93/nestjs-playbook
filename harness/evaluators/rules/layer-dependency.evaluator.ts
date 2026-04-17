import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorResult, EvaluatorFailure } from '../shared/types'

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (full.endsWith('.ts')) files.push(full)
  }
  return files
}

export function evaluateLayerDependency(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const files = walk(path.join(root, 'src'))

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (file.includes('/domain/')) {
      if (content.includes('@nestjs') || content.includes('typeorm')) {
        failures.push({
          ruleId: 'layer.domain.no-framework',
          severity: 'high',
          message: `domain layer에서 framework 의존 발견: ${file}`
        })
        score -= 5
      }
    }

    if (file.includes('/application/')) {
      if (content.includes('typeorm')) {
        failures.push({
          ruleId: 'layer.application.no-direct-orm',
          severity: 'high',
          message: `application layer에서 ORM 직접 사용: ${file}`
        })
        score -= 5
      }
    }
  }

  return {
    name: 'layer-dependency',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
