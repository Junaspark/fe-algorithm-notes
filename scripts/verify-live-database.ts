import postgres from 'postgres'

import { resolveDatabaseUrl } from '@/db/connection-string'

type QueryClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>
  end(): Promise<void>
}

type Connect = (url: string) => QueryClient

export async function verifyLiveDatabase(url: string, connect: Connect = value => postgres(value, { max: 1 }) as unknown as QueryClient) {
  const first = connect(url)
  const second = connect(url)

  try {
    const [[firstBackend], [secondBackend]] = await Promise.all([
      first`select pg_backend_pid() as pid`,
      second`select pg_backend_pid() as pid`,
    ])
    const firstPid = Number(firstBackend?.pid)
    const secondPid = Number(secondBackend?.pid)
    if (!Number.isInteger(firstPid) || !Number.isInteger(secondPid) || firstPid === secondPid) {
      throw new Error('INDEPENDENT_DATABASE_CONNECTIONS_REQUIRED')
    }

    const [seed] = await first`select count(*)::integer as count from exercises`
    const exerciseCount = Number(seed?.count)
    if (exerciseCount !== 19) throw new Error(`EXPECTED_19_EXERCISES: received ${exerciseCount}`)

    return { firstPid, secondPid, exerciseCount }
  } finally {
    await Promise.allSettled([first.end(), second.end()])
  }
}

if (process.argv[1]?.endsWith('verify-live-database.ts')) {
  const result = await verifyLiveDatabase(resolveDatabaseUrl(process.env))
  console.log(`live database gate passed: two backends (${result.firstPid}, ${result.secondPid}), ${result.exerciseCount} exercises`)
}
