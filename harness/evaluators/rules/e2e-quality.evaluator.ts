import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { penaltyFor } from '../shared/penalty'

const DOC = 'docs/architecture/testing.md'

export function evaluateE2eQuality(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []

  const testDir = path.join(root, 'test')
  if (!fs.existsSync(testDir)) {
    return { name: 'e2e-quality', score: 0, maxScore: 0, failures: [] }
  }

  const e2eFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.e2e-spec.ts'))
  if (e2eFiles.length === 0) {
    return { name: 'e2e-quality', score: 0, maxScore: 0, failures: [] }
  }

  let score = 20

  // Rule 1: jest.mock() in e2e files — mock은 단위 테스트 전용
  for (const file of e2eFiles) {
    const content = fs.readFileSync(path.join(testDir, file), 'utf-8')
    if (content.includes('jest.mock(')) {
      failures.push({
        ruleId: 'e2e.jest-mock-in-e2e',
        severity: 'high',
        message: `E2E 테스트에서 jest.mock() 사용 금지: test/${file} — 외부 HTTP는 nock, DB는 testcontainers로 대체하세요`,
        docRef: `${DOC}#외부-http-모킹-nock`
      })
      score -= penaltyFor('high')
    }
  }

  // Rule 2: nock 또는 testcontainers가 없으면 경고
  const hasTooling = (() => {
    // package.json 의존성 확인
    const pkgPath = path.join(root, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }
        if ('nock' in deps || 'testcontainers' in deps || '@testcontainers/postgresql' in deps) {
          return true
        }
      } catch {
        // ignore parse error
      }
    }

    // e2e 파일 내 import 확인 (package.json이 없거나 dep 목록이 불완전한 경우 보완)
    for (const file of e2eFiles) {
      const content = fs.readFileSync(path.join(testDir, file), 'utf-8')
      if (
        content.includes("from 'nock'") ||
        content.includes('require(\'nock\')') ||
        content.includes("from 'testcontainers'") ||
        content.includes("from '@testcontainers/") ||
        content.includes('require(\'testcontainers\')')
      ) {
        return true
      }
    }
    return false
  })()

  if (!hasTooling) {
    failures.push({
      ruleId: 'e2e.no-nock-or-testcontainers',
      severity: 'medium',
      message: 'E2E 테스트에 nock 또는 testcontainers 패키지가 없습니다. 외부 HTTP는 nock, DB는 testcontainers를 사용하세요.',
      docRef: `${DOC}#sqlite-vs-testcontainers-선택-기준`
    })
    score -= penaltyFor('medium')
  }

  return {
    name: 'e2e-quality',
    score: Math.max(score, 0),
    maxScore: 20,
    failures
  }
}
