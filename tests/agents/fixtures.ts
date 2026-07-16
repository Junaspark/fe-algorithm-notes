import type { AgentJob } from '@/domain/agents/contracts'

export const reviewJob: AgentJob = {
  schemaVersion: 'agent-job.v1',
  id: '11111111-1111-4111-8111-111111111111',
  jobType: 'review-submission',
  userId: '22222222-2222-4222-8222-222222222222',
  planId: '33333333-3333-4333-8333-333333333333',
  submissionId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'review:44444444-4444-4444-8444-444444444444',
  attempt: 1,
  maxAttempts: 3,
  deadline: '2026-07-16T10:00:00.000Z',
  context: {
    exerciseId: 'promise-all',
    exerciseKind: 'frontend',
    code: 'export function promiseAll() {}',
    testSummary: { passed: 4, failed: 0 },
  },
}
