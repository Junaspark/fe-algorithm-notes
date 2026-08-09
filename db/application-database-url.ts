import { resolveDatabaseUrl } from './connection-string'

export const BUILD_ONLY_DATABASE_URL = 'postgres://build-only.invalid/unused'

export function resolveApplicationDatabaseUrl(env: Record<string, string | undefined>): string {
  try {
    return resolveDatabaseUrl(env)
  } catch (error) {
    if (env.NEXT_PHASE === 'phase-production-build') return BUILD_ONLY_DATABASE_URL
    throw error
  }
}
