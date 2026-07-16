export type QueuedDraft = { key: string; operationId: string; exerciseId: string; code: string; expectedVersion: number }
export type DraftSendResult = { kind: 'saved'; version: number } | { kind: 'conflict'; serverVersion: number; localVersion: number } | { kind: 'retry' }
const DB = 'fe-algorithm-gym'; const STORE = 'draft-queue'

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve()
  transaction.onerror = () => reject(transaction.error)
  transaction.onabort = () => reject(transaction.error)
})

export async function queueDraft(operation: QueuedDraft) {
  const database = await openQueue(); const transaction = database.transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).put(operation)
  await transactionDone(transaction); database.close()
}

export async function removeQueuedDraft(operation: QueuedDraft) {
  const database = await openQueue(); const transaction = database.transaction(STORE, 'readwrite'); const store = transaction.objectStore(STORE)
  const request = store.get(operation.key)
  request.onsuccess = () => { if ((request.result as QueuedDraft | undefined)?.operationId === operation.operationId) store.delete(operation.key) }
  await transactionDone(transaction); database.close()
}

export async function flushDraftOperations(drafts: QueuedDraft[], send: (draft: QueuedDraft) => Promise<DraftSendResult>, remove: (draft: QueuedDraft) => Promise<unknown>) {
  for (const draft of drafts) if ((await send(draft)).kind === 'saved') await remove(draft)
}

let activeFlush: Promise<void> | null = null

async function performDraftFlush(send: (draft: QueuedDraft) => Promise<DraftSendResult>) {
  const database = await openQueue(); const read = database.transaction(STORE).objectStore(STORE).getAll()
  const drafts = await new Promise<QueuedDraft[]>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) })
  database.close()
  await flushDraftOperations(drafts, send, removeQueuedDraft)
}

export function flushDraftQueue(send: (draft: QueuedDraft) => Promise<DraftSendResult>) {
  if (activeFlush) return activeFlush
  activeFlush = performDraftFlush(send).finally(() => { activeFlush = null })
  return activeFlush
}
