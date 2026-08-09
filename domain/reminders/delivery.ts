import type { NotificationMessage } from '@/adapters/notifications/port'

/** Stable command consumed by a Codex Automation task; the id is its deduplication key. */
export function reminderDelivery(message: NotificationMessage | null, now = new Date()) {
  if (!message) return null
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return { id: `${message.kind}:${message.planId}:${localDate}`, channel: 'codex-task-notification' as const, message }
}
