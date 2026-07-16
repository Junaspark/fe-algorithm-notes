import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST, setAgentCallbackStoreForTests } from '@/app/api/agent/jobs/[id]/result/route'
import { GET } from '@/app/api/agent/jobs/route'
import { InMemoryAgentJobRepository } from '@/domain/agents/orchestrator'
import { reviewJob } from './fixtures'

let repository: InMemoryAgentJobRepository
const result = {
  schemaVersion: 'agent-job.v1' as const, jobId: reviewJob.id, idempotencyKey: reviewJob.idempotencyKey,
  jobType: 'review-submission' as const, status: 'succeeded' as const, completedAt: '2026-07-16T09:00:00.000Z',
  metadata: { adapter: 'codex-bridge', model: 'codex', promptVersion: 'review-v1' },
  payload: { summary: 'Good', strengths: [], improvements: [], followUpQuestions: [] },
}

describe('agent result callback', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T09:00:00Z'))
    process.env.AGENT_BRIDGE_SECRET = 'test-secret'
    repository = new InMemoryAgentJobRepository()
    setAgentCallbackStoreForTests(repository)
    await repository.persist(reviewJob)
  })

  it('authenticates the exact body and stores an idempotent valid result', async () => {
    const [claim] = await repository.claim(1, 'worker-1', new Date('2026-07-16T09:00:00Z'), 60_000)
    const body = JSON.stringify({ leaseToken: claim.leaseToken, attempt: claim.job.attempt, result })
    const signature = createHmac('sha256', 'test-secret').update(body).digest('hex')
    const makeRequest = () => new Request(`http://local/api/agent/jobs/${reviewJob.id}/result`, { method: 'POST', body, headers: { 'x-agent-signature': `sha256=${signature}` } })
    expect((await POST(makeRequest(), { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(202)
    expect((await POST(makeRequest(), { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(202)
  })

  it('exposes queued jobs only through the authenticated fetch boundary', async () => {
    expect((await GET(new Request('http://local/api/agent/jobs'))).status).toBe(401)
    const response = await GET(new Request('http://local/api/agent/jobs', { headers: { 'x-agent-bridge-secret': 'test-secret' } }))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.jobs).toHaveLength(1)
    expect(payload.jobs[0]).toMatchObject({ job: reviewJob, workerId: expect.any(String), leaseToken: expect.any(String) })
    const second = await GET(new Request('http://local/api/agent/jobs', { headers: { 'x-agent-bridge-secret': 'test-secret' } }))
    expect((await second.json()).jobs).toEqual([])
  })

  it('rejects invalid signatures, mismatched job data, and expired jobs', async () => {
    const [claim] = await repository.claim(1, 'worker-1', new Date('2026-07-16T09:00:00Z'), 60_000)
    const body = JSON.stringify({ leaseToken: claim.leaseToken, attempt: claim.job.attempt, result })
    const badAuth = new Request('http://local', { method: 'POST', body, headers: { 'x-agent-signature': 'sha256=bad' } })
    expect((await POST(badAuth, { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(401)

    vi.setSystemTime(new Date('2026-07-16T10:00:01Z'))
    const signature = createHmac('sha256', 'test-secret').update(body).digest('hex')
    const expired = new Request('http://local', { method: 'POST', body, headers: { 'x-agent-signature': `sha256=${signature}` } })
    expect((await POST(expired, { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(410)
  })

  it('rejects stale claims and conflicting terminal replays', async () => {
    const [claim] = await repository.claim(1, 'worker-1', new Date('2026-07-16T09:00:00Z'), 60_000)
    const post = async (value: unknown) => {
      const body = JSON.stringify(value)
      const signature = createHmac('sha256', 'test-secret').update(body).digest('hex')
      return POST(new Request('http://local', { method: 'POST', body, headers: { 'x-agent-signature': `sha256=${signature}` } }), { params: Promise.resolve({ id: reviewJob.id }) })
    }
    expect((await post({ leaseToken: '00000000-0000-4000-8000-000000000099', attempt: 1, result })).status).toBe(409)
    expect((await post({ leaseToken: claim.leaseToken, attempt: 1, result })).status).toBe(202)
    expect((await post({ leaseToken: claim.leaseToken, attempt: 1, result })).status).toBe(202)
    expect((await post({ leaseToken: claim.leaseToken, attempt: 1, result: { ...result, payload: { ...result.payload, summary: 'Different' } } })).status).toBe(409)
  })

  it('rejects a matching callback after its lease expires before the job deadline', async () => {
    const [claim] = await repository.claim(1, 'worker-1', new Date('2026-07-16T09:00:00Z'), 1_000)
    vi.setSystemTime(new Date('2026-07-16T09:00:02Z'))
    const payload = { leaseToken: claim.leaseToken, attempt: claim.job.attempt, result }
    const body = JSON.stringify(payload)
    const signature = createHmac('sha256', 'test-secret').update(body).digest('hex')
    const response = await POST(new Request('http://local', { method: 'POST', body, headers: { 'x-agent-signature': `sha256=${signature}` } }), { params: Promise.resolve({ id: reviewJob.id }) })
    expect(response.status).toBe(409)
    expect((await repository.get(reviewJob.id))?.status).toBe('running')
  })
})
