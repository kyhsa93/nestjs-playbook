import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { penaltyFor } from '../shared/penalty'

const DOC = 'docs/architecture/pagination.md'

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

// 파일에 page와 take 프로퍼티가 모두 선언되어 있는지 확인 (pagination DTO 판별)
function isPaginationDto(content: string): boolean {
  return /\bpage\b/.test(content) && /\btake\b/.test(content)
}

export function evaluatePagination(root: string): EvaluatorResult {
  const srcRoot = path.join(root, 'src')
  const files = walkTsFiles(srcRoot)

  // page + take 필드가 있는 DTO 파일을 찾아 gate 조건으로 사용
  const paginationDtoFiles = files.filter(
    (f) => f.includes('dto') && isPaginationDto(fs.readFileSync(f, 'utf-8'))
  )
  if (paginationDtoFiles.length === 0) {
    return { name: 'pagination', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 15
  const rel = (f: string) => path.relative(root, f)

  for (const file of paginationDtoFiles) {
    const content = fs.readFileSync(file, 'utf-8')

    // page 필드에 @Type(() => Number) + @IsInt() 필요
    const hasPageType = /@Type\s*\(\s*\(\s*\)\s*=>\s*Number\s*\)[\s\S]{0,100}page\b|page\b[\s\S]{0,200}@Type\s*\(\s*\(\s*\)\s*=>\s*Number\s*\)/.test(content)
    const hasPageInt = /@IsInt\s*\(\s*\)[\s\S]{0,100}page\b|page\b[\s\S]{0,200}@IsInt\s*\(\s*\)/.test(content)

    if (!hasPageType || !hasPageInt) {
      failures.push({
        ruleId: 'pagination.page-decorator-missing',
        severity: 'medium',
        message: `${rel(file)}의 page 필드에 @Type(() => Number)와 @IsInt() 데코레이터가 필요합니다.`,
        docRef: DOC
      })
      score -= penaltyFor('medium')
    }

    // take 필드에 @Type(() => Number) + @IsInt() 필요
    const hasTakeType = /@Type\s*\(\s*\(\s*\)\s*=>\s*Number\s*\)[\s\S]{0,100}take\b|take\b[\s\S]{0,200}@Type\s*\(\s*\(\s*\)\s*=>\s*Number\s*\)/.test(content)
    const hasTakeInt = /@IsInt\s*\(\s*\)[\s\S]{0,100}take\b|take\b[\s\S]{0,200}@IsInt\s*\(\s*\)/.test(content)

    if (!hasTakeType || !hasTakeInt) {
      failures.push({
        ruleId: 'pagination.take-decorator-missing',
        severity: 'medium',
        message: `${rel(file)}의 take 필드에 @Type(() => Number)와 @IsInt() 데코레이터가 필요합니다.`,
        docRef: DOC
      })
      score -= penaltyFor('medium')
    }
  }

  // Repository 반환값에 data/items/result 같은 범용 키 사용 금지
  const repoFiles = files.filter((f) => f.endsWith('-repository.ts') || f.endsWith('-repository-impl.ts'))
  for (const file of repoFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    if (/[{,]\s*(data|items|result)\s*:/.test(content)) {
      failures.push({
        ruleId: 'pagination.generic-response-key',
        severity: 'medium',
        message: `${rel(file)}의 페이지네이션 응답에 data/items/result 범용 키를 사용하지 마세요. 도메인 복수형(예: orders, users)을 사용하세요.`,
        docRef: DOC
      })
      score -= penaltyFor('medium')
    }
  }

  return {
    name: 'pagination',
    score: Math.max(score, 0),
    maxScore: 15,
    failures
  }
}
