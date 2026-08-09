const knownErrors = new Set([
  'EXPECTED_ONE_OWNER_USER',
  'PLAN_REQUIRES_ALGORITHM_AND_FRONTEND',
  'PLAN_REQUIRES_TWO_EXERCISES',
  'NO_ALGORITHM_EXERCISE_AVAILABLE',
  'NO_FRONTEND_EXERCISE_AVAILABLE',
])

export function cronErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'UNEXPECTED_CRON_ERROR'

  const [message] = error.message.split(':', 1)
  if (knownErrors.has(message)) return message

  const databaseCode = (error as Error & { code?: unknown }).code
  if (typeof databaseCode === 'string' && /^[0-9A-Z]{5}$/.test(databaseCode)) return `DATABASE_ERROR_${databaseCode}`

  return 'UNEXPECTED_CRON_ERROR'
}
