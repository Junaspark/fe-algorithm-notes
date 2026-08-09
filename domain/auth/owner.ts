import { sql } from 'drizzle-orm'

import { db } from '@/db/client'

export type OwnerQuery = (normalizedLogin: string) => Promise<Record<string, unknown>[]>

const defaultQuery: OwnerQuery = async normalizedLogin =>
  db.execute(sql`select id from "user" where lower(trim("githubLogin")) = ${normalizedLogin}`)

export async function resolveOwnerUserId({
  explicitId = process.env.OWNER_USER_ID,
  login = 'Junaspark',
  query = defaultQuery,
}: { explicitId?: string; login?: string; query?: OwnerQuery } = {}): Promise<string> {
  const override = explicitId?.trim()
  if (override) return override

  const rows = await query(login.trim().toLowerCase())
  if (rows.length !== 1 || typeof rows[0]?.id !== 'string' || !rows[0].id.trim()) {
    throw new Error(`EXPECTED_ONE_OWNER_USER: received ${rows.length}`)
  }

  return rows[0].id
}
