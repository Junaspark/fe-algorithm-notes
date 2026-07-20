import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { resolveApplicationDatabaseUrl } from './application-database-url'
import * as schema from './schema'

const connectionString = resolveApplicationDatabaseUrl(process.env)

export const sqlClient = postgres(connectionString, { max: 10 })
export const db = drizzle(sqlClient, { schema })
