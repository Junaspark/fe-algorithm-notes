import {
  isRunResultEnvelope,
  normalizeJsonValue,
  type RunRequest,
  type RunRequestEnvelope,
  type RunResult,
} from './runner.protocol'

export interface RunnerWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: RunRequestEnvelope): void
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

function errorResult(request: RunRequest, startedAt: number, error: unknown): RunResult {
  const durationMs = Math.round(performance.now() - startedAt)
  const message = error instanceof Error ? error.message : String(error)
  return {
    requestId: request.requestId,
    tests: request.tests.map(test => ({
      name: test.name, status: 'error', durationMs, error: message, boundaryHint: test.boundaryHint,
    })),
    logs: [], durationMs, complexityAssessment: request.complexityAssessment,
  }
}

function validateRequestValues(request: RunRequest) {
  for (const [testIndex, test] of request.tests.entries()) {
    normalizeJsonValue(test.args, `tests[${testIndex}].args`)
    normalizeJsonValue(test.expected, `tests[${testIndex}].expected`)
  }
}

/**
 * Runs learner code in client-side Worker isolation for responsive UX.
 * This is not a security trust boundary; servers must never evaluate submissions.
 */
export function runTests(request: RunRequest, timeoutMs: number): Promise<RunResult> {
  const startedAt = performance.now()
  try {
    validateRequestValues(request)
  } catch (error) {
    return Promise.resolve(errorResult(request, startedAt, error))
  }
  let worker: RunnerWorker
  try {
    worker = workerFactory()
  } catch (error) {
    return Promise.resolve(errorResult(request, startedAt, error))
  }

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

    worker.onmessage = event => {
      if (isRunResultEnvelope(event.data, request.requestId)) finish(event.data.result)
    }
    worker.onerror = event => finish(errorResult(request, startedAt, event.message || 'Worker execution failed'))
    try {
      worker.postMessage({ kind: 'runner:execute', request })
    } catch (error) {
      finish(errorResult(request, startedAt, error))
    }
  })
}
