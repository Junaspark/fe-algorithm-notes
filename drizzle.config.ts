import { defineConfig } from 'drizzle-kit'

import { resolveDatabaseUrl } from './db/connection-string'

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: resolveDatabaseUrl(process.env) },
})
