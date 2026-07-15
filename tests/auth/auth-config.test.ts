import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitHubProfile } from 'next-auth/providers/github'

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/env', () => ({
  env: {
    AUTH_SECRET: 'test-secret',
    AUTH_GITHUB_ID: 'test-id',
    AUTH_GITHUB_SECRET: 'test-client-secret',
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  },
}))
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: vi.fn(() => ({ name: 'test-adapter' })) }))
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}))

import {
  authConfig,
  authorizeGitHubSignIn,
  mapGitHubProfile,
  populateDatabaseSession,
} from '@/auth'

const githubProfile = {
  id: 42,
  login: '  JuNaSpArK ',
  name: 'Not the authorization identity',
  email: 'not-an-authorization-identity@example.com',
  avatar_url: 'https://example.com/avatar.png',
}

describe('Auth.js GitHub configuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps the raw provider login to the normalized adapter user property', () => {
    expect(mapGitHubProfile(githubProfile)).toMatchObject({
      id: '42',
      githubLogin: 'junaspark',
    })

    const provider = authConfig.providers[0]
    expect(typeof provider).toBe('object')
    if (typeof provider === 'function') throw new Error('Expected configured GitHub provider')
    expect(provider.profile?.(githubProfile as unknown as GitHubProfile, {})).toMatchObject({ githubLogin: 'junaspark' })
  })

  it('uses raw profile.login as the sole sign-in authorization input', () => {
    expect(authorizeGitHubSignIn({ profile: githubProfile })).toBe(true)
    expect(authorizeGitHubSignIn({ profile: { ...githubProfile, login: 'other', name: 'Junaspark', email: 'junaspark@example.com' } })).toBe(false)
    expect(authorizeGitHubSignIn({ profile: { name: 'Junaspark', email: 'junaspark@example.com' } })).toBe(false)

    expect(authConfig.callbacks?.signIn).toBe(authorizeGitHubSignIn)
  })

  it('copies only a valid persisted adapter handle into a database session', () => {
    const session = { user: { name: 'Display name', email: 'user@example.com' }, expires: '2099-01-01' }
    const result = populateDatabaseSession({
      session,
      user: { id: 'user-1', githubLogin: '  JUNASPARK  ' },
    })

    expect(result.user).toMatchObject({ id: 'user-1', githubLogin: 'junaspark' })
    expect(authConfig.callbacks?.session).toBe(populateDatabaseSession)
  })

  it.each([undefined, '', 'other', 'junaspark<script>'])('denies a missing, malformed, or tampered persisted handle: %s', (githubLogin) => {
    expect(() => populateDatabaseSession({
      session: { user: {}, expires: '2099-01-01' },
      user: { id: 'user-1', githubLogin },
    })).toThrow('Unauthorized persisted GitHub login')
  })
})
