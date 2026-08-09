'use client'

import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'

type MonacoEnvironment = {
  getWorker(moduleId: string, label: string): Worker
}

const environment: MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'javascript' || label === 'typescript') {
      return new Worker(new URL('./monaco-typescript.worker.ts', import.meta.url), { type: 'module', name: 'monaco-typescript' })
    }
    return new Worker(new URL('./monaco-editor.worker.ts', import.meta.url), { type: 'module', name: 'monaco-editor' })
  },
}

;(globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment }).MonacoEnvironment = environment
loader.config({ monaco })
