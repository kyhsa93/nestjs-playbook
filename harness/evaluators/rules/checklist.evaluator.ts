// expanded checklist evaluator
import * as fs from 'node:fs'
import * as path from 'node:path'
import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (full.endsWith('.ts')) files.push(full)
  }
  return files
}

export function evaluateChecklist(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 100

  const files = walk(path.join(root, 'src'))

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (file.includes('/domain/') && content.includes('@Injectable(')) {
      failures.push({ ruleId: 'domain-no-decorator', severity: 'high', message: file })
      score -= 8
    }

    if (file.includes('/application/') && content.includes('HttpException')) {
      failures.push({ ruleId: 'app-no-http-exception', severity: 'high', message: file })
      score -= 8
    }

    if (content.includes('TODO')) {
      failures.push({ ruleId: 'no-todo', severity: 'low', message: file })
      score -= 2
    }
  }

  return { name: 'checklist', score: Math.max(score, 0), maxScore: 100, failures }
}
