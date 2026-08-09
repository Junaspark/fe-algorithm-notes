import { AgentJobSchema, AgentResultSchema, type AgentAdapter, type AgentJob, type AgentResult } from './contracts'

export type JobStatus = 'queued' | 'running' | 'retryable' | 'succeeded' | 'failed' | 'dead'
export type StoredAgentJob = { job: AgentJob; status: JobStatus; result?: AgentResult; workerId?: string; leaseToken?: string; leaseUntil?: Date }
export type AgentClaim = { job: AgentJob; workerId: string; leaseToken: string; leaseUntil: string }
export type CompleteExpectation = { statuses: JobStatus[]; attempt: number; leaseToken?: string; now?: Date }
export type CompleteOutcome = { kind: 'stored' | 'replay' | 'conflict' | 'lost'; stored: StoredAgentJob }
const immutableJob = (job: AgentJob) => {
  const { attempt: _attempt, ...immutable } = job
  void _attempt
  return immutable
}

export interface AgentJobRepository {
  persist(job: AgentJob): Promise<StoredAgentJob>
  get(id: string): Promise<StoredAgentJob | null>
  complete(id: string, result: AgentResult, expected: CompleteExpectation): Promise<CompleteOutcome>
  markRetryable(id: string, nextAttempt: number, result: AgentResult, expectedAttempt: number): Promise<StoredAgentJob>
  claim(limit: number, workerId: string, now: Date, leaseMs: number): Promise<AgentClaim[]>
}

export class InMemoryAgentJobRepository implements AgentJobRepository {
  private readonly jobs = new Map<string, StoredAgentJob>()
  constructor(private readonly events: string[] = []) {}

  async persist(job: AgentJob) {
    this.events.push('persist')
    const existing = this.jobs.get(job.id)
    if (existing) {
      if (JSON.stringify(immutableJob(existing.job)) !== JSON.stringify(immutableJob(AgentJobSchema.parse(job)))) throw new Error('AGENT_JOB_IMMUTABLE_MISMATCH')
      return existing
    }
    const stored: StoredAgentJob = { job: AgentJobSchema.parse(job), status: 'queued' }
    this.jobs.set(job.id, stored)
    return stored
  }

  async get(id: string) { return this.jobs.get(id) ?? null }
  async claim(limit: number, workerId: string, now: Date, leaseMs: number) {
    const claims: AgentClaim[] = []
    for (const [id, item] of this.jobs) {
      if (claims.length >= limit) break
      if (item.status !== 'queued' && !(item.status === 'running' && item.leaseUntil && item.leaseUntil <= now)) continue
      const leaseToken = crypto.randomUUID()
      const leaseUntil = new Date(now.getTime() + leaseMs)
      const stored = { ...item, status: 'running' as const, workerId, leaseToken, leaseUntil }
      this.jobs.set(id, stored)
      claims.push({ job: stored.job, workerId, leaseToken, leaseUntil: leaseUntil.toISOString() })
    }
    return claims
  }

  async complete(id: string, input: AgentResult, expected: CompleteExpectation): Promise<CompleteOutcome> {
    const current = this.jobs.get(id)
    if (!current) throw new Error('AGENT_JOB_NOT_FOUND')
    const result = AgentResultSchema.parse(input)
    if (current.status === 'succeeded' && current.result) {
      return { kind: JSON.stringify(current.result) === JSON.stringify(result) ? 'replay' : 'conflict', stored: current }
    }
    if (!expected.statuses.includes(current.status) || current.job.attempt !== expected.attempt || (expected.leaseToken && (current.leaseToken !== expected.leaseToken || !current.leaseUntil || !expected.now || current.leaseUntil <= expected.now))) return { kind: 'lost', stored: current }
    const stored: StoredAgentJob = { ...current, status: result.status === 'succeeded' ? 'succeeded' : 'retryable', result }
    this.jobs.set(id, stored)
    return { kind: 'stored', stored }
  }

  async markRetryable(id: string, nextAttempt: number, result: AgentResult, expectedAttempt: number) {
    const current = this.jobs.get(id)
    if (!current) throw new Error('AGENT_JOB_NOT_FOUND')
    if (current.job.attempt !== expectedAttempt || current.status === 'succeeded') return current
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
      const requested = AgentJobSchema.parse(input)
      const existing = await options.repository.persist(requested)
      const job = existing.job
      if (existing.result?.status === 'succeeded') return existing.result
      if (now().getTime() > new Date(job.deadline).getTime()) {
        if (job.attempt >= job.maxAttempts) {
          const result = fallback(job, now().toISOString())
          const outcome = await options.repository.complete(job.id, result, { statuses: ['queued', 'retryable', 'running'], attempt: job.attempt })
          return outcome.stored.result ?? result
        }
        const metadata = await options.adapter.healthCheck()
        const result = AgentResultSchema.parse({
          schemaVersion: 'agent-job.v1', jobId: job.id, idempotencyKey: job.idempotencyKey, jobType: job.jobType,
          status: 'retryable', completedAt: now().toISOString(),
          metadata: { adapter: metadata.adapter, model: metadata.model, promptVersion: metadata.promptVersion },
          error: { code: 'timeout', message: 'Agent job deadline elapsed' },
        })
        const stored = await options.repository.markRetryable(job.id, job.attempt + 1, result, job.attempt)
        return stored.result ?? result
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
      const outcome = await options.repository.complete(job.id, valid, { statuses: ['queued', 'retryable', 'running'], attempt: job.attempt })
      return outcome.stored.result ?? valid
    },
  }
}
