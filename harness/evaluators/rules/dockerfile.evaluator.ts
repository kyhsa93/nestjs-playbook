import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { penaltyFor } from '../shared/penalty'

const DOC = 'docs/architecture/dockerfile.md'

export function evaluateDockerfile(root: string): EvaluatorResult {
  const dockerfilePath = path.join(root, 'Dockerfile')
  if (!fs.existsSync(dockerfilePath)) {
    return { name: 'dockerfile', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 15
  const content = fs.readFileSync(dockerfilePath, 'utf-8')

  // 멀티스테이지 빌드 필수
  if (!/\bAS\s+build\b/i.test(content)) {
    failures.push({
      ruleId: 'dockerfile.multistage-required',
      severity: 'critical',
      message: 'Dockerfile에 멀티스테이지 빌드(AS build)가 없습니다. build → production 2단계 구조가 필요합니다.',
      docRef: DOC
    })
    score -= penaltyFor('critical')
  }

  // npm wrapper 대신 node 직접 실행 (SIGTERM 처리)
  if (/^\s*CMD\s+\[?"npm/m.test(content) || /^\s*CMD\s+\[?"yarn/m.test(content)) {
    failures.push({
      ruleId: 'dockerfile.cmd-node-direct',
      severity: 'high',
      message: 'CMD에서 npm/yarn wrapper 대신 node dist/main.js를 직접 실행해야 합니다. npm은 SIGTERM을 자식 프로세스에 전달하지 않습니다.',
      docRef: DOC
    })
    score -= penaltyFor('high')
  }

  // devDependencies 제외한 프로덕션 설치
  if (!/npm\s+ci\s+--omit=dev|npm\s+install\s+--production|npm\s+ci\s+--only=production/m.test(content)) {
    failures.push({
      ruleId: 'dockerfile.prod-deps-only',
      severity: 'medium',
      message: 'Dockerfile production 스테이지에서 npm ci --omit=dev로 devDependencies를 제외해야 합니다.',
      docRef: DOC
    })
    score -= penaltyFor('medium')
  }

  // .dockerignore 존재
  if (!fs.existsSync(path.join(root, '.dockerignore'))) {
    failures.push({
      ruleId: 'dockerfile.dockerignore-missing',
      severity: 'medium',
      message: '.dockerignore 파일이 없습니다. node_modules, dist, .env* 등을 제외해야 합니다.',
      docRef: DOC
    })
    score -= penaltyFor('medium')
  }

  return {
    name: 'dockerfile',
    score: Math.max(score, 0),
    maxScore: 15,
    failures
  }
}
