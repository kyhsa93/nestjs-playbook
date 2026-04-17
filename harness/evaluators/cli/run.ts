import { evaluateLayerDependency } from '../rules/layer-dependency.evaluator'
import { evaluateRepositoryPattern } from '../rules/repository-pattern.evaluator'
import { evaluateControllerPath } from '../rules/controller-path.evaluator'
import { evaluateChecklist } from '../rules/checklist.evaluator'
import { evaluateStructure } from '../rules/structure.evaluator'
import { aggregate } from '../shared/score'

const taskRoot = process.argv[2]
const submissionRoot = process.argv[3]

if (!submissionRoot) {
  throw new Error('usage: node run.js <taskRoot> <submissionRoot>')
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

const report = {
  taskId: taskRoot || 'ad-hoc',
  totalScore: total,
  grade: grade(total),
  breakdown,
  failures
}

console.log(JSON.stringify(report, null, 2))
