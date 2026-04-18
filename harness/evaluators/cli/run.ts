// Harness CLI runner.
//
// Usage:
//   npm run evaluate -- <taskRoot> <submissionRoot> [--only=a,b,c] [--out=path]
//
// Flags:
//   --only=<names>   comma-separated evaluator names to run (see EVALUATORS
//                    below). Others are skipped entirely. Useful for iterating
//                    on a single rule.
//   --out=<path>     write the JSON report to the given file instead of stdout.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { evaluateLayerDependency } from '../rules/layer-dependency.evaluator'
import { evaluateRepositoryPattern } from '../rules/repository-pattern.evaluator'
import { evaluateControllerPath } from '../rules/controller-path.evaluator'
import { evaluateChecklist } from '../rules/checklist.evaluator'
import { evaluateStructure } from '../rules/structure.evaluator'
import { evaluateCqrsPattern } from '../rules/cqrs-pattern.evaluator'
import { evaluateErrorHandling } from '../rules/error-handling.evaluator'
import { evaluateTestPresence } from '../rules/test-presence.evaluator'
import { evaluateDtoValidation } from '../rules/dto-validation.evaluator'
import { evaluateTaskQueue } from '../rules/task-queue.evaluator'
import { evaluateScheduler } from '../rules/scheduler.evaluator'
import { evaluateDeprecatedApi } from '../rules/deprecated-api.evaluator'
import { evaluateModuleDI } from '../rules/module-di.ast.evaluator'
import { evaluateImportGraph } from '../rules/import-graph.evaluator'
import { evaluateDomainEventOutbox } from '../rules/domain-event-outbox.evaluator'
import { aggregate } from '../shared/score'
import type { EvaluatorResult } from '../shared/types'

const EVALUATORS: Record<string, (root: string) => EvaluatorResult> = {
  structure: evaluateStructure,
  'layer-dependency': evaluateLayerDependency,
  'repository-pattern': evaluateRepositoryPattern,
  'controller-path': evaluateControllerPath,
  checklist: evaluateChecklist,
  'cqrs-pattern': evaluateCqrsPattern,
  'error-handling': evaluateErrorHandling,
  'test-presence': evaluateTestPresence,
  'dto-validation': evaluateDtoValidation,
  'task-queue': evaluateTaskQueue,
  scheduler: evaluateScheduler,
  'deprecated-api': evaluateDeprecatedApi,
  'module-di-ast': evaluateModuleDI,
  'import-graph': evaluateImportGraph,
  'domain-event-outbox': evaluateDomainEventOutbox
}

interface Args {
  taskRoot: string | undefined
  submissionRoot: string | undefined
  only: string[] | null
  outFile: string | null
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  let only: string[] | null = null
  let outFile: string | null = null

  for (const arg of argv) {
    if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (arg.startsWith('--out=')) {
      outFile = arg.slice('--out='.length)
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit(0)
    } else {
      positional.push(arg)
    }
  }
  return { taskRoot: positional[0], submissionRoot: positional[1], only, outFile }
}

function printHelpAndExit(code: number): never {
  console.log([
    'usage: npm run evaluate -- <taskRoot> <submissionRoot> [--only=a,b,c] [--out=path]',
    '',
    'Available evaluators:',
    ...Object.keys(EVALUATORS).map((n) => `  - ${n}`)
  ].join('\n'))
  process.exit(code)
}

const { taskRoot, submissionRoot, only, outFile } = parseArgs(process.argv.slice(2))

if (!submissionRoot) {
  printHelpAndExit(1)
}

if (only) {
  for (const name of only) {
    if (!(name in EVALUATORS)) {
      console.error(`unknown evaluator: ${name}`)
      console.error(`available: ${Object.keys(EVALUATORS).join(', ')}`)
      process.exit(2)
    }
  }
}

const selectedNames = only ?? Object.keys(EVALUATORS)
const results: EvaluatorResult[] = selectedNames.map((name) => EVALUATORS[name](submissionRoot!))
const { total, rawScore, rawMax, breakdown, breakdownMax, failures, skippedEvaluators } = aggregate(results)

function grade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

function resolveTaskId(inputTaskRoot?: string): string {
  if (!inputTaskRoot) return 'ad-hoc'
  const metadataPath = path.join(inputTaskRoot, 'metadata.json')
  if (!fs.existsSync(metadataPath)) return inputTaskRoot
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as { id?: string }
    return metadata.id || inputTaskRoot
  } catch {
    return inputTaskRoot
  }
}

const report = {
  taskId: resolveTaskId(taskRoot),
  totalScore: total,
  grade: grade(total),
  rawScore,
  rawMax,
  runEvaluators: selectedNames,
  breakdown,
  breakdownMax,
  skippedEvaluators,
  failures
}

const reportJson = JSON.stringify(report, null, 2)

if (outFile) {
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
  fs.writeFileSync(outFile, reportJson)
  console.error(`report → ${outFile}`)
} else {
  console.log(reportJson)
}
