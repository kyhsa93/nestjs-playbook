// auth evaluator — Controller route의 보호/공개 의도 명시 여부를 검증한다
// (guide: docs/architecture/authentication.md).
//
// Applicability: *.controller.ts 파일이 있으면 실행 (maxScore = 20).
//
// Rules:
// - Controller 클래스 또는 route method에는 @UseGuards 또는 @Public 같은 공개 의도가 있어야 한다.
// - Auth/Jwt/Guard 관련 파일이 전혀 없으면 JWT/Bearer 인증 구성 누락으로 본다.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

const DOC_REF = 'docs/architecture/authentication.md'
const CONTROLLER_CLASS_PATTERN = /@Controller\s*\([^)]*\)[\s\S]*?export\s+class\s+([A-Za-z0-9_]+Controller)[\s\S]*?\{/g
const METHOD_PATTERN = /@(Get|Post|Put|Patch|Delete)\s*\([^)]*\)[\s\S]*?(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g
const PROTECTED_OR_PUBLIC_PATTERN = /@UseGuards\s*\(|@Public\s*\(|@SkipAuth\s*\(|@AllowAnonymous\s*\(/
const AUTH_FILE_PATTERN = /(auth|jwt|guard|strategy)/i

function walkFiles(root: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(root)) return out

  for (const entry of fs.readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage' || entry === '.git') continue
    const fullPath = path.join(root, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      out.push(...walkFiles(fullPath))
      continue
    }
    if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) out.push(fullPath)
  }

  return out
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function hasAuthInfrastructure(files: string[]): boolean {
  return files.some((file) => AUTH_FILE_PATTERN.test(file) || /UseGuards|JwtStrategy|PassportStrategy|AuthGuard/.test(fs.readFileSync(file, 'utf-8')))
}

export function evaluateAuth(root: string): EvaluatorResult {
  const srcRoot = path.join(root, 'src')
  const files = walkFiles(srcRoot)
  const controllerFiles = files.filter((file) => file.endsWith('.controller.ts'))

  if (controllerFiles.length === 0) {
    return { name: 'auth', score: 0, maxScore: 0, failures: [] }
  }

  const failures: EvaluatorFailure[] = []
  let score = 20
  const rel = (file: string) => path.relative(root, file)

  if (!hasAuthInfrastructure(files)) {
    failures.push({
      ruleId: 'auth.jwt-strategy-required',
      severity: 'medium',
      message: 'Controller가 존재하지만 AuthGuard/JwtStrategy/guard 관련 인증 구성이 보이지 않음',
      docRef: DOC_REF
    })
    score -= 2
  }

  for (const file of controllerFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const classHasIntent = /@UseGuards\s*\(|@Public\s*\(/.test(content.slice(0, content.indexOf('export class') > -1 ? content.indexOf('export class') : content.length))

    METHOD_PATTERN.lastIndex = 0
    let methodMatch: RegExpExecArray | null
    let methodCount = 0
    while ((methodMatch = METHOD_PATTERN.exec(content)) !== null) {
      methodCount += 1
      const methodStart = Math.max(0, methodMatch.index - 300)
      const methodDecorators = content.slice(methodStart, methodMatch.index)
      if (classHasIntent || PROTECTED_OR_PUBLIC_PATTERN.test(methodDecorators)) continue

      failures.push({
        ruleId: 'auth.route-intent-required',
        severity: 'medium',
        message: `${rel(file)}:${lineOf(content, methodMatch.index)} ${methodMatch[2]} route에 @UseGuards 또는 @Public 의도 표시가 없음`,
        docRef: DOC_REF
      })
      score -= 2
    }

    if (methodCount > 0 && !/@UseGuards\s*\(|@Public\s*\(|@SkipAuth\s*\(|@AllowAnonymous\s*\(/.test(content)) {
      failures.push({
        ruleId: 'auth.controller-intent-required',
        severity: 'medium',
        message: `${rel(file)}에 보호/공개 의도(@UseGuards 또는 @Public)가 전혀 없음`,
        docRef: DOC_REF
      })
      score -= 2
    }
  }

  return { name: 'auth', score: Math.max(score, 0), maxScore: 20, failures }
}
