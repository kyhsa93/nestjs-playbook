import { QueryFailedError } from 'typeorm'

// Postgres unique_violation = SQLSTATE 23505
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError
    && (error.driverError as { code?: string } | undefined)?.code === '23505'
  )
}
