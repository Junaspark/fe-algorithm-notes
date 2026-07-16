import { AgentJobSchema, AgentResultSchema, type AgentAdapter, type AgentJob, type AgentResult } from './contracts'

export type StoredAgentJob = { job: AgentJob; status: 'queued' | 'running' | 'retryable' | 'succeeded' | 'failed'; result?: AgentResult }

export interface AgentJobRepository {
  persist(job: AgentJob): Promise<StoredAgentJob>
  get(id: string): Promise<StoredAgentJob | null>
  saveResult(id: string, result: AgentResult): Promise<StoredAgentJob>
  markRetryable(id: string, nextAttempt: number, result: AgentResult): Promise<StoredAgentJob>
  pending?(limit: number): Promise<AgentJob[]>
}

export class InMemoryAgentJobRepository implements AgentJobRepository {
  private readonly jobs = new Map<string, StoredAgentJob>()
  constructor(private readonly events: string[] = []) {}

  async persist(job: AgentJob) {
    this.events.push('persist')
    const existing = this.jobs.get(job.id)
    if (existing) return existing
    const stored: StoredAgentJob = { job: AgentJobSchema.parse(job), status: 'queued' }
    this.jobs.set(job.id, stored)
    return stored
  }

  async get(id: string) { return this.jobs.get(id) ?? null }
  async pending(limit: number) {
    return [...this.jobs.values()].filter(item => item.status === 'queued' || item.status === 'retryable').slice(0, limit).map(item => item.job)
  }

  async saveResult(id: string, input: AgentResult) {
    const current = this.jobs.get(id)
    if (!current) throw new Error('AGENT_JOB_NOT_FOUND')
    if (current.result?.status === 'succeeded') return current
    const result = AgentResultSchema.parse(input)
    const stored: StoredAgentJob = { ...current, status: result.status === 'succeeded' ? 'succeeded' : 'retryable', result }
    this.jobs.set(id, stored)
    return stored
  }

  async markRetryable(id: string, nextAttempt: number, result: AgentResult) {
    const current = this.jobs.get(id)
    if (!current) throw new Error('AGENT_JOB_NOT_FOUND')
    const stored: StoredAgentJob = { job: AgentJobSchema.parse({ ...current.job, attempt: nextAttempt }), status: 'retryable', result: AgentResultSchema.parse(result) }
    this.jobs.set(id, stored)
    return stored
  }
}

function fallback(job: AgentJob, completedAt: string): AgentResult {
  const common = {
    schemaVersion: 'agent-job.v1' as const, jobId: job.id, idempotencyKey: job.idempotencyKey,
    status: 'succeeded' as const, completedAt,
    metadata: { adapter: 'deterministic-fallback', model: 'rules-v1', promptVersion: 'fallback-v1' },
  }
  return AgentResultSchema.parse(job.jobType === 'review-submission'
    ? { ...common, jobType: 'review-submission', payload: { summary: 'Submission passed the complete deterministic test suite.', strengths: ['All authored tests passed'], improvements: [], followUpQuestions: [] } }
    : { ...common, jobType: 'select-exercises', payload: {
        algorithmExerciseId: job.context.candidates.find(candidate => candidate.kind === 'algorithm')?.id,
        frontendExerciseId: job.context.candidates.find(candidate => candidate.kind === 'frontend')?.id,
        rationale: 'Selected deterministically because the Agent was unavailable.',
      } })
}

export function createAgentOrchestrator(options: { repository: AgentJobRepository; adapter: AgentAdapter; now?: () => Date }) {
  const now = options.now ?? (() => new Date())
  return {
    async run(input: AgentJob): Promise<AgentResult> {
      const job = AgentJobSchema.parse(input)
      const existing = await options.repository.persist(job)
      if (existing.result?.status === 'succeeded') return existing.result
      if (now().getTime() > new Date(job.deadline).getTime()) {
        if (job.attempt >= job.maxAttempts) {
          const result = fallback(job, now().toISOString())
          await options.repository.saveResult(job.id, result)
          return result
        }
        const metadata = await options.adapter.healthCheck()
        const result = AgentResultSchema.parse({
          schemaVersion: 'agent-job.v1', jobId: job.id, idempotencyKey: job.idempotencyKey, jobType: job.jobType,
          status: 'retryable', completedAt: now().toISOString(),
          metadata: { adapter: metadata.adapter, model: metadata.model, promptVersion: metadata.promptVersion },
          error: { code: 'timeout', message: 'Agent job deadline elapsed' },
        })
        await options.repository.markRetryable(job.id, job.attempt + 1, result)
        return result
      }
      await options.adapter.dispatch(job)
      const result = await options.adapter.getResult(job.id)
      if (!result) {
        const metadata = await options.adapter.healthCheck()
        return AgentResultSchema.parse({
          schemaVersion: 'agent-job.v1', jobId: job.id, idempotencyKey: job.idempotencyKey, jobType: job.jobType,
          status: 'retryable', completedAt: now().toISOString(),
          metadata: { adapter: metadata.adapter, model: metadata.model, promptVersion: metadata.promptVersion },
          error: { code: 'temporary_failure', message: 'Agent result is not ready' },
        })
      }
      const valid = AgentResultSchema.parse(result)
      if (valid.jobId !== job.id || valid.idempotencyKey !== job.idempotencyKey || valid.jobType !== job.jobType) throw new Error('AGENT_RESULT_MISMATCH')
      await options.repository.saveResult(job.id, valid)
      return valid
    },
  }
}
