import { z } from 'zod'

import { resolveApplicationDatabaseUrl } from './db/application-database-url'

const environmentSchema = z.object({
  AUTH_SECRET: z.string().min(1),
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
  DATABASE_URL: z.string().url(),
})

export const env = environmentSchema.parse({
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
  AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
  DATABASE_URL: resolveApplicationDatabaseUrl(process.env),
})
