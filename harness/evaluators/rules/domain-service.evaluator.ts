import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { penaltyFor } from '../shared/penalty'

const DOC = 'docs/architecture/domain-service.md'

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

function isDomainServiceFile(root: string, file: string): boolean {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  // src/<domain>/domain/*-service.ts 패턴
  return /^src\/[^/]+\/domain\/[^/]+-service\.ts$/.test(rel)
}

export function evaluateDomainService(root: string): EvaluatorResult {
  const srcRoot = path.join(root, 'src')
  const files = walkTsFiles(srcRoot)
  const domainServiceFiles = files.filter((f) => isDomainServiceFile(root, f))

  if (domainServiceFiles.length === 0) {
    return { name: 'domain-service', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 10
  const rel = (f: string) => path.relative(root, f)

  for (const file of domainServiceFiles) {
    const content = fs.readFileSync(file, 'utf-8')

    // Domain Service는 @Injectable() 금지 — 프레임워크 독립성 필수
    if (/@Injectable\s*\(\s*\)/.test(content)) {
      failures.push({
        ruleId: 'domain-service.injectable-forbidden',
        severity: 'high',
        message: `${rel(file)}에 @Injectable() 사용 금지. Domain Service는 NestJS 프레임워크에 의존하지 않아야 합니다.`,
        docRef: DOC
      })
      score -= penaltyFor('high')
    }

    // Domain Service는 @Module, @Controller 등 NestJS 데코레이터 금지
    if (/@(Module|Controller|Get|Post|Put|Patch|Delete)\s*\(/.test(content)) {
      failures.push({
        ruleId: 'domain-service.nestjs-decorator-forbidden',
        severity: 'high',
        message: `${rel(file)}에 NestJS 라우팅/모듈 데코레이터 사용 금지. Domain Service는 순수 TypeScript 클래스여야 합니다.`,
        docRef: DOC
      })
      score -= penaltyFor('high')
    }
  }

  return {
    name: 'domain-service',
    score: Math.max(score, 0),
    maxScore: 10,
    failures
  }
}
