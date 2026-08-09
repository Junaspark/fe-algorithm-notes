export type GitHubProfileIdentity = {
  login?: string | null
  name?: string | null
  email?: string | null
}

export function normalizeGitHubLogin(login: string | null | undefined): string | null {
  const normalized = login?.trim().toLowerCase()
  return normalized || null
}

export function authorizeGitHubUser(profile: GitHubProfileIdentity): boolean {
  return normalizeGitHubLogin(profile.login) === 'junaspark'
}
