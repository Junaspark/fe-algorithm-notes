import { AgentJobSchema, AgentResultSchema, type AgentAdapter, type AgentJob, type AgentResult } from '@/domain/agents/contracts'

export class MockAgentAdapter implements AgentAdapter {
  private readonly results = new Map<string, AgentResult>()

  constructor(private readonly events: string[] = []) {}

  async dispatch(input: AgentJob) {
    const job = AgentJobSchema.parse(input)
    this.events.push('dispatch')
    if (this.results.has(job.id)) return
    const common = {
      schemaVersion: 'agent-job.v1' as const,
      jobId: job.id,
      idempotencyKey: job.idempotencyKey,
      status: 'succeeded' as const,
      jobType: job.jobType,
      completedAt: new Date(Math.min(Date.now(), new Date(job.deadline).getTime())).toISOString(),
      metadata: { adapter: 'mock', model: 'deterministic-v1', promptVersion: job.jobType === 'review-submission' ? 'review-v1' : 'selection-v1' },
    }
    const result = job.jobType === 'review-submission'
      ? { ...common, jobType: 'review-submission' as const, payload: { summary: `Deterministic review for ${job.context.exerciseId}`, strengths: ['Full authored test suite passed'], improvements: [], followUpQuestions: [] } }
      : { ...common, jobType: 'select-exercises' as const, payload: {
          algorithmExerciseId: job.context.candidates.find(candidate => candidate.kind === 'algorithm')?.id,
          frontendExerciseId: job.context.candidates.find(candidate => candidate.kind === 'frontend')?.id,
          rationale: 'Deterministic first eligible exercise of each kind',
        } }
    this.results.set(job.id, AgentResultSchema.parse(result))
  }

  async getResult(jobId: string) {
    return this.results.get(jobId) ?? null
  }

  async healthCheck() {
    return { healthy: true, adapter: 'mock', model: 'deterministic-v1', promptVersion: 'agent-job.v1' }
  }
}
