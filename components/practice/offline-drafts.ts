export type QueuedDraft = { key: string; exerciseId: string; code: string; expectedVersion: number }
const DB = 'fe-algorithm-gym'; const STORE = 'draft-queue'

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function queueDraft(operation: QueuedDraft) {
  const database = await openQueue(); const transaction = database.transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).put(operation)
}
export async function flushDraftQueue(send: (draft: QueuedDraft) => Promise<boolean>) {
  const database = await openQueue(); const read = database.transaction(STORE).objectStore(STORE).getAll()
  const drafts = await new Promise<QueuedDraft[]>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) })
  for (const draft of drafts) if (await send(draft)) database.transaction(STORE, 'readwrite').objectStore(STORE).delete(draft.key)
}
