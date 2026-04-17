import { EvaluatorResult, EvaluatorFailure } from './types'

export function aggregate(results: EvaluatorResult[]) {
  const breakdown = {
    structure: 0,
    architecture: 0,
    runtime: 0,
    testing: 0,
    api: 0,
    semantics: 0
  }

  let total = 0
  const failures: EvaluatorFailure[] = []

  for (const r of results) {
    total += r.score
    failures.push(...r.failures)

    if (r.name.includes('structure')) breakdown.structure += r.score
    if (r.name.includes('layer') || r.name.includes('repository') || r.name.includes('checklist')) {
      breakdown.architecture += r.score
    }
    if (r.name.includes('controller')) breakdown.api += r.score
  }

  return { total, breakdown, failures }
}
