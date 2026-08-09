export type NotificationMessage = {
  kind: 'morning' | 'evening'
  userId: string
  planId: string
  remainingCount: number
  exerciseIds: string[]
}

export interface NotificationPort {
  send(message: NotificationMessage): Promise<void>
}
