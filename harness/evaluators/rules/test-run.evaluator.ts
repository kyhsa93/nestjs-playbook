// test-run evaluator — runs `npm test` in the submission root when a test
// runner is configured. Distinct from test-presence (which only counts
// *.spec.ts files): this actually executes the tests.
//
// Applicability: skipped when submission has no package.json or no `test`
// script defined.
//
// Scoring:
//  - all tests pass: full credit.
//  - at least one failure: floors to 0, captures first N failing test names.
//
// To avoid surprising the caller with long-running suites, test-run is opt-in
// via HARNESS_ENABLE_TEST_RUN=1 environment variable. The evaluator returns
// maxScore=0 (skipped) otherwise so CI doesn't accidentally burn runtime.

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

const MAX_ERROR_LINES = 30
const OPT_IN_ENV = 'HARNESS_ENABLE_TEST_RUN'

export function evaluateTestRun(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return { name: 'test-run', score: 0, maxScore: 0, failures: [] }
  }
  if (process.env[OPT_IN_ENV] !== '1') {
    return {
      name: 'test-run',
      score: 0,
      maxScore: 0,
      failures: [{
        ruleId: 'test-run.skipped',
        severity: 'low',
        message: `${OPT_IN_ENV}=1로 활성화되지 않아 건너뜀 (CI/개발 시 opt-in)`
      }]
    }
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> }
    if (!pkg.scripts?.test) {
      return { name: 'test-run', score: 0, maxScore: 0, failures: [] }
    }
  } catch {
    return { name: 'test-run', score: 0, maxScore: 0, failures: [] }
  }

  // Assume a local node_modules is already installed (runner's responsibility).
  const res = spawnSync('npm', ['test', '--silent'], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, CI: '1' },
    timeout: 5 * 60 * 1000   // 5분 제한
  })

  if (res.status === 0) {
    return { name: 'test-run', score: 20, maxScore: 20, failures: [] }
  }

  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim()
  const lines = output.split('\n').slice(-MAX_ERROR_LINES)
  for (const line of lines) {
    if (!line.trim()) continue
    failures.push({
      ruleId: 'test-run.failure',
      severity: 'high',
      message: line
    })
  }
  return { name: 'test-run', score: 0, maxScore: 20, failures }
}
