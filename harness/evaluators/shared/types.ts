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

export interface ScoreBreakdown {
  structure: number
  architecture: number
  runtime: number
  testing: number
  api: number
  semantics: number
}

export interface ScoreReport {
  taskId: string
  totalScore: number
  grade: string
  breakdown: ScoreBreakdown
  failures: EvaluatorFailure[]
}
