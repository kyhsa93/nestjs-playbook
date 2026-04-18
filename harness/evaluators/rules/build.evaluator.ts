// build evaluator — runs `tsc --noEmit` in the submission root to verify
// the submitted code actually compiles under strict TypeScript.
//
// Applicability: skipped when submission root has no tsconfig.json (e.g. fixture
// dirs that aren't full NestJS projects).
//
// Failure modes:
//  - tsc exits non-zero: first N error lines captured as failure messages.
//  - tsc binary missing: produces a single critical failure and floors the
//    score; the human reviewer needs to address environment setup.

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { EvaluatorFailure, EvaluatorResult } from '../shared/types'

const MAX_ERROR_LINES = 25

export function evaluateBuild(root: string): EvaluatorResult {
  const failures: EvaluatorFailure[] = []
  const tsconfigPath = path.join(root, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) {
    return { name: 'build', score: 0, maxScore: 0, failures: [] }
  }

  // Prefer locally-installed tsc if node_modules exists, else fall back to npx.
  const localTsc = path.join(root, 'node_modules', '.bin', 'tsc')
  const cmd = fs.existsSync(localTsc) ? localTsc : 'npx'
  const args = cmd === 'npx' ? ['--yes', '-p', 'typescript', 'tsc', '--noEmit'] : ['--noEmit']

  const res = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, CI: '1' }
  })

  if (res.status === 0) {
    return { name: 'build', score: 25, maxScore: 25, failures: [] }
  }

  // Capture error output
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim()
  const lines = output.split('\n').slice(0, MAX_ERROR_LINES)
  for (const line of lines) {
    if (!line.trim()) continue
    failures.push({
      ruleId: 'build.tsc.error',
      severity: 'critical',
      message: line
    })
  }
  // TypeScript errors are critical — score 0 for any compile failure.
  return { name: 'build', score: 0, maxScore: 25, failures }
}
