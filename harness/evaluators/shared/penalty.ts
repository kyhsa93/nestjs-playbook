// Central severity → penalty mapping.
//
// Evaluators use this instead of ad-hoc hardcoded numbers so that the ratio
// between severities stays consistent across the harness. Each evaluator can
// scale the base penalty by its own weight via `penaltyFor(severity, weight)`.
//
// Guideline:
//   critical × weight   — fundamental rule violation
//   high     × weight   — architecturally significant
//   medium   × weight   — convention or clarity
//   low      × weight   — informational
//
// Default weight 1.0 matches what most evaluators already use. An evaluator
// with higher maxScore (e.g. checklist at 100) can pass weight=2 to scale
// penalties accordingly.
//
// Migration: existing evaluators still hardcode penalty numbers that roughly
// match this mapping. New evaluators should use penaltyFor(); legacy ones
// can migrate when touched without changing rule IDs (regression tests key on
// ruleIds, not scores, so centralizing later is low-risk).

import type { Severity } from './types'

export const BASE_PENALTY: Record<Severity, number> = {
  critical: 6,
  high: 4,
  medium: 2,
  low: 1
}

export function penaltyFor(severity: Severity, weight = 1): number {
  return BASE_PENALTY[severity] * weight
}
