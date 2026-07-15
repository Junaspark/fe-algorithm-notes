# Cron reminder delivery contract

The Codex scheduled task is the reminder delivery surface. Each authorized morning or evening cron response contains:

```json
{
  "planId": "uuid-or-null",
  "created": false,
  "remainingCount": 1,
  "reminder": {
    "kind": "morning-or-evening",
    "userId": "owner-uuid",
    "planId": "plan-uuid",
    "remainingCount": 1,
    "exerciseIds": ["exercise-id"]
  }
}
```

The scheduled caller delivers the non-null `reminder` through Push or email. `reminder` is `null` only when no notification is due (for example, no active plan at the evening check).

Notification commands are collected in a request-scoped, single-entry outbox. A second command fails the request with `NOTIFICATION_OUTBOX_FULL`; commands never accumulate in process memory and an expected command cannot be silently discarded. Authentication occurs before importing the database runtime or reading `OWNER_USER_ID`.

Deployment schedules use UTC: morning `30 1 * * *` (09:30 Asia/Shanghai) and evening `0 12 * * *` (20:00 Asia/Shanghai).
