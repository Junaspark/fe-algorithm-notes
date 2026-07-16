import { describe, expect, it, vi } from 'vitest'

import { processNextGitSyncJob } from '@/scripts/process-git-sync'

describe('processNextGitSyncJob', () => {
  it('claims with worker ownership and succeeds only through the same lease', async () => {
    const jobs = {
      claim: vi.fn().mockResolvedValue({ id: 'job-1', userId: 'u', planId: 'p', attempt: 1, leaseToken: 'lease', expectedHeadSha: 'old' }),
      loadCompletedPlan: vi.fn().mockResolvedValue({ status: 'completed' }),
      recordCommit: vi.fn(),
      succeed: vi.fn(),
      retry: vi.fn(),
      fail: vi.fn(),
    }
    const repository = { commitToMain: vi.fn().mockResolvedValue({ commitSha: 'new', applied: true }) }
    const buildManifest = vi.fn().mockReturnValue({ localDate: '2026-07-16', files: [] })

    await expect(processNextGitSyncJob({ workerId: 'worker-a', jobs, repository, buildManifest, maxAttempts: 3 })).resolves.toBe(true)
    expect(jobs.claim).toHaveBeenCalledWith('worker-a', 3)
    expect(jobs.recordCommit).toHaveBeenCalledWith('job-1', 'worker-a', 'lease', 'new')
    expect(jobs.succeed).toHaveBeenCalledWith('job-1', 'worker-a', 'lease')
  })

  it('requeues retryable failures below the bound and permanently fails at the bound', async () => {
    const makeJobs = (attempt: number) => ({
      claim: vi.fn().mockResolvedValue({ id: 'job-1', userId: 'u', planId: 'p', attempt, leaseToken: 'lease', expectedHeadSha: 'old' }),
      loadCompletedPlan: vi.fn().mockResolvedValue({ status: 'completed' }),
      recordCommit: vi.fn(),
      succeed: vi.fn(),
      retry: vi.fn(),
      fail: vi.fn(),
    })
    const retryable = Object.assign(new Error('REMOTE_HEAD_CHANGED'), { retryable: true })
    const repository = { commitToMain: vi.fn().mockRejectedValue(retryable) }

    const jobs = makeJobs(2)
    await processNextGitSyncJob({ workerId: 'w', jobs, repository, buildManifest: vi.fn().mockReturnValue({ files: [] }), maxAttempts: 3 })
    expect(jobs.retry).toHaveBeenCalledWith('job-1', 'w', 'lease', 'REMOTE_HEAD_CHANGED')

    const lastJobs = makeJobs(3)
    await processNextGitSyncJob({ workerId: 'w', jobs: lastJobs, repository, buildManifest: vi.fn().mockReturnValue({ files: [] }), maxAttempts: 3 })
    expect(lastJobs.fail).toHaveBeenCalledWith('job-1', 'w', 'lease', 'REMOTE_HEAD_CHANGED', 3)
  })
})
