import { DrizzleAdapter } from '@auth/drizzle-adapter'
import NextAuth, { type NextAuthConfig } from 'next-auth'
import GitHub, { type GitHubProfile } from 'next-auth/providers/github'

import { db } from '@/db/client'
import { accounts, authenticators, sessions, users, verificationTokens } from '@/db/schema'
import { authorizeGitHubUser, normalizeGitHubLogin } from '@/domain/auth/authorize-github-user'
import { env } from '@/env'

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
  providers: [
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      profile(profile: GitHubProfile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          githubLogin: normalizeGitHubLogin(profile.login) ?? '',
        }
      },
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      return authorizeGitHubUser({ login: typeof profile?.login === 'string' ? profile.login : null })
    },
    jwt({ token, profile, user }) {
      const profileLogin = typeof profile?.login === 'string' ? profile.login : null
      token.githubLogin = normalizeGitHubLogin(profileLogin) ?? user?.githubLogin ?? token.githubLogin
      return token
    },
    session({ session, user }) {
      session.user.id = user.id
      session.user.githubLogin = normalizeGitHubLogin(user.githubLogin) ?? ''
      return session
    },
  },
} satisfies NextAuthConfig

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig)
