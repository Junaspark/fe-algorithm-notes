import { describe, expect, it } from 'vitest'
import { AgentJobSchema, AgentResultSchema, MAX_AGENT_MESSAGE_BYTES } from '@/domain/agents/contracts'
import { reviewJob } from './fixtures'

describe('Agent contracts', () => {
  it('accepts the versioned review job and rejects unknown fields', () => {
    expect(AgentJobSchema.parse(reviewJob).schemaVersion).toBe('agent-job.v1')
    expect(() => AgentJobSchema.parse({ ...reviewJob, secret: 'nope' })).toThrow()
  })

  it('rejects unsanitized context and payloads larger than 64 KiB', () => {
    expect(() => AgentJobSchema.parse({ ...reviewJob, context: { ...reviewJob.context, accessToken: 'secret' } })).toThrow()
    expect(() => AgentJobSchema.parse({ ...reviewJob, context: { ...reviewJob.context, code: 'x'.repeat(MAX_AGENT_MESSAGE_BYTES) } })).toThrow()
  })

  it('uses strict discriminated structured result payloads', () => {
    const base = {
      schemaVersion: 'agent-job.v1',
      jobId: reviewJob.id,
      idempotencyKey: reviewJob.idempotencyKey,
      status: 'succeeded',
      completedAt: '2026-07-16T09:00:00.000Z',
      metadata: { adapter: 'mock', model: 'deterministic-v1', promptVersion: 'review-v1' },
    } as const
    expect(AgentResultSchema.parse({ ...base, jobType: 'review-submission', payload: { summary: 'Good', strengths: ['Tests pass'], improvements: [], followUpQuestions: [] } }).status).toBe('succeeded')
    expect(() => AgentResultSchema.parse({ ...base, jobType: 'review-submission', payload: { summary: 'Good', rawText: 'mutate mastery' } })).toThrow()
  })
})
