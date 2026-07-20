import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export type BuildStep = readonly [command: string, args: readonly string[]]

export function netlifyBuildSteps(env: Record<string, string | undefined> = {}): BuildStep[] {
  void env
  return [
    ['pnpm', ['netlify:migrations']],
    ['pnpm', ['exec', 'next', 'build']],
  ]
}

export function runNetlifyBuild(env: NodeJS.ProcessEnv = process.env): void {
  for (const [command, args] of netlifyBuildSteps(env)) {
    const executable = process.platform === 'win32' ? `${command}.cmd` : command
    const result = spawnSync(executable, [...args], { env, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNetlifyBuild()
}
