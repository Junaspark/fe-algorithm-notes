import type { AgentJobRepository } from '@/domain/agents/orchestrator'

let testRepository: AgentJobRepository | undefined

export function setAgentJobStoreForTests(repository?: AgentJobRepository) {
  testRepository = repository
}

export async function getAgentJobStore() {
  if (testRepository) return testRepository
  const [{ db }, { DrizzleAgentJobRepository }] = await Promise.all([
    import('@/db/client'),
    import('@/adapters/agents/codex-bridge'),
  ])
  return new DrizzleAgentJobRepository(db)
}
