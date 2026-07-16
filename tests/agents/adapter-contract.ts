import { expect, it } from 'vitest'
import { AgentResultSchema, type AgentAdapter, type AgentJob } from '@/domain/agents/contracts'
import { reviewJob } from './fixtures'

export function agentAdapterContract(makeAdapter: () => AgentAdapter) {
  it('is idempotent and returns schema-valid results', async () => {
    const adapter = makeAdapter()
    await adapter.dispatch(reviewJob)
    await adapter.dispatch(reviewJob)
    const result = await adapter.getResult(reviewJob.id)
    expect(AgentResultSchema.parse(result).jobId).toBe(reviewJob.id)
  })

  it('rejects invalid jobs at the adapter boundary', async () => {
    const adapter = makeAdapter()
    await expect(adapter.dispatch({ ...reviewJob, unexpected: true } as unknown as AgentJob)).rejects.toThrow()
  })

  it('reports provider, model and prompt versions', async () => {
    const metadata = await makeAdapter().healthCheck()
    expect(metadata).toMatchObject({
      healthy: true,
      adapter: expect.any(String),
      model: expect.any(String),
      promptVersion: expect.any(String),
    })
  })
}
