import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { ExportManifest } from '@/domain/git/export'

type ClaimedJob = {
  id: string
  userId: string
  planId: string
  attempt: number
  leaseToken: string
  expectedHeadSha: string
  commitSha?: string | null
}

export interface GitSyncJobStore {
  claim(workerId: string, maxAttempts: number): Promise<ClaimedJob | null>
  loadCompletedPlan(job: ClaimedJob): Promise<unknown>
  recordCommit(jobId: string, workerId: string, leaseToken: string, commitSha: string): Promise<void>
  succeed(jobId: string, workerId: string, leaseToken: string): Promise<void>
  retry(jobId: string, workerId: string, leaseToken: string, error: string): Promise<void>
  fail(jobId: string, workerId: string, leaseToken: string, error: string, maxAttempts: number): Promise<void>
}

export async function processNextGitSyncJob(options: {
  workerId: string
  maxAttempts: number
  jobs: GitSyncJobStore
  repository: { commitToMain(manifest: ExportManifest, expectedHeadSha: string, knownCommitSha?: string): Promise<{ commitSha: string }> }
  buildManifest(completedPlan: never): ExportManifest
}): Promise<boolean> {
  const job = await options.jobs.claim(options.workerId, options.maxAttempts)
  if (!job) return false
  try {
    const plan = await options.jobs.loadCompletedPlan(job)
    const manifest = options.buildManifest(plan as never)
    const result = await options.repository.commitToMain(manifest, job.expectedHeadSha, job.commitSha ?? undefined)
    await options.jobs.recordCommit(job.id, options.workerId, job.leaseToken, result.commitSha)
    await options.jobs.succeed(job.id, options.workerId, job.leaseToken)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GIT_SYNC_FAILED'
    const retryable = typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === true
    if (retryable && job.attempt < options.maxAttempts) await options.jobs.retry(job.id, options.workerId, job.leaseToken, message)
    else await options.jobs.fail(job.id, options.workerId, job.leaseToken, message, options.maxAttempts)
  }
  return true
}

export async function createDrizzleGitSyncJobStore() {
  const [{ db }, schema, { buildExportManifest }, { GitHubRepository }, { Octokit }] = await Promise.all([
    import('@/db/client'),
    import('@/db/schema'),
    import('@/domain/git/export'),
    import('@/adapters/github/repository'),
    import('@octokit/rest'),
  ])
  const owner = requiredEnv('GITHUB_REPOSITORY_OWNER')
  const repo = requiredEnv('GITHUB_REPOSITORY_NAME')
  const github = new Octokit({ auth: requiredEnv('GITHUB_SYNC_TOKEN') })

  const jobs: GitSyncJobStore = {
    claim: (workerId, maxAttempts) => db.transaction(async tx => {
      const [candidate] = await tx.select().from(schema.gitSyncJobs)
        .where(and(inArray(schema.gitSyncJobs.status, ['queued', 'failed']), sql`${schema.gitSyncJobs.attempt} <= ${maxAttempts}`))
        .orderBy(asc(schema.gitSyncJobs.createdAt)).for('update', { skipLocked: true }).limit(1)
      if (!candidate || (candidate.status === 'failed' && candidate.attempt >= maxAttempts)) return null
      const leaseToken = crypto.randomUUID()
      let expectedHeadSha = candidate.expectedHeadSha
      if (!expectedHeadSha) {
        const head = await github.git.getRef({ owner, repo, ref: 'heads/main' })
        expectedHeadSha = head.data.object.sha
      }
      const [claimed] = await tx.update(schema.gitSyncJobs).set({
        status: 'running', workerId, leaseToken, expectedHeadSha, error: null, updatedAt: new Date(),
      }).where(eq(schema.gitSyncJobs.id, candidate.id)).returning()
      return { ...claimed, expectedHeadSha: expectedHeadSha!, leaseToken }
    }),
    loadCompletedPlan: async job => {
      const [plan] = await db.select().from(schema.dailyPlans).where(and(eq(schema.dailyPlans.id, job.planId), eq(schema.dailyPlans.userId, job.userId), eq(schema.dailyPlans.status, 'completed'))).limit(1)
      if (!plan) throw new Error('COMPLETED_PLAN_REQUIRED')
      const rows = await db.select({ item: schema.planItems, exercise: schema.exercises, submission: schema.submissions })
        .from(schema.planItems)
        .innerJoin(schema.exercises, eq(schema.exercises.id, schema.planItems.exerciseId))
        .innerJoin(schema.submissions, eq(schema.submissions.id, schema.planItems.submissionId))
        .where(and(eq(schema.planItems.planId, plan.id), eq(schema.submissions.userId, job.userId), eq(schema.submissions.status, 'passed')))
        .orderBy(asc(schema.planItems.position))
      return {
        ...plan,
        items: rows.map(({ item, exercise, submission }) => ({
          position: item.position,
          exercise: exercise.content,
          submission: { code: submission.code, testResult: submission.testResult },
        })),
      }
    },
    recordCommit: async (id, workerId, leaseToken, commitSha) => {
      const rows = await db.update(schema.gitSyncJobs).set({ commitSha, updatedAt: new Date() })
        .where(and(eq(schema.gitSyncJobs.id, id), eq(schema.gitSyncJobs.status, 'running'), eq(schema.gitSyncJobs.workerId, workerId), eq(schema.gitSyncJobs.leaseToken, leaseToken))).returning()
      if (rows.length !== 1) throw new Error('GIT_SYNC_LEASE_LOST')
    },
    succeed: async (id, workerId, leaseToken) => transition(id, workerId, leaseToken, { status: 'succeeded', workerId: null, leaseToken: null, error: null }),
    retry: async (id, workerId, leaseToken, error) => transition(id, workerId, leaseToken, { status: 'failed', attempt: sql`${schema.gitSyncJobs.attempt} + 1`, workerId: null, leaseToken: null, error }),
    fail: async (id, workerId, leaseToken, error, maxAttempts) => transition(id, workerId, leaseToken, { status: 'failed', attempt: maxAttempts, workerId: null, leaseToken: null, error }),
  }

  async function transition(id: string, workerId: string, leaseToken: string, values: Record<string, unknown>) {
    const rows = await db.update(schema.gitSyncJobs).set({ ...values, updatedAt: new Date() })
      .where(and(eq(schema.gitSyncJobs.id, id), eq(schema.gitSyncJobs.status, 'running'), eq(schema.gitSyncJobs.workerId, workerId), eq(schema.gitSyncJobs.leaseToken, leaseToken))).returning()
    if (rows.length !== 1) throw new Error('GIT_SYNC_LEASE_LOST')
  }

  return { jobs, repository: new GitHubRepository({ github, owner, repo }), buildManifest: buildExportManifest }
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_${name}`)
  return value
}

if (process.argv[1]?.endsWith('process-git-sync.ts')) {
  const runtime = await createDrizzleGitSyncJobStore()
  await processNextGitSyncJob({ workerId: `git-sync-${process.pid}`, maxAttempts: 3, ...runtime })
}
