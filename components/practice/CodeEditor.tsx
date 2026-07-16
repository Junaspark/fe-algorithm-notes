'use client'

import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div className="editor-loading">正在准备编辑器…</div> })

export default function CodeEditor({ value, onChange }: { value: string; onChange(value: string): void }) {
  return <MonacoEditor aria-label="代码编辑器" height="100%" language="javascript" theme="vs-dark" value={value} onChange={next => onChange(next ?? '')} options={{ fontSize: 16, minimap: { enabled: false }, automaticLayout: true, padding: { top: 20 }, wordWrap: 'on', formatOnPaste: true, scrollBeyondLastLine: false }} />
}
