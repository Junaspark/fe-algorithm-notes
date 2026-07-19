export function resolveDatabaseUrl(env: Record<string, string | undefined>): string {
  const value = env.DATABASE_URL?.trim() || env.NETLIFY_DB_URL?.trim()
  if (!value) throw new Error('DATABASE_URL or NETLIFY_DB_URL is required')
  return value
}
