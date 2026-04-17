import * as fs from 'node:fs'
import * as path from 'node:path'

import { evaluateLayerDependency } from '../rules/layer-dependency.evaluator'
import { evaluateRepositoryPattern } from '../rules/repository-pattern.evaluator'
import { evaluateControllerPath } from '../rules/controller-path.evaluator'
import { evaluateChecklist } from '../rules/checklist.evaluator'
import { evaluateStructure } from '../rules/structure.evaluator'
import { aggregate } from '../shared/score'

const taskRoot = process.argv[2]
const submissionRoot = process.argv[3]

if (!submissionRoot) {
  throw new Error('usage: node harness/evaluators/cli/run.js <taskRoot> <submissionRoot>')
}

const results = [
  evaluateStructure(submissionRoot),
  evaluateLayerDependency(submissionRoot),
  evaluateRepositoryPattern(submissionRoot),
  evaluateControllerPath(submissionRoot),
  evaluateChecklist(submissionRoot)
]

const { total, breakdown, failures } = aggregate(results)

function grade(score: number) {
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
  breakdown,
  failures
}

console.log(JSON.stringify(report, null, 2))
