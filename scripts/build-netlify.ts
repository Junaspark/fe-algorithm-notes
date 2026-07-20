import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export type BuildStep = readonly [command: string, args: readonly string[]]

type BuildDecision = {
  context: string
  seed: boolean
  source: 'netlify-cloud' | 'netlify-cli' | 'local'
}

const DEPLOY_CONTEXTS = new Set(['production', 'deploy-preview', 'branch-deploy'])

export function netlifyBuildDecision(env: Record<string, string | undefined>): BuildDecision {
  const deployContext = env.CONTEXT && DEPLOY_CONTEXTS.has(env.CONTEXT) ? env.CONTEXT : undefined
  if (env.NETLIFY === 'true') {
    return { context: deployContext ?? 'netlify', seed: true, source: 'netlify-cloud' }
  }
  if (deployContext && env.NETLIFY_DEPLOY_BUILD === 'true') {
    return { context: deployContext, seed: true, source: 'netlify-cli' }
  }
  return { context: 'local', seed: false, source: 'local' }
}

export function netlifyBuildSteps(env: Record<string, string | undefined>): BuildStep[] {
  const steps: BuildStep[] = [['pnpm', ['netlify:migrations']]]
  if (netlifyBuildDecision(env).seed) steps.push(['pnpm', ['seed']])
  steps.push(['pnpm', ['exec', 'next', 'build']])
  return steps
}

export function runNetlifyBuild(env: NodeJS.ProcessEnv = process.env): void {
  const decision = netlifyBuildDecision(env)
  console.log(`[netlify-build] seed=${decision.seed ? 'yes' : 'no'} context=${decision.context} source=${decision.source}`)
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
