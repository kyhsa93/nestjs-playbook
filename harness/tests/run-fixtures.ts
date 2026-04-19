// Evaluator regression test runner.
//
// For every fixture under tests/fixtures/<evaluator>/<case>/ we invoke the
// matching evaluator against the fixture's src/ tree and compare its
// result against expected.json. Each case yields one PASS / FAIL line.
//
// expected.json schema:
//   {
//     "name": "<evaluator name>",           // must match evaluator.name
//     "applicable": boolean,                // true if maxScore > 0 expected
//     "expectedFailureRuleIds": string[]    // exact ruleIds expected
//   }

import * as fs from 'node:fs'
import * as path from 'node:path'

import { evaluateTaskQueue } from '../evaluators/rules/task-queue.evaluator'
import { evaluateScheduler } from '../evaluators/rules/scheduler.evaluator'
import { evaluateDeprecatedApi } from '../evaluators/rules/deprecated-api.evaluator'
import { evaluateDomainEventOutbox } from '../evaluators/rules/domain-event-outbox.evaluator'
import { evaluateErrorHandling } from '../evaluators/rules/error-handling.evaluator'
import { evaluateSecretManager } from '../evaluators/rules/secret-manager.evaluator'
import type { EvaluatorResult } from '../evaluators/shared/types'

type EvaluatorFn = (root: string) => EvaluatorResult

const EVALUATORS: Record<string, EvaluatorFn> = {
  'task-queue': evaluateTaskQueue,
  scheduler: evaluateScheduler,
  'deprecated-api': evaluateDeprecatedApi,
  'domain-event-outbox': evaluateDomainEventOutbox,
  'error-handling': evaluateErrorHandling,
  'secret-manager': evaluateSecretManager
}

interface Expected {
  name: string
  applicable: boolean
  expectedFailureRuleIds: string[]
}

function collectCases(fixturesRoot: string): Array<{ evaluator: string; caseName: string; caseRoot: string }> {
  const cases: Array<{ evaluator: string; caseName: string; caseRoot: string }> = []
  if (!fs.existsSync(fixturesRoot)) return cases
  for (const evaluator of fs.readdirSync(fixturesRoot)) {
    const evalDir = path.join(fixturesRoot, evaluator)
    if (!fs.statSync(evalDir).isDirectory()) continue
    for (const caseName of fs.readdirSync(evalDir)) {
      const caseRoot = path.join(evalDir, caseName)
      if (!fs.statSync(caseRoot).isDirectory()) continue
      cases.push({ evaluator, caseName, caseRoot })
    }
  }
  return cases
}

function arraysEqualAsSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((x) => set.has(x))
}

function run(): void {
  const fixturesRoot = path.resolve(__dirname, 'fixtures')
  const cases = collectCases(fixturesRoot)
  let pass = 0
  let fail = 0

  for (const c of cases) {
    const expectedPath = path.join(c.caseRoot, 'expected.json')
    if (!fs.existsSync(expectedPath)) {
      console.error(`  SKIP ${c.evaluator}/${c.caseName}: expected.json 없음`)
      continue
    }
    const expected: Expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'))
    const evaluator = EVALUATORS[c.evaluator]
    if (!evaluator) {
      console.error(`  SKIP ${c.evaluator}/${c.caseName}: evaluator 매핑 없음`)
      continue
    }
    const result = evaluator(c.caseRoot)
    const applicable = result.maxScore > 0
    const actualRuleIds = result.failures.map((f) => f.ruleId)

    const nameMatch = result.name === expected.name
    const applicabilityMatch = applicable === expected.applicable
    const failuresMatch = arraysEqualAsSets(actualRuleIds, expected.expectedFailureRuleIds)

    if (nameMatch && applicabilityMatch && failuresMatch) {
      console.log(`  PASS ${c.evaluator}/${c.caseName}`)
      pass += 1
    } else {
      console.log(`  FAIL ${c.evaluator}/${c.caseName}`)
      if (!nameMatch) console.log(`    name: expected=${expected.name} actual=${result.name}`)
      if (!applicabilityMatch) console.log(`    applicable: expected=${expected.applicable} actual=${applicable} (maxScore=${result.maxScore})`)
      if (!failuresMatch) {
        const expectedSet = new Set(expected.expectedFailureRuleIds)
        const actualSet = new Set(actualRuleIds)
        const missing = [...expectedSet].filter((x) => !actualSet.has(x))
        const extra = [...actualSet].filter((x) => !expectedSet.has(x))
        if (missing.length > 0) console.log(`    missing ruleIds: ${missing.join(', ')}`)
        if (extra.length > 0) console.log(`    extra ruleIds:   ${extra.join(', ')}`)
      }
      fail += 1
    }
  }

  console.log(`\n${pass} passed, ${fail} failed, ${cases.length} total`)
  if (fail > 0) process.exit(1)
}

run()
