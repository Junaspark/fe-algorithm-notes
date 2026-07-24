import type { NotificationMessage } from '@/adapters/notifications/port'
import { reminderDelivery } from '@/domain/reminders/delivery'

export type PublicReminder = Pick<NotificationMessage, 'kind' | 'remainingCount' | 'exerciseIds'>

const toPublicReminder = (message: NotificationMessage): PublicReminder => ({
  kind: message.kind,
  remainingCount: message.remainingCount,
  exerciseIds: message.exerciseIds,
})

export function publicReminderResponse(message: NotificationMessage | null, now: Date) {
  if (!message) return { reminder: null, delivery: null }

  const delivery = reminderDelivery(message, now)
  if (!delivery) return { reminder: null, delivery: null }

  const reminder = toPublicReminder(message)
  return { reminder, delivery: { id: delivery.id, channel: delivery.channel, message: reminder } }
}
