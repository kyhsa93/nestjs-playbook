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
    const layer = file.includes('/domain/') ? 'domain'
      : file.includes('/application/') ? 'application'
      : file.includes('/interface/') ? 'interface'
      : file.includes('/infrastructure/') ? 'infrastructure' : 'unknown'

    // STEP 2 — Domain 레이어 (프레임워크 무의존)
    if (layer === 'domain') {
      if (content.includes('@Injectable(')) {
        push('checklist.step2.domain.no-nest-decorator', 'high',
          `${stepTitle(steps, 2)} — Domain에 @Injectable() 사용: ${rel(file)}`, 8)
      }
      if (/from\s+['"]class-validator['"]/.test(content) || /from\s+['"]class-transformer['"]/.test(content)) {
        push('checklist.step2.domain.no-validator-import', 'high',
          `${stepTitle(steps, 2)} — Domain에 class-validator/class-transformer import: ${rel(file)}`, 6)
      }
      if (/@Entity\(/.test(content)) {
        push('checklist.step2.domain.no-typeorm-entity', 'high',
          `${stepTitle(steps, 2)} — Domain에 @Entity() 데코레이터(TypeORM 누수): ${rel(file)}`, 8)
      }
      if (/\bLogger\b/.test(content) && /from\s+['"]@nestjs\/common['"]/.test(content)) {
        push('checklist.step2.domain.no-logger', 'medium',
          `${stepTitle(steps, 2)} — Domain에서 NestJS Logger 사용 (로깅은 Application): ${rel(file)}`, 4)
      }
    }

    // STEP 3 — Application 레이어
    if (layer === 'application') {
      if (content.includes('HttpException')) {
        push('checklist.step3.application.no-http-exception', 'high',
          `${stepTitle(steps, 3)} — Application에 HttpException 사용: ${rel(file)}`, 8)
      }
      if (/from\s+['"]@aws-sdk\//.test(content)) {
        push('checklist.step3.application.no-aws-sdk', 'medium',
          `${stepTitle(steps, 3)} — Application이 AWS SDK를 직접 import: ${rel(file)}`, 5)
      }
      // Application의 Repository 구현체 직접 import 금지 (abstract class만 사용해야 함)
      if (/from\s+['"][^'"]*-repository-impl['"]/.test(content)) {
        push('checklist.step3.application.no-impl-import', 'high',
          `${stepTitle(steps, 3)} — Application에서 -impl 직접 import (abstract class 경유 필요): ${rel(file)}`, 6)
      }
    }

    // STEP 4 — Infrastructure *-impl.ts misplacement
    if (/-impl\.ts$/.test(file) && !file.includes('/infrastructure/')) {
      push('checklist.step4.impl-outside-infrastructure', 'medium',
        `${stepTitle(steps, 4)} — *-impl.ts가 infrastructure/ 외부에 위치: ${rel(file)}`, 4)
    }

    // STEP 5 — Interface: 파일당 @Controller 1개
    const controllerCount = (content.match(/@Controller\s*\(/g) ?? []).length
    if (controllerCount > 1) {
      push('checklist.step5.interface.single-controller-per-file', 'medium',
        `${stepTitle(steps, 5)} — 한 파일에 @Controller가 ${controllerCount}개: ${rel(file)}`, 3)
    }

    // STEP 7 — Module 파일은 domain root에 위치 (interface/application/infrastructure 안에 있으면 안 됨)
    if (/-module\.ts$/.test(file) && (layer === 'application' || layer === 'interface' || layer === 'infrastructure')) {
      push('checklist.step7.module-placement', 'medium',
        `${stepTitle(steps, 7)} — Module 파일이 ${layer}/ 내부에 위치 (도메인 루트 권장): ${rel(file)}`, 3)
    }

    // STEP 8 — Entity 파일은 infrastructure/entity/ 에 위치해야 함
    if (/\.entity\.ts$/.test(file) && !file.includes('/infrastructure/') && !file.includes('/database/')) {
      // base.entity.ts는 예외 (database/)
      if (path.basename(file) !== 'base.entity.ts') {
        push('checklist.step8.entity-placement', 'medium',
          `${stepTitle(steps, 8)} — *.entity.ts가 infrastructure/ 외부에 위치: ${rel(file)}`, 3)
      }
    }

    // STEP 9 — Query Service에서 Repository 사용 금지 (CQRS — Query 인터페이스만 사용)
    if (/-query-service\.ts$/.test(file) && /\bRepository\b/.test(content) && !/\bQuery\b/.test(content)) {
      push('checklist.step9.query-service-uses-repository', 'medium',
        `${stepTitle(steps, 9)} — Query Service가 Repository를 사용 (Query 인터페이스 사용 필요): ${rel(file)}`, 4)
    }

    // STEP 11 — Async Task Controller 메서드는 Promise를 반환
    // (skipped — TypeScript 타입 체크와 중복)

    // STEP 12 — Migration/sync 하드코딩 금지 (production NODE_ENV 체크)
    if (/synchronize\s*:\s*true(?![^,})]*process\.env)/.test(content)) {
      push('checklist.step12.typeorm-synchronize-unconditional', 'high',
        `${stepTitle(steps, 12)} — TypeORM synchronize: true가 조건 없이 설정됨 (production 사고 위험): ${rel(file)}`, 6)
    }

    // STEP 13 — Secret 하드코딩 검출
    if (/(?:password|secret|apikey|api_key|token)\s*[:=]\s*['"][A-Za-z0-9_-]{8,}['"]/i.test(content)) {
      push('checklist.step13.no-hardcoded-secret', 'critical',
        `${stepTitle(steps, 13)} — 비밀값 하드코딩 의심 (process.env 사용): ${rel(file)}`, 8)
    }

    // STEP 14 — cleanup (TODO 잔존 금지)
    if (/\bTODO\b/.test(content)) {
      push('checklist.step14.no-todo', 'low',
        `${stepTitle(steps, 14)} — TODO 주석 잔존: ${rel(file)}`, 2)
    }

    // STEP 14 — 상대경로 import 금지 (../ 사용 — 절대경로 @/ 권장)
    const relImportCount = (content.match(/from\s+['"]\.\.\//g) ?? []).length
    if (relImportCount >= 3) {
      push('checklist.step14.avoid-relative-imports', 'low',
        `${stepTitle(steps, 14)} — '../' 상대경로 import ${relImportCount}회 (절대경로 @/ 권장): ${rel(file)}`, 1)
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
