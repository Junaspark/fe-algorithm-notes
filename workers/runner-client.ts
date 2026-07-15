import type { RunRequest, RunResult } from './runner.protocol'

export interface RunnerWorker {
  onmessage: ((event: MessageEvent<RunResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: RunRequest): void
  terminate(): void
}

type RunnerWorkerFactory = () => RunnerWorker

const createBrowserWorker: RunnerWorkerFactory = () => new Worker(
  new URL('./runner.worker.ts', import.meta.url),
  { type: 'module', name: 'exercise-runner' },
)

let workerFactory: RunnerWorkerFactory = createBrowserWorker

/** Test seam for browser-compatible worker transports. */
export function setRunnerWorkerFactory(factory: RunnerWorkerFactory = createBrowserWorker) {
  workerFactory = factory
}

/**
 * Runs learner code in client-side Worker isolation for responsive UX.
 * This is not a security trust boundary; servers must never evaluate submissions.
 */
export function runTests(request: RunRequest, timeoutMs: number): Promise<RunResult> {
  const startedAt = performance.now()
  const worker = workerFactory()

  return new Promise(resolve => {
    let settled = false
    const finish = (result: RunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      resolve(result)
    }
    const timer = setTimeout(() => finish({
      requestId: request.requestId,
      tests: request.tests.map(test => ({
        name: test.name,
        status: 'timeout',
        durationMs: Math.round(performance.now() - startedAt),
        boundaryHint: test.boundaryHint,
      })),
      logs: [],
      durationMs: Math.round(performance.now() - startedAt),
      complexityAssessment: request.complexityAssessment,
    }), timeoutMs)

    worker.onmessage = event => finish(event.data)
    worker.onerror = event => finish({
      requestId: request.requestId,
      tests: request.tests.map(test => ({
        name: test.name,
        status: 'error',
        durationMs: Math.round(performance.now() - startedAt),
        error: event.message || 'Worker execution failed',
        boundaryHint: test.boundaryHint,
      })),
      logs: [],
      durationMs: Math.round(performance.now() - startedAt),
      complexityAssessment: request.complexityAssessment,
    })
    worker.postMessage(request)
  })
}
