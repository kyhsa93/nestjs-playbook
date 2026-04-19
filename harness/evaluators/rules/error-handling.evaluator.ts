// error-handling evaluator — Domain/Application 레이어 규칙 + 에러 코드 규칙.
//
// Rules:
// - Domain 레이어 파일에 HttpException 참조 금지.
// - Application 레이어 파일에 throw new Error() 금지 (ErrorMessage enum 사용 강제).
// - <domain>-error-message.ts가 있으면 동일 디렉토리에 <domain>-error-code.ts도 존재.
// - <Domain>ErrorMessage 와 <Domain>ErrorCode enum의 항목 수는 1:1로 일치.
// - <Domain>ErrorCode enum 키는 SCREAMING_SNAKE_CASE.
// - generateErrorResponse 매핑 배열의 각 튜플은 [메시지, ExceptionClass, ErrorCode] 3-튜플.

import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { readSourceFile, walkTsFiles } from '../shared/ast-utils'

const DOC_REF_BASE = 'docs/architecture/error-handling.md'
const DOC_REF_ERROR_CODE = `${DOC_REF_BASE}#에러-코드--enum으로-정의-메시지와-11-매핑`
const DOC_REF_CATCH = `${DOC_REF_BASE}#controller--catch-and-rethrow`

function kebabToPascal(kebab: string): string {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('')
}

function listEnumMemberNames(filePath: string, enumName: string): string[] | null {
  const sf = readSourceFile(filePath)
  let names: string[] | null = null
  function visit(node: ts.Node) {
    if (names) return
    if (ts.isEnumDeclaration(node) && node.name.text === enumName) {
      names = node.members.map((m) => {
        const raw = m.name.getText(sf).trim()
        return raw.replace(/^['"`]|['"`]$/g, '')
      })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return names
}

interface MappingCall {
  line: number
  arity: number
}

function inspectGenerateErrorResponseCalls(filePath: string): MappingCall[] {
  const sf = readSourceFile(filePath)
  const results: MappingCall[] = []
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'generateErrorResponse'
      && node.arguments.length >= 2
      && ts.isArrayLiteralExpression(node.arguments[1])
    ) {
      for (const el of node.arguments[1].elements) {
        if (ts.isArrayLiteralExpression(el)) {
          const line = sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1
          results.push({ line, arity: el.elements.length })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return results
}

export function evaluateErrorHandling(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 25

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    if (file.includes('/domain/') && content.includes('HttpException')) {
      failures.push({
        ruleId: 'checklist.step7.domain.no-http-exception',
        severity: 'high',
        message: rel(file),
        docRef: DOC_REF_BASE
      })
      score -= 8
    }

    if (file.includes('/application/') && content.includes('throw new Error(')) {
      failures.push({
        ruleId: 'checklist.step7.application.no-generic-error',
        severity: 'medium',
        message: rel(file),
        docRef: DOC_REF_BASE
      })
      score -= 5
    }
  }

  const errorMessageFiles = files.filter((f) => /-error-message\.ts$/.test(path.basename(f)))
  for (const emFile of errorMessageFiles) {
    const base = path.basename(emFile)
    const match = base.match(/^(.+)-error-message\.ts$/)
    if (!match) continue
    const kebabDomain = match[1]
    const pascalDomain = kebabToPascal(kebabDomain)
    const dir = path.dirname(emFile)
    const codeFile = path.join(dir, `${kebabDomain}-error-code.ts`)

    if (!fs.existsSync(codeFile)) {
      failures.push({
        ruleId: 'error-handling.error-code.file-missing',
        severity: 'high',
        message: `${rel(emFile)}에 대응하는 ${kebabDomain}-error-code.ts 파일이 없음`,
        docRef: DOC_REF_ERROR_CODE
      })
      score -= 4
      continue
    }

    const messageMembers = listEnumMemberNames(emFile, `${pascalDomain}ErrorMessage`)
    const codeMembers = listEnumMemberNames(codeFile, `${pascalDomain}ErrorCode`)

    if (messageMembers && codeMembers && messageMembers.length !== codeMembers.length) {
      failures.push({
        ruleId: 'error-handling.error-code.enum-count-mismatch',
        severity: 'medium',
        message: `${pascalDomain}ErrorMessage(${messageMembers.length}) vs ${pascalDomain}ErrorCode(${codeMembers.length}) 항목 수 불일치: ${rel(codeFile)}`,
        docRef: DOC_REF_ERROR_CODE
      })
      score -= 2
    }

    if (codeMembers) {
      for (const key of codeMembers) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
          failures.push({
            ruleId: 'error-handling.error-code.naming',
            severity: 'low',
            message: `${pascalDomain}ErrorCode.${key}는 SCREAMING_SNAKE_CASE가 아님: ${rel(codeFile)}`,
            docRef: DOC_REF_ERROR_CODE
          })
          score -= 1
        }
      }
    }
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    if (!content.includes('generateErrorResponse')) continue
    for (const call of inspectGenerateErrorResponseCalls(file)) {
      if (call.arity !== 3) {
        failures.push({
          ruleId: 'error-handling.generate-error-response.tuple-arity',
          severity: 'high',
          message: `generateErrorResponse 매핑이 [메시지, 예외, 에러 코드] 3-튜플이 아님 (길이=${call.arity}): ${rel(file)}:${call.line}`,
          docRef: DOC_REF_CATCH
        })
        score -= 4
      }
    }
  }

  return {
    name: 'error-handling',
    score: Math.max(score, 0),
    maxScore: 25,
    failures
  }
}
