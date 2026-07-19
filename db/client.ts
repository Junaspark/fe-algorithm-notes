import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { resolveDatabaseUrl } from './connection-string'
import * as schema from './schema'

const connectionString = resolveDatabaseUrl(process.env)

export const sqlClient = postgres(connectionString, { max: 10 })
export const db = drizzle(sqlClient, { schema })
