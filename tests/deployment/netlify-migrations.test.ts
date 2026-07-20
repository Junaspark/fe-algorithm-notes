import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { prepareNetlifyMigrations, verifyNetlifyMigrationParity } from '@/scripts/prepare-netlify-migrations'

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

  it('keeps the checked-in Netlify migration snapshots byte-for-byte identical', async () => {
    await expect(verifyNetlifyMigrationParity()).resolves.toEqual(
      (await readdir('drizzle'))
        .filter((name) => /^\d{4}_.+\.sql$/.test(name))
        .sort(),
    )
  })

  it('rejects missing, stale, and changed checked-in migration snapshots', async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), 'canonical-migrations-'))
    const destination = await mkdtemp(path.join(os.tmpdir(), 'checked-in-migrations-'))
    await writeFile(path.join(source, '0000_first.sql'), 'canonical')

    await expect(verifyNetlifyMigrationParity({ source, destination })).rejects.toThrow('missing')

    await writeFile(path.join(destination, '0000_first.sql'), 'canonical')
    await writeFile(path.join(destination, '9999_stale.sql'), 'stale')
    await expect(verifyNetlifyMigrationParity({ source, destination })).rejects.toThrow('stale')

    await rm(path.join(destination, '9999_stale.sql'))
    await writeFile(path.join(destination, '0000_first.sql'), 'changed')
    await expect(verifyNetlifyMigrationParity({ source, destination })).rejects.toThrow('differs')
  })

  it('makes CI reject changed and untracked regenerated snapshots', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8')
    expect(workflow).toContain('git diff --exit-code -- netlify/database/migrations')
    expect(workflow).toContain('git status --porcelain --untracked-files=all -- netlify/database/migrations')
  })
})
