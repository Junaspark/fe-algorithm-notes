import { describe, expect, it, vi } from 'vitest'

import { createReminderService } from '@/domain/reminders/service'

describe('evening reminder', () => {
  it('notifies only remaining items of an active plan', async () => {
    const plan = { id: 'plan-1', items: [{ status: 'pending' }, { status: 'completed' }] }
    const plans = { findActive: vi.fn().mockResolvedValue(plan) }
    const notifications = { send: vi.fn() }
    const service = createReminderService({ userId: 'user-1', plans, notifications })
    await expect(service.runEveningCheck(new Date('2026-07-16T12:00:00Z'))).resolves.toEqual({ planId: 'plan-1', created: false, remainingCount: 1 })
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'evening', remainingCount: 1 }))
  })

  it('does nothing when no active plan remains', async () => {
    const plans = { findActive: vi.fn().mockResolvedValue(null) }
    const notifications = { send: vi.fn() }
    const service = createReminderService({ userId: 'user-1', plans, notifications })
    await expect(service.runEveningCheck(new Date())).resolves.toEqual({ planId: null, created: false, remainingCount: 0 })
    expect(notifications.send).not.toHaveBeenCalled()
  })
})
