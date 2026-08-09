import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

type TestServer = { middlewares: { use(path: string, handler: (request: IncomingMessage, response: ServerResponse) => void): void } }

function deterministicPracticeApi() {
  let version = 1
  let code = ''
  return { name: 'deterministic-practice-api', configureServer(server: TestServer) {
    server.middlewares.use('/tests/api/version', (request, response) => {
      if (request.method === 'POST') { let body = ''; request.on('data', (chunk: Buffer) => { body += chunk }); request.on('end', () => { version = JSON.parse(body).version; response.statusCode = 204; response.end() }); return }
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ version, code }))
    })
    server.middlewares.use('/api/drafts', (request, response) => {
      let body = ''; request.on('data', (chunk: Buffer) => { body += chunk }); request.on('end', () => {
        const draft = JSON.parse(body) as { expectedVersion: number; code: string }
        response.setHeader('content-type', 'application/json')
        if (draft.expectedVersion !== version) { response.statusCode = 409; response.end(JSON.stringify({ code: 'DRAFT_CONFLICT', serverVersion: version, localVersion: draft.expectedVersion })); return }
        version += 1; code = draft.code; response.end(JSON.stringify({ version, savedAt: new Date(0).toISOString() }))
      })
    })
    server.middlewares.use('/api/submissions', (request, response) => {
      let body = ''; request.on('data', (chunk: Buffer) => { body += chunk }); request.on('end', () => {
        const submission = JSON.parse(body) as { evidence?: { scope?: string; tests?: Array<{ status: string }> } }
        response.setHeader('content-type', 'application/json')
        if (submission.evidence?.scope !== 'full' || !submission.evidence.tests?.every(test => test.status === 'passed')) { response.statusCode = 422; response.end(JSON.stringify({ code: 'FULL_TEST_EVIDENCE_REQUIRED' })); return }
        response.statusCode = 201; response.end(JSON.stringify({ submissionId: 'e2e', completed: true, planCompleted: false }))
      })
    })
  } }
}

const config = {
  plugins: [deterministicPracticeApi()],
  optimizeDeps: { include: ['@monaco-editor/react'] },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
}

export default config
