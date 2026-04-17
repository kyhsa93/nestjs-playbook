export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface EvaluatorFailure {
  ruleId: string
  severity: Severity
  message: string
}

export interface EvaluatorResult {
  name: string
  score: number
  maxScore: number
  failures: EvaluatorFailure[]
}
