import { describe, expect, it, vi } from 'vitest'

import { flushDraftOperations, type QueuedDraft } from '@/components/practice/offline-drafts'

const draft = (operationId: string, code = operationId): QueuedDraft => ({
  key: 'owner:debounce', operationId, exerciseId: 'debounce', code, expectedVersion: 1,
})

describe('offline draft queue', () => {
  it('does not remove a newer operation queued while the older operation is in flight', async () => {
    const older = draft('older')
    const newer = draft('newer')
    let current = older
    const send = vi.fn(async () => { current = newer; return { kind: 'saved' as const, version: 2 } })
    const removeIfCurrent = vi.fn(async (operation: QueuedDraft) => current.operationId === operation.operationId)

    await flushDraftOperations([older], send, removeIfCurrent)

    expect(removeIfCurrent).toHaveBeenCalledWith(older)
    expect(current).toBe(newer)
  })

  it('keeps conflict operations queued for explicit recovery', async () => {
    const operation = draft('conflict')
    const removeIfCurrent = vi.fn()
    await flushDraftOperations([operation], async () => ({ kind: 'conflict', serverVersion: 4, localVersion: 1 }), removeIfCurrent)
    expect(removeIfCurrent).not.toHaveBeenCalled()
  })
})
