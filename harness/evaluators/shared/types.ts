export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface EvaluatorFailure {
  ruleId: string
  severity: Severity
  message: string
  /**
   * Optional relative path (with optional anchor) to the relevant guide doc.
   * When present, the CLI renders it alongside the message so a reviewer can
   * jump to the explanation that drove the rule. Example:
   *   'docs/architecture/scheduling.md#taskcontroller--taskconsumer-메서드로-command-실행-interface-레이어'
   */
  docRef?: string
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
