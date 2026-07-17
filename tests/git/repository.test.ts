import { describe, expect, it, vi } from 'vitest'

import { GitHubRepository } from '@/adapters/github/repository'
import type { ExportManifest } from '@/domain/git/export'

const manifest: ExportManifest = {
  localDate: '2026-07-16',
  files: [
    { path: 'solutions/2026-07-16/a.js', content: 'export const a = 1\n' },
    { path: 'reports/2026-07-16.md', content: '# 2026-07-16\n' },
  ],
}

const githubMock = () => ({
  git: {
    getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'recorded-old' } } }),
    getCommit: vi.fn().mockResolvedValue({ data: { sha: 'recorded-old', message: 'old', tree: { sha: 'tree-old' }, parents: [] } }),
    getTree: vi.fn().mockResolvedValue({ data: { sha: 'tree-old', tree: [] } }),
    createBlob: vi.fn()
      .mockResolvedValueOnce({ data: { sha: 'blob-a' } })
      .mockResolvedValueOnce({ data: { sha: 'blob-report' } }),
    createTree: vi.fn().mockResolvedValue({ data: { sha: 'tree-new' } }),
    createCommit: vi.fn().mockResolvedValue({ data: { sha: 'commit-new' } }),
    updateRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'commit-new' } } }),
  },
})

describe('GitHubRepository', () => {
  it('creates one atomic fast-forward Git Data commit in order', async () => {
    const github = githubMock()
    const repository = new GitHubRepository({ github, owner: 'Junaspark', repo: 'gym' })

    await expect(repository.commitToMain(manifest, 'recorded-old')).resolves.toEqual({ commitSha: 'commit-new', applied: true })
    expect(github.git.createCommit).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'Junaspark',
      repo: 'gym',
      message: expect.stringMatching(/^practice: complete 2026-07-16 daily exercises\n\nFE-Algorithm-Gym-Manifest: sha256:[a-f0-9]{64}$/),
      tree: 'tree-new',
      parents: ['recorded-old'],
      author: expect.objectContaining({ date: '2026-07-16T12:00:00.000Z' }),
      committer: expect.objectContaining({ date: '2026-07-16T12:00:00.000Z' }),
    }))
    expect(github.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'heads/main', sha: 'commit-new', force: false }))
    expect(github.git.getRef.mock.invocationCallOrder[0]).toBeLessThan(github.git.getTree.mock.invocationCallOrder[0])
    expect(github.git.getTree.mock.invocationCallOrder[0]).toBeLessThan(github.git.createBlob.mock.invocationCallOrder[0])
    expect(github.git.createBlob.mock.invocationCallOrder.at(-1)!).toBeLessThan(github.git.createTree.mock.invocationCallOrder[0])
    expect(github.git.createTree.mock.invocationCallOrder[0]).toBeLessThan(github.git.createCommit.mock.invocationCallOrder[0])
    expect(github.git.createCommit.mock.invocationCallOrder[0]).toBeLessThan(github.git.updateRef.mock.invocationCallOrder[0])
  })

  it('can validate promotion on a disposable branch while default remains main', async () => {
    const github = githubMock()
    const repository = new GitHubRepository({ github, owner: 'Junaspark', repo: 'gym', branch: 'validation/promotion' })
    await repository.commitToMain(manifest, 'recorded-old')
    expect(github.git.getRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'heads/validation/promotion' }))
    expect(github.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'heads/validation/promotion', force: false }))
  })

  it('stops when remote main changed', async () => {
    const github = githubMock()
    github.git.getRef.mockResolvedValue({ data: { object: { sha: 'remote-new' } } })
    const repository = new GitHubRepository({ github, owner: 'Junaspark', repo: 'gym' })

    await expect(repository.commitToMain(manifest, 'recorded-old')).rejects.toThrow('REMOTE_HEAD_CHANGED')
    expect(github.git.updateRef).not.toHaveBeenCalled()
  })

  it.each([409, 422])('classifies update-ref HTTP %s as retryable without force', async status => {
    const github = githubMock()
    github.git.updateRef.mockRejectedValue(Object.assign(new Error('conflict'), { status }))
    const repository = new GitHubRepository({ github, owner: 'Junaspark', repo: 'gym' })

    await expect(repository.commitToMain(manifest, 'recorded-old')).rejects.toMatchObject({ message: 'GIT_SYNC_RETRYABLE', retryable: true })
    expect(github.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ force: false }))
  })

  it('recognizes an already-applied commit after an uncertain ref update', async () => {
    const github = githubMock()
    github.git.getRef.mockResolvedValue({ data: { object: { sha: 'commit-new' } } })
    github.git.getCommit.mockResolvedValue({
      data: {
        sha: 'commit-new',
        message: 'practice: complete 2026-07-16 daily exercises',
        tree: { sha: 'tree-new' },
        parents: [{ sha: 'recorded-old' }],
      },
    })
    const repository = new GitHubRepository({ github, owner: 'Junaspark', repo: 'gym' })

    await expect(repository.commitToMain(manifest, 'recorded-old', 'commit-new')).resolves.toEqual({ commitSha: 'commit-new', applied: false })
    expect(github.git.updateRef).not.toHaveBeenCalled()
  })

  it('rejects a malicious commit with the same human message and parent but different content', async () => {
    const github = githubMock()
    github.git.getRef.mockResolvedValue({ data: { object: { sha: 'attacker-commit' } } })
    github.git.getCommit.mockResolvedValueOnce({
      data: {
        sha: 'recorded-old',
        message: 'old',
        tree: { sha: 'tree-old' },
        parents: [],
      },
    })
    github.git.createCommit.mockResolvedValue({ data: { sha: 'expected-generated-commit' } })
    const repository = new GitHubRepository({ github, owner: 'Junaspark', repo: 'gym' })

    await expect(repository.commitToMain(manifest, 'recorded-old')).rejects.toThrow('REMOTE_HEAD_CHANGED')
    expect(github.git.updateRef).not.toHaveBeenCalled()
  })

  it('does not update the ref after a partial blob or commit failure', async () => {
    const github = githubMock()
    github.git.createBlob.mockReset().mockRejectedValue(new Error('blob failed'))
    const repository = new GitHubRepository({ github, owner: 'Junaspark', repo: 'gym' })
    await expect(repository.commitToMain(manifest, 'recorded-old')).rejects.toThrow('blob failed')
    expect(github.git.updateRef).not.toHaveBeenCalled()
  })
})
