'use client'

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import './monaco-local'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div className="editor-loading">正在准备编辑器…</div> })

export default function CodeEditor({ value, onChange }: { value: string; onChange(value: string): void }) {
  const editorRef = useRef<{ getAction(id: string): { run(): Promise<void> } | null } | null>(null)
  const [workerReady, setWorkerReady] = useState(false)
  const format = () => void editorRef.current?.getAction('editor.action.formatDocument')?.run()
  return <><button type="button" className="format-button" data-worker-ready={workerReady} onClick={format}>格式化代码</button><MonacoEditor aria-label="代码编辑器" height="100%" language="javascript" theme="vs-dark" value={value} onMount={(instance, api) => {
    editorRef.current = instance
    const uri = instance.getModel()?.uri
    if (uri) void api.languages.typescript.getJavaScriptWorker().then((createWorker: (workerUri: typeof uri) => Promise<unknown>) => createWorker(uri)).then(() => setWorkerReady(true))
  }} onChange={next => onChange(next ?? '')} options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true, padding: { top: 20 }, wordWrap: 'on', formatOnPaste: true, scrollBeyondLastLine: false }} /></>
}
