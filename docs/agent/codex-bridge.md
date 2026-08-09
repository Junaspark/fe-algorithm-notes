# Codex scheduled-task bridge

The application does not call an OpenAI API and does not require an OpenAI API key. `AGENT_ADAPTER=mock` is the default functional path for development and product-flow tests. The optional Codex scheduled task is an asynchronous worker outside the application.

## Security boundary

- Set the same high-entropy `AGENT_BRIDGE_SECRET` in the application and the scheduled task.
- Transfer only `agent-job.v1` JSON. Each object is strict, sanitized, and at most 64 KiB.
- Treat exercise code and all Agent output as untrusted data.
- Only the callback Route Handler may accept a result. It verifies the HMAC, route/job ID, idempotency key, job type, deadline, and strict result schema.
- Agent prose is stored as review/select payload data only. It is never interpreted as a mastery update, shell command, Git export manifest, or notification command.

## Exact scheduled-task protocol

Run the following loop on each schedule:

1. **Claim:** Send `GET /api/agent/jobs` with `X-Agent-Bridge-Secret` and a stable `X-Agent-Worker-Id`. The application atomically claims up to 20 available jobs for five minutes. Each response item is `{ job, workerId, leaseToken, leaseUntil }`; a second worker cannot claim the same live lease. An expired lease becomes claimable again. If the response is `401` or `403`, stop immediately. Retry `429` or `5xx` with bounded exponential backoff.
2. **Validate:** Parse every `job` as `agent-job.v1` and require a UUID `leaseToken`, matching worker ID, and future `leaseUntil`. Reject unknown fields, messages over 64 KiB, expired deadlines, or `attempt > maxAttempts`. Invalid stored rows are quarantined by the application and do not block other claims.
3. **Execute once:** Use `(job.id, job.idempotencyKey, job.attempt, leaseToken)` as the execution identity. Produce only the matching discriminated structured payload:
   - `review-submission`: `summary`, `strengths`, `improvements`, `followUpQuestions`.
   - `select-exercises`: exactly one algorithm ID, one frontend ID, and a rationale.
4. **Result:** Serialize the callback envelope `{ "leaseToken": claim.leaseToken, "attempt": job.attempt, "result": AgentResult }`, compute `hex(HMAC-SHA256(AGENT_BRIDGE_SECRET, exactRequestBodyBytes))`, and send:

   ```http
   POST /api/agent/jobs/{job.id}/result
   Content-Type: application/json
   X-Agent-Signature: sha256={hex digest}
   ```

   The signed bytes must be byte-for-byte identical to the HTTP body and the whole envelope must be at most 64 KiB. The callback is accepted only while that exact token and attempt own the current lease. A `202` means the result is durably accepted. Re-sending the canonically identical terminal result returns `202`, including after the lease was cleared. A different terminal result returns `409` and never overwrites the winner.
5. **Retry:** On network failure, `429`, or `5xx`, resend the same signed body with bounded exponential backoff while the deadline and lease remain current. On `409`, stop processing the stale or conflicting copy; claim again only through the fetch endpoint. On `410`, stop that job. Never increment `attempt` or mint a lease token in Codex—the application owns both durably.
6. **Stop:** Stop the run when the fetch returns no jobs, the schedule's execution budget is nearly exhausted, authentication fails, or every fetched job has reached a terminal callback outcome. Do not loop indefinitely and do not continue beyond a job deadline.

## Retry and fallback ownership

The application persists a job before dispatch. A deadline timeout produces a schema-valid `retryable` result and increments the durable attempt. At `maxAttempts`, the application stores a deterministic fallback result. This keeps review and exercise selection functional when Codex is disabled or unavailable.

## Notifications

Agent jobs do not send reminders directly. Morning/evening reminders remain commands emitted by the reminder service and delivered through the notification outbox. A scheduled Codex task may emit an operator-level failure notification for its own authentication or infrastructure failure, but it must not impersonate product reminders or alter their cadence.
