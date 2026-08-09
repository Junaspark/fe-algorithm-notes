# Cron reminder delivery contract

The Codex scheduled task is the reminder delivery surface. Each authorized morning or evening cron response contains:

```json
{
  "planId": "uuid-or-null",
  "created": false,
  "remainingCount": 1,
  "reminder": {
    "kind": "morning-or-evening",
    "remainingCount": 1,
    "exerciseIds": ["exercise-id"]
  },
  "delivery": {
    "id": "morning:plan-uuid:2026-07-17",
    "channel": "codex-task-notification",
    "message": "same object as reminder"
  }
}
```

The application does **not** send Push or email itself. A Codex Automation invokes the endpoint and presents non-null `delivery.message` as the Codex task notification on signed-in desktop/mobile clients. `delivery.id` is deterministic per schedule slot (`kind + plan + Shanghai local date`), so retries can deduplicate while an unfinished plan is delivered again the next day. `reminder` and `delivery` are `null` only when no notification is due.

Notification commands are collected in a request-scoped, single-entry outbox. A second command fails the request with `NOTIFICATION_OUTBOX_FULL`; commands never accumulate in process memory and an expected command cannot be silently discarded. Authentication occurs before importing the database runtime or reading `OWNER_USER_ID`.

Deployment schedules use UTC: morning `30 1 * * *` (09:30 Asia/Shanghai) and evening `0 12 * * *` (20:00 Asia/Shanghai).

## Codex Automation setup

Create two recurring Codex tasks in the deployment owner account. The morning task calls `/api/cron/morning`; the evening task calls `/api/cron/evening`. Both send `Authorization: Bearer $CRON_SECRET`, parse JSON, and publish `delivery.message` only when `delivery` is non-null. Enable task notifications on desktop and mobile. Deployment is incomplete until staging invocations are visibly received on both devices. Do not configure a second app-side notifier: Codex task notification is the approved delivery surface.
