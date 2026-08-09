import { describe, expect, it } from 'vitest'

import { cronErrorCode } from '@/app/api/cron/cron-error'

describe('cronErrorCode', () => {
  it('keeps expected operational errors safe for function logs', () => {
    expect(cronErrorCode(new Error('EXPECTED_ONE_OWNER_USER: received 0'))).toBe('EXPECTED_ONE_OWNER_USER')
    expect(cronErrorCode(new Error('PLAN_REQUIRES_ALGORITHM_AND_FRONTEND'))).toBe('PLAN_REQUIRES_ALGORITHM_AND_FRONTEND')
  })

  it('does not include unexpected error details in function logs', () => {
    expect(cronErrorCode(new Error('password=secret'))).toBe('UNEXPECTED_CRON_ERROR')
  })

  it('preserves a database error code without logging its message', () => {
    const error = Object.assign(new Error('column "active" does not exist'), { code: '42703' })
    expect(cronErrorCode(error)).toBe('DATABASE_ERROR_42703')
  })
})
