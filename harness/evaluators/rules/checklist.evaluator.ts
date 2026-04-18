// checklist evaluator — parses docs/checklist.md for STEP structure and runs
// mechanically-verifiable rules mapped to their originating STEP.
//
// Design:
// - Load the checklist document once at startup to discover STEP titles and
//   total item counts. This surfaces a stable ruleId namespace
//   (checklist.step<N>.<slug>) and lets failure messages include the
//   human-readable STEP title.
// - Apply a curated set of pattern-based rules. Concerns already covered by
//   dedicated evaluators (layer-dependency, repository-pattern, error-handling,
//   file-naming, etc.) are intentionally not duplicated here.
// - Report coverage as an informational failure so it's visible how much of
//   the checklist is mechanically enforced.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

type Step = { number: number; title: string; itemCount: number }

// docs/checklist.md 위치는 실행 cwd에 의존. 보통 프로젝트 루트에서 실행하므로
// cwd 기준 상위 디렉토리 몇 단계를 후보로 탐색한다 (하네스가 sandbox/ 등에서
// 호출될 수도 있음).
function locateChecklistDoc(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'docs/checklist.md'),
    path.resolve(process.cwd(), '../docs/checklist.md'),
    path.resolve(process.cwd(), '../../docs/checklist.md'),
    path.resolve(process.cwd(), '../../../docs/checklist.md')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (full.endsWith('.ts')) files.push(full)
  }
  return files
}

function parseChecklistSteps(): Step[] {
  const docPath = locateChecklistDoc()
  if (!docPath) return []
  const md = fs.readFileSync(docPath, 'utf-8')
  const lines = md.split('\n')

  const steps: Step[] = []
  let current: Step | null = null

  const stepHeader = /^## STEP (\d+)\s*—\s*(.+)$/

  for (const line of lines) {
    const m = line.match(stepHeader)
    if (m) {
      if (current) steps.push(current)
      current = { number: Number(m[1]), title: m[2].trim(), itemCount: 0 }
      continue
    }
    if (current && /^\[ \]/.test(line)) current.itemCount += 1
  }
  if (current) steps.push(current)
  return steps
}

function stepTitle(steps: Step[], n: number): string {
  return steps.find((s) => s.number === n)?.title ?? `STEP ${n}`
}

export function evaluateChecklist(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  let score = 100
  const steps = parseChecklistSteps()
  const files = walk(path.join(root, 'src'))

  const rel = (f: string) => path.relative(root, f)
  const push = (ruleId: string, severity: EvaluatorFailure['severity'], message: string, penalty: number) => {
    failures.push({ ruleId, severity, message })
    score -= penalty
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')

    // STEP 2 — Domain 레이어
    if (file.includes('/domain/')) {
      if (content.includes('@Injectable(')) {
        push(
          'checklist.step2.domain.no-nest-decorator',
          'high',
          `${stepTitle(steps, 2)} — Domain에 @Injectable() 사용: ${rel(file)}`,
          8
        )
      }
      // Domain must not depend on class-validator / class-transformer / typeorm
      if (/from\s+['"]class-validator['"]/.test(content) || /from\s+['"]class-transformer['"]/.test(content)) {
        push(
          'checklist.step2.domain.no-validator-import',
          'high',
          `${stepTitle(steps, 2)} — Domain에 class-validator/class-transformer import: ${rel(file)}`,
          6
        )
      }
      if (/@Entity\(/.test(content)) {
        push(
          'checklist.step2.domain.no-typeorm-entity',
          'high',
          `${stepTitle(steps, 2)} — Domain에 @Entity() 데코레이터(TypeORM 누수): ${rel(file)}`,
          8
        )
      }
    }

    // STEP 3 — Application 레이어
    if (file.includes('/application/')) {
      if (content.includes('HttpException')) {
        push(
          'checklist.step3.application.no-http-exception',
          'high',
          `${stepTitle(steps, 3)} — Application에 HttpException 사용: ${rel(file)}`,
          8
        )
      }
      if (/from\s+['"]@aws-sdk\//.test(content)) {
        push(
          'checklist.step3.application.no-aws-sdk',
          'medium',
          `${stepTitle(steps, 3)} — Application이 AWS SDK를 직접 import (Infrastructure 어댑터 경유 필요): ${rel(file)}`,
          5
        )
      }
    }

    // STEP 4 — Infrastructure *-impl.ts misplacement
    if (/-impl\.ts$/.test(file) && !file.includes('/infrastructure/')) {
      push(
        'checklist.step4.impl-outside-infrastructure',
        'medium',
        `${stepTitle(steps, 4)} — *-impl.ts가 infrastructure/ 외부에 위치: ${rel(file)}`,
        4
      )
    }

    // STEP 5 — Interface: HTTP Controller가 .ts에 여러 개 정의 금지 (heuristic)
    // (skipped — 요구: 파일당 @Controller 하나)

    // STEP 14 — cleanup (TODO 잔존 금지)
    if (/\bTODO\b/.test(content)) {
      push(
        'checklist.step14.no-todo',
        'low',
        `${stepTitle(steps, 14)} — TODO 주석 잔존: ${rel(file)}`,
        2
      )
    }
  }

  // Informational: STEP 파싱 및 커버리지 요약
  if (steps.length > 0) {
    const totalItems = steps.reduce((sum, s) => sum + s.itemCount, 0)
    failures.push({
      ruleId: 'checklist.meta.coverage',
      severity: 'low',
      message: `docs/checklist.md 파싱: STEP ${steps.length}개, 체크 항목 ${totalItems}개 (하네스는 일부만 기계적으로 검증)`
    })
  } else {
    failures.push({
      ruleId: 'checklist.meta.doc-missing',
      severity: 'medium',
      message: `docs/checklist.md를 찾지 못함 — STEP 구조 파싱 생략`
    })
  }

  return { name: 'checklist', score: Math.max(score, 0), maxScore: 100, failures }
}
