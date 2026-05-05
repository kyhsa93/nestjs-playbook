// config-validation evaluator — ConfigModule 설정, 환경 변수 validation,
// process.env 직접 참조 범위를 검증한다 (guide: docs/architecture/config.md).
//
// Applicability: src/config 디렉토리 또는 ConfigModule 사용 코드가 있으면 실행 (maxScore = 20).
//
// Rules:
// - ConfigModule.forRoot()에는 validationSchema 또는 validate 옵션이 있어야 한다.
// - src/config/*.config.ts 외부에서 process.env를 직접 참조하면 실패한다.
// - src/config/*.config.ts 파일명만 config factory로 인정한다.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

const DOC_REF = 'docs/architecture/config.md'
const PROCESS_ENV_PATTERN = /\bprocess\.env\b/g

function walkFiles(root: string, predicate: (file: string) => boolean): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out

  for (const entry of fs.readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage' || entry === '.git') continue
    const fullPath = path.join(root, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      out.push(...walkFiles(fullPath, predicate))
      continue
    }
    if (predicate(fullPath)) out.push(fullPath)
  }

  return out
}

function isConfigFactoryFile(root: string, file: string): boolean {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  return /^src\/config\/[^/]+\.config\.ts$/.test(rel)
}

function isTypeScriptSource(file: string): boolean {
  return file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.spec.ts')
}

function hasConfigModuleUsage(files: string[]): boolean {
  return files.some((file) => fs.readFileSync(file, 'utf-8').includes('ConfigModule'))
}

function hasForRootWithoutValidation(content: string): boolean {
  const forRootIndex = content.indexOf('ConfigModule.forRoot')
  if (forRootIndex < 0) return false

  const after = content.slice(forRootIndex, forRootIndex + 1200)
  return !/\bvalidationSchema\b|\bvalidate\b/.test(after)
}

export function evaluateConfigValidation(root: string): EvaluatorResult {
  const srcRoot = path.join(root, 'src')
  const configDir = path.join(srcRoot, 'config')
  const tsFiles = walkFiles(srcRoot, isTypeScriptSource)

  if (!fs.existsSync(configDir) && !hasConfigModuleUsage(tsFiles)) {
    return { name: 'config-validation', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 20
  const rel = (file: string) => path.relative(root, file)

  const configFiles = tsFiles.filter((file) => path.relative(root, file).replace(/\\/g, '/').startsWith('src/config/'))
  for (const file of configFiles) {
    if (!file.endsWith('.config.ts') && !file.endsWith('/index.ts')) {
      failures.push({
        ruleId: 'config.file-naming',
        severity: 'low',
        message: `${rel(file)}는 config factory 파일명 규칙(*.config.ts)을 따르지 않음`,
        docRef: DOC_REF
      })
      score -= 1
    }
  }

  for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf-8')

    if (hasForRootWithoutValidation(content)) {
      failures.push({
        ruleId: 'config.validation-required',
        severity: 'high',
        message: `${rel(file)}의 ConfigModule.forRoot()에 validationSchema 또는 validate 옵션이 없음`,
        docRef: DOC_REF
      })
      score -= 4
    }

    if (!isConfigFactoryFile(root, file) && PROCESS_ENV_PATTERN.test(content)) {
      failures.push({
        ruleId: 'config.process-env-direct-access',
        severity: 'medium',
        message: `${rel(file)}에서 process.env를 직접 참조함 — src/config/*.config.ts로 캡슐화 필요`,
        docRef: DOC_REF
      })
      score -= 2
    }
    PROCESS_ENV_PATTERN.lastIndex = 0
  }

  return { name: 'config-validation', score: Math.max(score, 0), maxScore: 20, failures }
}
