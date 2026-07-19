import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { prepareNetlifyMigrations } from '@/scripts/prepare-netlify-migrations'

describe('prepareNetlifyMigrations', () => {
  it('copies every canonical SQL migration in lexical order and removes stale output', async () => {
    const destination = await mkdtemp(path.join(os.tmpdir(), 'netlify-migrations-'))
    await writeFile(path.join(destination, 'stale.sql'), 'stale')

    const names = await prepareNetlifyMigrations({ destination })

    expect(names).toEqual(
      (await readdir('drizzle'))
        .filter((name) => /^\d{4}_.+\.sql$/.test(name))
        .sort(),
    )
    expect(await readdir(destination)).toEqual(names)
    for (const name of names) {
      expect(await readFile(path.join(destination, name), 'utf8')).toBe(
        await readFile(path.join('drizzle', name), 'utf8'),
      )
    }
  })

  it('rejects an empty canonical migration source', async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), 'empty-migrations-'))
    const destination = await mkdtemp(path.join(os.tmpdir(), 'netlify-migrations-'))

    await expect(prepareNetlifyMigrations({ source, destination })).rejects.toThrow(
      'No canonical SQL migrations found',
    )
  })
})
