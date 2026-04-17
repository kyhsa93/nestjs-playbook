import { evaluateLayerDependency } from '../rules/layer-dependency.evaluator'
import { evaluateRepositoryPattern } from '../rules/repository-pattern.evaluator'
import { evaluateControllerPath } from '../rules/controller-path.evaluator'
import { aggregate } from '../shared/score'

const root = process.argv[2]

if (!root) {
  throw new Error('usage: node run.js <projectRoot>')
}

const results = [
  evaluateLayerDependency(root),
  evaluateRepositoryPattern(root),
  evaluateControllerPath(root)
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
  taskId: 'ad-hoc',
  totalScore: total,
  grade: grade(total),
  breakdown,
  failures
}

console.log(JSON.stringify(report, null, 2))
