import { evaluateLayerDependency } from '../rules/layer-dependency.evaluator'
import { evaluateRepositoryPattern } from '../rules/repository-pattern.evaluator'
import { evaluateControllerPath } from '../rules/controller-path.evaluator'

const root = process.argv[2]

if (!root) {
  throw new Error('usage: node run.js <projectRoot>')
}

const results = [
  evaluateLayerDependency(root),
  evaluateRepositoryPattern(root),
  evaluateControllerPath(root)
]

const total = results.reduce((sum, r) => sum + r.score, 0)

console.log(JSON.stringify({ total, results }, null, 2))
