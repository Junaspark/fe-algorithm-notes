import { describe, expect, it } from 'vitest'
import { createAgentOrchestrator, InMemoryAgentJobRepository } from '@/domain/agents/orchestrator'
import type { AgentAdapter } from '@/domain/agents/contracts'
import { MockAgentAdapter } from '@/adapters/agents/mock-agent'
import { reviewJob } from './fixtures'

describe('agent orchestrator', () => {
  it('persists before dispatch and stores validated result metadata', async () => {
    const events: string[] = []
    const repository = new InMemoryAgentJobRepository(events)
    const adapter = new MockAgentAdapter(events)
    const orchestrator = createAgentOrchestrator({ repository, adapter, now: () => new Date('2026-07-16T09:00:00Z') })
    const result = await orchestrator.run(reviewJob)
    expect(events.slice(0, 2)).toEqual(['persist', 'dispatch'])
    expect(result.metadata).toEqual({ adapter: 'mock', model: 'deterministic-v1', promptVersion: 'review-v1' })
    expect((await repository.get(reviewJob.id))?.status).toBe('succeeded')
  })

  it('marks a timeout retryable, increments attempts, then falls back deterministically', async () => {
    const repository = new InMemoryAgentJobRepository()
    const timeoutAdapter: AgentAdapter = {
      dispatch: async () => undefined,
      getResult: async () => null,
      healthCheck: async () => ({ healthy: true, adapter: 'slow', model: 'slow-v1', promptVersion: 'review-v1' }),
    }
    const orchestrator = createAgentOrchestrator({ repository, adapter: timeoutAdapter, now: () => new Date('2026-07-16T10:00:01Z') })
    const retryable = await orchestrator.run(reviewJob)
    expect(retryable.status).toBe('retryable')
    expect((await repository.get(reviewJob.id))?.job.attempt).toBe(2)

    await orchestrator.run({ ...reviewJob, attempt: 3 })
    const stored = await repository.get(reviewJob.id)
    expect(stored?.status).toBe('succeeded')
    expect(stored?.result?.metadata.adapter).toBe('deterministic-fallback')
    expect(stored?.result?.jobType).toBe('review-submission')
  })

  it('never exposes raw agent text as mastery or Git export commands', async () => {
    const result = await createAgentOrchestrator({
      repository: new InMemoryAgentJobRepository(),
      adapter: new MockAgentAdapter(),
      now: () => new Date('2026-07-16T09:00:00Z'),
    }).run(reviewJob)
    expect(JSON.stringify(result)).not.toMatch(/mastery|gitExport|rawText/)
  })
})
