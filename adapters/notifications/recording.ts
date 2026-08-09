import type { NotificationMessage, NotificationPort } from './port'

export class RecordingNotificationAdapter implements NotificationPort {
  readonly messages: NotificationMessage[] = []

  async send(message: NotificationMessage): Promise<void> {
    this.messages.push(structuredClone(message))
  }
}
