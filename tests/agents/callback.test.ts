import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST, setAgentCallbackStoreForTests } from '@/app/api/agent/jobs/[id]/result/route'
import { GET } from '@/app/api/agent/jobs/route'
import { InMemoryAgentJobRepository } from '@/domain/agents/orchestrator'
import { reviewJob } from './fixtures'

let repository: InMemoryAgentJobRepository
const body = JSON.stringify({
  schemaVersion: 'agent-job.v1',
  jobId: reviewJob.id,
  idempotencyKey: reviewJob.idempotencyKey,
  jobType: 'review-submission',
  status: 'succeeded',
  completedAt: '2026-07-16T09:00:00.000Z',
  metadata: { adapter: 'codex-bridge', model: 'codex', promptVersion: 'review-v1' },
  payload: { summary: 'Good', strengths: [], improvements: [], followUpQuestions: [] },
})

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
    const signature = createHmac('sha256', 'test-secret').update(body).digest('hex')
    const makeRequest = () => new Request(`http://local/api/agent/jobs/${reviewJob.id}/result`, { method: 'POST', body, headers: { 'x-agent-signature': `sha256=${signature}` } })
    expect((await POST(makeRequest(), { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(202)
    expect((await POST(makeRequest(), { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(202)
  })

  it('exposes queued jobs only through the authenticated fetch boundary', async () => {
    expect((await GET(new Request('http://local/api/agent/jobs'))).status).toBe(401)
    const response = await GET(new Request('http://local/api/agent/jobs', { headers: { 'x-agent-bridge-secret': 'test-secret' } }))
    expect(response.status).toBe(200)
    expect((await response.json()).jobs).toEqual([reviewJob])
  })

  it('rejects invalid signatures, mismatched job data, and expired jobs', async () => {
    const badAuth = new Request('http://local', { method: 'POST', body, headers: { 'x-agent-signature': 'sha256=bad' } })
    expect((await POST(badAuth, { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(401)

    vi.setSystemTime(new Date('2026-07-16T10:00:01Z'))
    const signature = createHmac('sha256', 'test-secret').update(body).digest('hex')
    const expired = new Request('http://local', { method: 'POST', body, headers: { 'x-agent-signature': `sha256=${signature}` } })
    expect((await POST(expired, { params: Promise.resolve({ id: reviewJob.id }) })).status).toBe(410)
  })
})
