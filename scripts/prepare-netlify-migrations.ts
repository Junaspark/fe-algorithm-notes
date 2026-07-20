import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { verifyExerciseDataMigration } from './generate-exercise-data-migration'

export async function prepareNetlifyMigrations(options: {
  source?: string
  destination?: string
} = {}): Promise<string[]> {
  const source = options.source ?? 'drizzle'
  const destination = options.destination ?? 'netlify/database/migrations'
  if (source === 'drizzle') await verifyExerciseDataMigration()
  const names = (await readdir(source))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()

  if (names.length === 0) {
    throw new Error(`No canonical SQL migrations found in ${source}`)
  }

  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  for (const name of names) {
    await copyFile(path.join(source, name), path.join(destination, name))
  }

  return names
}

export async function verifyNetlifyMigrationParity(options: {
  source?: string
  destination?: string
} = {}): Promise<string[]> {
  const source = options.source ?? 'drizzle'
  const destination = options.destination ?? 'netlify/database/migrations'
  const selectMigrations = (names: string[]) => names.filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()
  const canonical = selectMigrations(await readdir(source))
  const snapshots = selectMigrations(await readdir(destination))
  const missing = canonical.filter((name) => !snapshots.includes(name))
  const stale = snapshots.filter((name) => !canonical.includes(name))

  if (missing.length > 0) throw new Error(`Netlify migration snapshots are missing: ${missing.join(', ')}`)
  if (stale.length > 0) throw new Error(`Netlify migration snapshots are stale: ${stale.join(', ')}`)

  for (const name of canonical) {
    const [expected, actual] = await Promise.all([
      readFile(path.join(source, name)),
      readFile(path.join(destination, name)),
    ])
    if (!expected.equals(actual)) throw new Error(`Netlify migration snapshot differs: ${name}`)
  }

  return canonical
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareNetlifyMigrations().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
