import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function prepareNetlifyMigrations(options: {
  source?: string
  destination?: string
} = {}): Promise<string[]> {
  const source = options.source ?? 'drizzle'
  const destination = options.destination ?? 'netlify/database/migrations'
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareNetlifyMigrations().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
