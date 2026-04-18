import { EvaluatorResult, EvaluatorFailure } from './types'

export interface AggregateReport {
  total: number            // normalized 0-100 score
  rawScore: number         // sum of per-evaluator scores (applicable only)
  rawMax: number           // sum of per-evaluator maxScore (applicable only)
  breakdown: {
    structure: number      // raw sums by category (applicable only)
    architecture: number
    runtime: number
    testing: number
    api: number
    semantics: number
  }
  breakdownMax: {
    structure: number
    architecture: number
    runtime: number
    testing: number
    api: number
    semantics: number
  }
  failures: EvaluatorFailure[]
  skippedEvaluators: string[]   // evaluators with maxScore = 0 (not applicable to this submission)
}

export function aggregate(results: EvaluatorResult[]): AggregateReport {
  const breakdown = { structure: 0, architecture: 0, runtime: 0, testing: 0, api: 0, semantics: 0 }
  const breakdownMax = { structure: 0, architecture: 0, runtime: 0, testing: 0, api: 0, semantics: 0 }

  let rawScore = 0
  let rawMax = 0
  const failures: EvaluatorFailure[] = []
  const skippedEvaluators: string[] = []

  for (const r of results) {
    failures.push(...r.failures)

    // maxScore === 0 is the convention for "not applicable to this submission".
    // Such evaluators contribute neither credit nor penalty — they're excluded
    // from normalization so the grade reflects only rules that actually apply.
    if (r.maxScore <= 0) {
      skippedEvaluators.push(r.name)
      continue
    }

    rawScore += r.score
    rawMax += r.maxScore

    const bucket: keyof typeof breakdown | null = (() => {
      if (r.name.includes('structure')) return 'structure'
      if (
        r.name.includes('layer')
        || r.name.includes('repository')
        || r.name.includes('checklist')
        || r.name.includes('task-queue')
        || r.name.includes('scheduler')
        || r.name.includes('cqrs')
        || r.name.includes('error-handling')
        || r.name.includes('module-di')
        || r.name.includes('import-graph')
        || r.name.includes('domain-event-outbox')
      ) return 'architecture'
      if (r.name.includes('test')) return 'testing'
      if (r.name.includes('controller') || r.name.includes('deprecated-api')) return 'api'
      if (r.name.includes('dto')) return 'semantics'
      return null
    })()

    if (bucket) {
      breakdown[bucket] += r.score
      breakdownMax[bucket] += r.maxScore
    }
  }

  const total = rawMax > 0 ? Math.round((rawScore / rawMax) * 100) : 0

  return { total, rawScore, rawMax, breakdown, breakdownMax, failures, skippedEvaluators }
}
