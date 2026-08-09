'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
const MonacoEditor = dynamic(async () => {
  await import('./monaco-local')
  return import('@monaco-editor/react')
}, { ssr: false, loading: () => <div className="editor-loading">正在准备编辑器…</div> })

type MonacoApi = Parameters<NonNullable<React.ComponentProps<typeof import('@monaco-editor/react').default>['onMount']>>[1]

async function warmJavaScriptWorker(api: MonacoApi, uri: import('monaco-editor').Uri) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const createWorker = await api.languages.typescript.getJavaScriptWorker()
      await createWorker(uri)
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  throw new Error('MONACO_JAVASCRIPT_WORKER_NOT_READY')
}

export default function CodeEditor({ value, onChange }: { value: string; onChange(value: string): void }) {
  const editorRef = useRef<{ getAction(id: string): { run(): Promise<void> } | null } | null>(null)
  const [workerReady, setWorkerReady] = useState(false)
  const [workerFailed, setWorkerFailed] = useState(false)
  const format = () => void editorRef.current?.getAction('editor.action.formatDocument')?.run()
  return <><button type="button" className="format-button" data-worker-ready={workerReady} onClick={format}>格式化代码</button>{workerFailed ? <p role="status" className="editor-worker-error">智能编辑服务加载失败，仍可继续编码与运行。</p> : null}<MonacoEditor aria-label="代码编辑器" height="100%" language="javascript" theme="vs-dark" value={value} onMount={(instance, api) => {
    editorRef.current = instance
    const uri = instance.getModel()?.uri
    if (uri) void warmJavaScriptWorker(api, uri).then(() => setWorkerReady(true)).catch(() => setWorkerFailed(true))
  }} onChange={next => onChange(next ?? '')} options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true, padding: { top: 20 }, wordWrap: 'on', formatOnPaste: true, scrollBeyondLastLine: false }} /></>
}
