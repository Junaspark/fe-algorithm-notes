import { describe, expect, it } from 'vitest'

import { NotificationOutboxAdapter } from '@/adapters/notifications/outbox'

const reminder = { kind: 'morning' as const, userId: 'user-1', planId: 'plan-1', remainingCount: 1, exerciseIds: ['alg'] }

describe('request notification outbox', () => {
  it('returns one structured notification command without process-lifetime state', async () => {
    const outbox = new NotificationOutboxAdapter()
    await outbox.send(reminder)
    expect(outbox.take()).toEqual(reminder)
    expect(outbox.take()).toBeNull()
  })

  it('rejects more than one pending notification command', async () => {
    const outbox = new NotificationOutboxAdapter()
    await outbox.send(reminder)
    await expect(outbox.send(reminder)).rejects.toThrow('NOTIFICATION_OUTBOX_FULL')
  })
})
