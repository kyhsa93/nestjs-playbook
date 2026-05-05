// logging evaluator — 운영 코드에서 console 직접 사용과 에러 삼킴을 검증한다
// (guide: docs/architecture/logging.md).
//
// Applicability: src/ 하위 TypeScript 소스가 있으면 실행 (maxScore = 15).
//
// Rules:
// - console.log/warn/error/debug/info 직접 사용 금지
// - catch 블록이 비어 있거나 에러를 로깅/재throw하지 않으면 실패

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

const DOC_REF = 'docs/architecture/logging.md'
const CONSOLE_PATTERN = /\bconsole\.(log|warn|error|debug|info)\s*\(/g
const EMPTY_CATCH_PATTERN = /catch\s*\([^)]*\)\s*\{\s*\}/g
const CATCH_BLOCK_PATTERN = /catch\s*\([^)]*\)\s*\{([\s\S]*?)\}/g
const HANDLED_ERROR_PATTERN = /\b(logger|this\.logger|Logger)\.(error|warn|log|debug)\s*\(|\bthrow\b/

function walkTsFiles(root: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out

  for (const entry of fs.readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage' || entry === '.git') continue
    const fullPath = path.join(root, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      out.push(...walkTsFiles(fullPath))
      continue
    }
    if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts') && !fullPath.endsWith('.spec.ts')) {
      out.push(fullPath)
    }
  }

  return out
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

export function evaluateLogging(root: string): EvaluatorResult {
  const srcRoot = path.join(root, 'src')
  const files = walkTsFiles(srcRoot)
  if (files.length === 0) {
    return { name: 'logging', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 15
  const rel = (file: string) => path.relative(root, file)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    CONSOLE_PATTERN.lastIndex = 0
    let consoleMatch: RegExpExecArray | null
    while ((consoleMatch = CONSOLE_PATTERN.exec(content)) !== null) {
      failures.push({
        ruleId: 'logging.no-console',
        severity: 'medium',
        message: `${rel(file)}:${lineOf(content, consoleMatch.index)}에서 console.${consoleMatch[1]} 직접 사용 — Logger 사용 필요`,
        docRef: DOC_REF
      })
      score -= 2
    }

    EMPTY_CATCH_PATTERN.lastIndex = 0
    let emptyCatchMatch: RegExpExecArray | null
    while ((emptyCatchMatch = EMPTY_CATCH_PATTERN.exec(content)) !== null) {
      failures.push({
        ruleId: 'logging.no-empty-catch',
        severity: 'high',
        message: `${rel(file)}:${lineOf(content, emptyCatchMatch.index)}의 catch 블록이 비어 있음 — 에러 로깅 또는 재throw 필요`,
        docRef: DOC_REF
      })
      score -= 4
    }

    CATCH_BLOCK_PATTERN.lastIndex = 0
    let catchMatch: RegExpExecArray | null
    while ((catchMatch = CATCH_BLOCK_PATTERN.exec(content)) !== null) {
      const block = catchMatch[1]
      if (block.trim().length === 0) continue
      if (HANDLED_ERROR_PATTERN.test(block)) continue
      failures.push({
        ruleId: 'logging.no-swallowed-error',
        severity: 'high',
        message: `${rel(file)}:${lineOf(content, catchMatch.index)}의 catch 블록이 에러를 로깅하거나 재throw하지 않음`,
        docRef: DOC_REF
      })
      score -= 4
    }
  }

  return { name: 'logging', score: Math.max(score, 0), maxScore: 15, failures }
}
