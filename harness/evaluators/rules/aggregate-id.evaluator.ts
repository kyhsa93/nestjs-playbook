import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { penaltyFor } from '../shared/penalty'

const DOC = 'docs/architecture/aggregate-id.md'

function walkTsFiles(root: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out
  for (const entry of fs.readdirSync(root)) {
    if (['node_modules', 'dist', 'coverage', '.git'].includes(entry)) continue
    const full = path.join(root, entry)
    if (fs.statSync(full).isDirectory()) { out.push(...walkTsFiles(full)); continue }
    if (full.endsWith('.ts') && !full.endsWith('.d.ts') && !full.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

export function evaluateAggregateId(root: string): EvaluatorResult {
  const srcRoot = path.join(root, 'src')
  const files = walkTsFiles(srcRoot)
  const entityFiles = files.filter((f) => f.endsWith('.entity.ts'))

  if (entityFiles.length === 0) {
    return { name: 'aggregate-id', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 15
  const rel = (f: string) => path.relative(root, f)

  for (const file of entityFiles) {
    const content = fs.readFileSync(file, 'utf-8')

    // @PrimaryGeneratedColumn 사용 금지
    if (/@PrimaryGeneratedColumn\s*\(/.test(content)) {
      failures.push({
        ruleId: 'aggregate-id.primary-generated-column-forbidden',
        severity: 'high',
        message: `${rel(file)}에서 @PrimaryGeneratedColumn() 사용 금지 — ID는 애플리케이션에서 generateId()로 생성하고 @PrimaryColumn({ type: 'char', length: 32 })을 사용하세요.`,
        docRef: DOC
      })
      score -= penaltyFor('high')
      continue
    }

    // @PrimaryColumn이 있다면 type: 'char' length: 32 확인
    if (/@PrimaryColumn\s*\(/.test(content)) {
      const primaryColMatch = /@PrimaryColumn\s*\(([^)]*)\)/.exec(content)
      if (primaryColMatch) {
        const opts = primaryColMatch[1]
        const hasChar = /type\s*:\s*['"]char['"]/.test(opts)
        const hasLength = /length\s*:\s*32\b/.test(opts)
        if (!hasChar || !hasLength) {
          failures.push({
            ruleId: 'aggregate-id.primary-column-type',
            severity: 'medium',
            message: `${rel(file)}의 @PrimaryColumn 옵션이 { type: 'char', length: 32 }이 아닙니다. Aggregate ID는 char(32) 타입을 사용하세요.`,
            docRef: DOC
          })
          score -= penaltyFor('medium')
        }
      }
    }
  }

  // generateId() 함수 존재 여부 확인
  const hasGenerateId = files.some((f) => {
    const content = fs.readFileSync(f, 'utf-8')
    return /export\s+(function\s+generateId|const\s+generateId)/.test(content)
  })
  if (!hasGenerateId) {
    failures.push({
      ruleId: 'aggregate-id.generate-id-missing',
      severity: 'medium',
      message: 'generateId() 함수가 없습니다. src/common/generate-id.ts에 crypto.randomUUID() 기반 ID 생성 함수를 만드세요.',
      docRef: DOC
    })
    score -= penaltyFor('medium')
  }

  return {
    name: 'aggregate-id',
    score: Math.max(score, 0),
    maxScore: 15,
    failures
  }
}
