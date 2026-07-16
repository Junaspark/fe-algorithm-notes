import { describe } from 'vitest'
import { MockAgentAdapter } from '@/adapters/agents/mock-agent'
import { agentAdapterContract } from './adapter-contract'

describe('MockAgentAdapter contract', () => {
  agentAdapterContract(() => new MockAgentAdapter())
})
