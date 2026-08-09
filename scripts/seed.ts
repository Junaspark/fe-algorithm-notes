import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

import * as schema from '@/db/schema'
import { ExerciseSchema } from '@/domain/exercises/schema'

export async function seedExercises<TQuery extends PgQueryResultHKT>(db: PgDatabase<TQuery, typeof schema>) {
  const directory = path.join(process.cwd(), 'exercises')
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()
  const values = await Promise.all(files.map(async (file) => {
    const exercise = ExerciseSchema.parse(JSON.parse(await readFile(path.join(directory, file), 'utf8')))
    return { id: exercise.id, kind: exercise.kind, version: 1, content: exercise }
  }))

  await db.insert(schema.exercises).values(values).onConflictDoUpdate({
    target: schema.exercises.id,
    set: { kind: sql`excluded.kind`, version: sql`excluded.version`, content: sql`excluded.content`, updatedAt: new Date() },
  })
  return values.length
}

async function main() {
  const { db, sqlClient } = await import('@/db/client')
  try {
    console.log(`${await seedExercises(db)} exercises upserted`)
  } finally {
    await sqlClient.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
