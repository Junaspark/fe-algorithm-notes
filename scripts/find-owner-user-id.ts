import postgres from 'postgres'

import { resolveDatabaseUrl } from '@/db/connection-string'

type QueryClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>
  end(): Promise<void>
}

export async function findOwnerUserId(
  url: string,
  login = 'Junaspark',
  connect: (url: string) => QueryClient = value => postgres(value, { max: 1 }) as unknown as QueryClient,
) {
  const sql = connect(url)
  try {
    const normalized = login.trim().toLowerCase()
    const rows = await sql`select id from "user" where lower(trim("githubLogin")) = ${normalized}`
    if (rows.length !== 1 || typeof rows[0].id !== 'string') throw new Error(`EXPECTED_ONE_OWNER_USER: received ${rows.length}`)
    return rows[0].id
  } finally {
    await sql.end()
  }
}

if (process.argv[1]?.endsWith('find-owner-user-id.ts')) {
  console.log(await findOwnerUserId(resolveDatabaseUrl(process.env)))
}
