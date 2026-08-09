# Owner Bootstrap Design

## Context

The personal deployment creates its Auth.js database user only after the first successful GitHub login. Scheduled morning and evening jobs currently require `OWNER_USER_ID` before they can construct their runtime, which creates a bootstrap cycle: the ID exists in production, but Netlify's local CLI connection does not expose the production application tables.

## Decision

Resolve the owner at runtime through one fail-closed component:

1. If `OWNER_USER_ID` is a non-empty value, use it unchanged.
2. Otherwise query the Auth.js `user` table for normalized GitHub login `Junaspark`.
3. Accept exactly one non-empty user ID.
4. Reject zero rows, multiple rows, or malformed rows with `EXPECTED_ONE_OWNER_USER`.

Both morning plan generation and evening reminders await this resolver before constructing their services. GitHub sign-in authorization remains unchanged and continues to reject every login except `Junaspark`.

## Error handling and security

- No endpoint exposes the resolved ID.
- No fallback chooses the first row.
- Database errors propagate and the scheduled job fails without creating a plan or notification.
- An explicit deployment value remains available as an operational override.

## Verification

- Unit tests cover explicit override, normalized login lookup, zero rows, duplicate rows, and malformed IDs.
- Runtime tests prove both morning and evening services receive the resolved owner.
- The full test, type-check, lint, and Netlify build suites must pass.
- Production verification must show the morning endpoint creates one active plan and a repeated call reuses it.
