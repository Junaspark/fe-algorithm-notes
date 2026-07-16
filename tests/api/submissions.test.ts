import { describe, expect, it, vi } from 'vitest'

import { createSubmissionRoute } from '@/app/api/submissions/route'

const valid = {
  exerciseId: 'debounce', code: 'function debounce() {}', complexityAnswer: 'O(1)', elapsedSeconds: 90,
  evidence: { scope: 'full' as const, requestId: 'run-1', tests: [{ name: 'public', status: 'passed' as const }, { name: 'hidden', status: 'passed' as const }] },
}
const request = (body: unknown) => new Request('http://localhost/api/submissions', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/submissions', () => {
  it('does not complete from partial or failed evidence', async () => {
    const submit = vi.fn()
    const route = createSubmissionRoute({ authenticate: vi.fn().mockResolvedValue({ user: { id: 'owner' } }), submit })
    const response = await route(request({ ...valid, evidence: { ...valid.evidence, scope: 'public' } }))
    expect(response.status).toBe(422)
    expect(submit).not.toHaveBeenCalled()
  })

  it('passes authenticated full-run evidence to the persistence boundary', async () => {
    const submit = vi.fn().mockResolvedValue({ submissionId: 'sub-1', completed: true, planCompleted: false })
    const route = createSubmissionRoute({ authenticate: vi.fn().mockResolvedValue({ user: { id: 'owner' } }), submit })
    const response = await route(request(valid))
    expect(response.status).toBe(201)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', exerciseId: 'debounce', evidence: valid.evidence }))
    expect(await response.json()).toEqual({ submissionId: 'sub-1', completed: true, planCompleted: false })
  })

  it('rejects malformed submissions', async () => {
    const route = createSubmissionRoute({ authenticate: vi.fn().mockResolvedValue({ user: { id: 'owner' } }), submit: vi.fn() })
    expect((await route(request({ ...valid, elapsedSeconds: -1 }))).status).toBe(400)
  })

  it('rejects code too large for a complete review envelope before persistence', async () => {
    const submit = vi.fn()
    const route = createSubmissionRoute({ authenticate: vi.fn().mockResolvedValue({ user: { id: 'owner' } }), submit })
    const response = await route(request({ ...valid, code: 'x'.repeat(49 * 1024) }))
    expect(response.status).toBe(413)
    expect(submit).not.toHaveBeenCalled()
  })
})
