import { DrizzleAdapter } from '@auth/drizzle-adapter'
import NextAuth, { type NextAuthConfig } from 'next-auth'
import GitHub, { type GitHubProfile } from 'next-auth/providers/github'

import { db } from '@/db/client'
import { accounts, authenticators, sessions, users, verificationTokens } from '@/db/schema'
import { authorizeGitHubUser, normalizeGitHubLogin } from '@/domain/auth/authorize-github-user'
import { env } from '@/env'

type RawGitHubIdentity = Pick<GitHubProfile, 'id' | 'login' | 'name' | 'email' | 'avatar_url'>

type DatabaseSession = {
  user: {
    id?: string
    githubLogin?: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
  expires: string
}

type PersistedAuthUser = {
  id: string
  githubLogin?: string | null
}

export function mapGitHubProfile(profile: RawGitHubIdentity) {
  return {
    id: String(profile.id),
    name: profile.name ?? profile.login,
    email: profile.email,
    image: profile.avatar_url,
    githubLogin: normalizeGitHubLogin(profile.login) ?? '',
  }
}

export function authorizeGitHubSignIn({ profile }: { profile?: Record<string, unknown> | null; [key: string]: unknown }): boolean {
  return authorizeGitHubUser({ login: typeof profile?.login === 'string' ? profile.login : null })
}

export function populateDatabaseSession({
  session,
  user,
}: {
  session: DatabaseSession
  user?: PersistedAuthUser
}): DatabaseSession & { user: DatabaseSession['user'] & { id: string; githubLogin: string } } {
  if (!user || !authorizeGitHubUser({ login: user.githubLogin })) {
    throw new Error('Unauthorized persisted GitHub login')
  }

  return {
    ...session,
    user: {
      ...session.user,
      id: user.id,
      githubLogin: normalizeGitHubLogin(user.githubLogin)!,
    },
  }
}

const githubProvider = GitHub({
  clientId: env.AUTH_GITHUB_ID,
  clientSecret: env.AUTH_GITHUB_SECRET,
})
githubProvider.profile = mapGitHubProfile

export const authConfig = {
  secret: env.AUTH_SECRET,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),
  session: { strategy: 'database' },
  providers: [githubProvider],
  callbacks: {
    signIn: authorizeGitHubSignIn,
    jwt({ token, profile, user }) {
      const profileLogin = typeof profile?.login === 'string' ? profile.login : null
      token.githubLogin = normalizeGitHubLogin(profileLogin) ?? user?.githubLogin ?? token.githubLogin
      return token
    },
    session: populateDatabaseSession,
  },
} satisfies NextAuthConfig

const nextAuth = NextAuth(authConfig)
export const { handlers, signIn, signOut } = nextAuth
type AppSession = { user: { id?: string; githubLogin?: string; name?: string | null; email?: string | null; image?: string | null }; expires: string }
export async function auth(): Promise<AppSession | null> {
  if (process.env.E2E_COMPILED === '1' && process.env.E2E_TEST_MODE === '1') {
    const { cookies } = await import('next/headers')
    const login = (await cookies()).get('e2e-user')?.value
    return login ? { user: { id: '00000000-0000-4000-8000-000000000001', githubLogin: login, name: login }, expires: '2099-01-01' } as never : null
  }
  return nextAuth.auth() as Promise<AppSession | null>
}
