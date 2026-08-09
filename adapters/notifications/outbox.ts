import type { NotificationMessage, NotificationPort } from './port'

/** Request-scoped handoff from domain policy to the scheduled-task caller. */
export class NotificationOutboxAdapter implements NotificationPort {
  private pending: NotificationMessage | null = null

  async send(message: NotificationMessage): Promise<void> {
    if (this.pending) throw new Error('NOTIFICATION_OUTBOX_FULL')
    this.pending = structuredClone(message)
  }

  take(): NotificationMessage | null {
    const message = this.pending
    this.pending = null
    return message
  }
}
