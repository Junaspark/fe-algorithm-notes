import { createHash } from 'node:crypto'
import type { ExportManifest } from '@/domain/git/export'
import { assertExportPath } from '@/domain/git/paths'
import type { Octokit } from '@octokit/rest'

type GitMethod = 'getRef' | 'getCommit' | 'getTree' | 'createBlob' | 'createTree' | 'createCommit' | 'updateRef'
type GitApi = { [K in GitMethod]: (...args: Parameters<Octokit['git'][K]>) => ReturnType<Octokit['git'][K]> }

export class RetryableGitSyncError extends Error {
  readonly retryable = true
  constructor(cause?: unknown, message = 'GIT_SYNC_RETRYABLE') {
    super(message, { cause })
  }
}

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined

export class GitHubRepository {
  constructor(private readonly options: { github: { git: GitApi }; owner: string; repo: string }) {}

  async commitToMain(manifest: ExportManifest, expectedHeadSha: string, knownCommitSha?: string): Promise<{ commitSha: string; applied: boolean }> {
    const { github, owner, repo } = this.options
    const files = manifest.files.map(file => ({ path: assertExportPath(file.path), content: file.content }))
    if (new Set(files.map(file => file.path)).size !== files.length) throw new Error('DUPLICATE_EXPORT_PATH')
    const fingerprint = createHash('sha256').update(JSON.stringify({
      base: expectedHeadSha,
      localDate: manifest.localDate,
      files: [...files].sort((a, b) => a.path.localeCompare(b.path, 'en')),
    })).digest('hex')
    const message = `practice: complete ${manifest.localDate} daily exercises\n\nFE-Algorithm-Gym-Manifest: sha256:${fingerprint}`
    const head = await github.git.getRef({ owner, repo, ref: 'heads/main' })
    const remoteHeadSha = head.data.object.sha

    const baseCommit = await github.git.getCommit({ owner, repo, commit_sha: expectedHeadSha })
    await github.git.getTree({ owner, repo, tree_sha: baseCommit.data.tree.sha })
    const blobShas = await Promise.all(files.map(async file => {
      const blob = await github.git.createBlob({ owner, repo, content: file.content, encoding: 'utf-8' })
      return { path: file.path, sha: blob.data.sha }
    }))
    const tree = await github.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.data.tree.sha,
      tree: blobShas.map(({ path, sha }) => ({ path, mode: '100644', type: 'blob', sha })),
    })
    const exactDate = `${manifest.localDate}T12:00:00.000Z`
    const identity = { name: 'FE Algorithm Gym', email: 'github-sync@users.noreply.github.com', date: exactDate }
    const commit = await github.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.data.sha,
      parents: [expectedHeadSha],
      author: identity,
      committer: identity,
    })
    if (remoteHeadSha !== expectedHeadSha) {
      if (remoteHeadSha === commit.data.sha && (!knownCommitSha || knownCommitSha === remoteHeadSha)) {
        return { commitSha: remoteHeadSha, applied: false }
      }
      throw new RetryableGitSyncError(undefined, 'REMOTE_HEAD_CHANGED')
    }
    try {
      await github.git.updateRef({ owner, repo, ref: 'heads/main', sha: commit.data.sha, force: false })
    } catch (error) {
      if (statusOf(error) === 409 || statusOf(error) === 422) throw new RetryableGitSyncError(error)
      throw error
    }
    return { commitSha: commit.data.sha, applied: true }
  }
}
