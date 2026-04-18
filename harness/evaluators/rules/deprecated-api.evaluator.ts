// deprecated-api evaluator — checks conventions around deprecated HTTP endpoints.
//
// Rules:
// - Endpoints with 'deprecated' / 'legacy' tokens in the URL path or method
//   name should declare @ApiOperation({ deprecated: true }) so Swagger/OpenAPI
//   surfaces the flag to clients.
// - Endpoints that already use @ApiOperation({ deprecated: true }) should
//   ideally include a logger.warn call in their handler body (guide: warn 레벨
//   예시). This is informational, not a hard failure.
//
// Scope: only /interface/ layer files.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'
import { walkTsFiles, classifyLayer } from '../shared/ast-utils'

const HTTP_METHOD_DECORATOR = /@(?:Get|Post|Put|Patch|Delete)\s*\(\s*['"`]([^'"`]*)['"`]?/g

function extractMethods(content: string): Array<{ name: string; routePath: string; block: string; start: number }> {
  // Capture each HTTP method block: from @Method(...) to end of method body.
  // We grab the full @Method(...) ... { ... } text to inspect local decorators.
  const results: Array<{ name: string; routePath: string; block: string; start: number }> = []
  const decoratorRegex = /@(Get|Post|Put|Patch|Delete)\s*\(([^)]*)\)/g

  let m: RegExpExecArray | null
  while ((m = decoratorRegex.exec(content)) !== null) {
    const routePathMatch = m[2].match(/['"`]([^'"`]*)['"`]/)
    const routePath = routePathMatch?.[1] ?? ''
    const start = m.index
    // Find end of next method body (balance braces)
    const openBrace = content.indexOf('{', m.index + m[0].length)
    if (openBrace === -1) continue
    let depth = 1
    let i = openBrace + 1
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth += 1
      else if (content[i] === '}') depth -= 1
      i += 1
    }
    const block = content.slice(start, i)
    // Method name: look for identifier immediately before `(` after decorators
    const afterDecorators = content.slice(m.index, openBrace)
    const nameMatch = afterDecorators.match(/(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(/g)
    const lastNameMatch = nameMatch?.[nameMatch.length - 1]?.match(/(\w+)\s*\(/)
    const name = lastNameMatch?.[1] ?? 'unknown'
    results.push({ name, routePath, block, start })
  }
  return results
}

export function evaluateDeprecatedApi(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 10

  const srcDir = path.join(root, 'src')
  const files = walkTsFiles(srcDir)
  const rel = (f: string) => path.relative(root, f)

  // Ensure HTTP_METHOD_DECORATOR is referenced so ESLint doesn't flag it —
  // (the actual traversal uses extractMethods).
  void HTTP_METHOD_DECORATOR

  for (const file of files) {
    if (classifyLayer(file) !== 'interface') continue
    const content = fs.readFileSync(file, 'utf-8')
    if (!/@(?:Get|Post|Put|Patch|Delete)\s*\(/.test(content)) continue

    const methods = extractMethods(content)
    for (const m of methods) {
      const looksDeprecated = /deprecated|legacy|\bv1\b/i.test(m.routePath) || /deprecated|legacy/i.test(m.name)
      const hasApiOperationDeprecated = /@ApiOperation\s*\(\s*\{[^}]*deprecated\s*:\s*true/.test(m.block)

      if (looksDeprecated && !hasApiOperationDeprecated) {
        failures.push({
          ruleId: 'deprecated-api.missing-decorator',
          severity: 'medium',
          message: `Deprecated/legacy 엔드포인트 의심 — @ApiOperation({ deprecated: true }) 누락: ${rel(file)} @ ${m.name}('${m.routePath}')`
        })
        score -= 3
      }

      if (hasApiOperationDeprecated) {
        const hasWarnLog = /logger\.warn\s*\(/.test(m.block)
        if (!hasWarnLog) {
          failures.push({
            ruleId: 'deprecated-api.missing-warn-log',
            severity: 'low',
            message: `Deprecated 엔드포인트인데 logger.warn 호출 흔적 없음: ${rel(file)} @ ${m.name} — 잔존 호출 추적 권장`
          })
          score -= 1
        }
      }
    }
  }

  return { name: 'deprecated-api', score: Math.max(score, 0), maxScore: 10, failures }
}
