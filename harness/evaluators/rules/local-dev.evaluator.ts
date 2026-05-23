import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { penaltyFor } from '../shared/penalty'

const DOC = 'docs/architecture/local-dev.md'

export function evaluateLocalDev(root: string): EvaluatorResult {
  const composePath = path.join(root, 'docker-compose.yml')
  const composeYmlPath = path.join(root, 'docker-compose.yaml')
  const composefile = fs.existsSync(composePath)
    ? composePath
    : fs.existsSync(composeYmlPath)
      ? composeYmlPath
      : null

  if (!composefile) {
    return { name: 'local-dev', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 15
  const content = fs.readFileSync(composefile, 'utf-8')

  // postgres 서비스 정의
  if (!/postgres/i.test(content)) {
    failures.push({
      ruleId: 'local-dev.postgres-service-missing',
      severity: 'high',
      message: 'docker-compose.yml에 postgres 서비스가 없습니다.',
      docRef: DOC
    })
    score -= penaltyFor('high')
  }

  // healthcheck 정의
  if (!/healthcheck/i.test(content)) {
    failures.push({
      ruleId: 'local-dev.healthcheck-missing',
      severity: 'medium',
      message: 'docker-compose.yml 서비스에 healthcheck가 없습니다. depends_on condition: service_healthy를 위해 필요합니다.',
      docRef: DOC
    })
    score -= penaltyFor('medium')
  }

  // .env.development 또는 .env.example 존재
  const hasEnvFile =
    fs.existsSync(path.join(root, '.env.development')) ||
    fs.existsSync(path.join(root, '.env.example')) ||
    fs.existsSync(path.join(root, '.env'))
  if (!hasEnvFile) {
    failures.push({
      ruleId: 'local-dev.env-file-missing',
      severity: 'low',
      message: '.env.development 또는 .env.example 파일이 없습니다.',
      docRef: DOC
    })
    score -= penaltyFor('low')
  }

  return {
    name: 'local-dev',
    score: Math.max(score, 0),
    maxScore: 15,
    failures
  }
}
