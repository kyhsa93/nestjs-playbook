// secret-manager evaluator — src/config/*.config.ts 팩토리가 민감 키를
// process.env로만 받지 않고 Secrets Manager 경로를 갖추고 있는지 검증
// (guide: docs/architecture/secret-manager.md).
//
// Applicability: src/config/ 디렉토리가 존재해야 실행 (maxScore = 10).
//
// Rule:
// - 각 *.config.ts에서 `process.env.*` 참조 중 이름에 PASSWORD/SECRET/API_KEY/APIKEY/TOKEN을
//   포함한 키가 있으면, 같은 파일에 NODE_ENV 분기, SecretsManagerClient,
//   SecretService, secretService, getSecret 중 하나라도 없으면 실패.
//   (가짜 가드 대응은 여기서는 하지 않는다 — 텍스트 휴리스틱)

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

const DOC_REF = 'docs/architecture/secret-manager.md'
const SENSITIVE_KEY_PATTERN = /process\.env\.([A-Z_]*(?:PASSWORD|SECRET|APIKEY|API_KEY|TOKEN)[A-Z_]*)/g
const GUARD_PATTERN = /\bNODE_ENV\b|\bSecretsManagerClient\b|\bSecretService\b|\bsecretService\b|\bgetSecret\b/

export function evaluateSecretManager(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  const configDir = path.join(root, 'src', 'config')
  if (!fs.existsSync(configDir) || !fs.statSync(configDir).isDirectory()) {
    return { name: 'secret-manager', score: 0, maxScore: 0, failures: [] }
  }

  let score = 10
  const rel = (f: string) => path.relative(root, f)

  const configFiles = fs.readdirSync(configDir)
    .filter((name) => name.endsWith('.config.ts'))
    .map((name) => path.join(configDir, name))

  for (const file of configFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const sensitiveKeys = new Set<string>()
    SENSITIVE_KEY_PATTERN.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SENSITIVE_KEY_PATTERN.exec(content)) !== null) {
      sensitiveKeys.add(m[1])
    }
    if (sensitiveKeys.size === 0) continue
    if (GUARD_PATTERN.test(content)) continue
    failures.push({
      ruleId: 'secret-manager.config.sensitive-env-without-guard',
      severity: 'high',
      message: `${rel(file)}이 민감 키(${[...sensitiveKeys].join(', ')})를 process.env로만 받음 — NODE_ENV 분기 또는 SecretService/SecretsManagerClient 사용 필요`,
      docRef: DOC_REF
    })
    score -= 4
  }

  return { name: 'secret-manager', score: Math.max(score, 0), maxScore: 10, failures }
}
