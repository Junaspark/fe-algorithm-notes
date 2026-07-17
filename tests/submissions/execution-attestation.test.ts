import { describe, expect, it } from 'vitest'
import { createExecutionAttestation, verifyExecutionAttestation } from '@/domain/submissions/execution-attestation'

const binding = { userId: 'user-1', exerciseId: 'curry', code: 'export const curry = () => 1', suiteVersion: 'exercise:1:full' }

describe('execution attestation', () => {
  it('binds a short-lived signed token to user, item, code and suite', async () => {
    const token = await createExecutionAttestation(binding, { secret: 'x'.repeat(32), now: new Date('2026-07-17T00:00:00Z'), nonce: 'nonce-1' })
    await expect(verifyExecutionAttestation(token, binding, { secret: 'x'.repeat(32), now: new Date('2026-07-17T00:01:00Z') })).resolves.toMatchObject({ nonce: 'nonce-1' })
    await expect(verifyExecutionAttestation(token, { ...binding, code: `${binding.code}\n// tampered` }, { secret: 'x'.repeat(32), now: new Date('2026-07-17T00:01:00Z') })).rejects.toThrow('EXECUTION_ATTESTATION_BINDING_MISMATCH')
    await expect(verifyExecutionAttestation(token, { ...binding, exerciseId: 'debounce' }, { secret: 'x'.repeat(32), now: new Date('2026-07-17T00:01:00Z') })).rejects.toThrow('EXECUTION_ATTESTATION_BINDING_MISMATCH')
  })

  it('rejects forged and expired tokens', async () => {
    const token = await createExecutionAttestation(binding, { secret: 'x'.repeat(32), now: new Date('2026-07-17T00:00:00Z'), nonce: 'nonce-1', ttlSeconds: 30 })
    await expect(verifyExecutionAttestation(`${token}x`, binding, { secret: 'x'.repeat(32), now: new Date('2026-07-17T00:00:01Z') })).rejects.toThrow('EXECUTION_ATTESTATION_INVALID')
    await expect(verifyExecutionAttestation(token, binding, { secret: 'x'.repeat(32), now: new Date('2026-07-17T00:01:00Z') })).rejects.toThrow('EXECUTION_ATTESTATION_EXPIRED')
  })
})
