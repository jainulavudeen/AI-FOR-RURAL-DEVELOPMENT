import { createFakeRedis } from '../../testUtils/fakeRedis'
import { describe, expect, it } from 'vitest'
import { otpKeys } from './otp'
import { logout, refreshSession, requestOtp, verifyOtp, type Applicant, type AuthDeps } from './service'
import type { SmsProvider } from './smsProvider'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class RecordingSmsProvider implements SmsProvider {
  sent = new Map<string, string>()

  async sendOtp(phone: string, code: string) {
    this.sent.set(phone, code)
  }
}

async function makeDeps() {
  const redis = createFakeRedis()
  const sms = new RecordingSmsProvider()
  const byPhone = new Map<string, Applicant>()
  const byId = new Map<string, Applicant>()
  let nextId = 1

  const deps: AuthDeps = {
    redis,
    smsProvider: sms,
    findOrCreateApplicant: async (phone) => {
      let applicant = byPhone.get(phone)
      if (!applicant) {
        applicant = { id: String(nextId++), phone, role: 'applicant' }
        byPhone.set(phone, applicant)
        byId.set(applicant.id, applicant)
      }
      return applicant
    },
    getApplicantById: async (id) => byId.get(id) ?? null,
  }

  return { deps, sms, redis }
}

const PHONE = '+919876543210'
const IP = '203.0.113.7'

describe('requestOtp — rate limiting', () => {
  it('sends a 6-digit code and enforces the 60s resend cooldown', async () => {
    const { deps, sms } = await makeDeps()

    const first = await requestOtp(deps, PHONE, IP)
    expect(first.ok).toBe(true)
    expect(sms.sent.get(PHONE)).toMatch(/^\d{6}$/)

    const second = await requestOtp(deps, PHONE, IP)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.reason).toBe('rate_limited')
  })

  it('caps requests per phone at 5 within the rolling window', async () => {
    const { deps } = await makeDeps()

    for (let i = 0; i < 5; i += 1) {
      await deps.redis.del(otpKeys.cooldown(PHONE))
      const result = await requestOtp(deps, PHONE, IP)
      expect(result.ok).toBe(true)
    }

    await deps.redis.del(otpKeys.cooldown(PHONE))
    const sixth = await requestOtp(deps, PHONE, IP)
    expect(sixth.ok).toBe(false)
    if (!sixth.ok) expect(sixth.reason).toBe('rate_limited')
  })

  it('caps requests per IP at 20, independent of any single phone', async () => {
    const { deps } = await makeDeps()

    for (let i = 0; i < 20; i += 1) {
      const phone = `+9198765${String(i).padStart(5, '0')}`
      const result = await requestOtp(deps, phone, IP)
      expect(result.ok).toBe(true)
    }

    const blocked = await requestOtp(deps, '+919999999999', IP)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toBe('rate_limited')
  })
})

describe('verifyOtp — expiry and attempt caps', () => {
  it('succeeds with the correct code within the TTL and issues tokens', async () => {
    const { deps, sms } = await makeDeps()
    await requestOtp(deps, PHONE, IP)
    const code = sms.sent.get(PHONE)!

    const result = await verifyOtp(deps, PHONE, code, IP)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.accessToken).toBeTruthy()
      expect(result.refreshToken).toBeTruthy()
      expect(result.applicant.phone).toBe(PHONE)
    }
  })

  it('rejects a code that was never requested as expired_or_not_found, not invalid_code', async () => {
    const { deps } = await makeDeps()
    const result = await verifyOtp(deps, PHONE, '000000', IP)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('expired_or_not_found')
  })

  it('rejects a code once its TTL has actually elapsed', async () => {
    const { deps, sms, redis } = await makeDeps()
    await requestOtp(deps, PHONE, IP)
    const code = sms.sent.get(PHONE)!

    // Force the code's TTL down instead of waiting out the real 5 minutes.
    await redis.pexpire(otpKeys.code(PHONE), 50)
    await sleep(150)

    const result = await verifyOtp(deps, PHONE, code, IP)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('expired_or_not_found')
  })

  it('locks the phone after 5 wrong attempts and blocks both verify and a fresh request', async () => {
    const { deps, sms } = await makeDeps()
    await requestOtp(deps, PHONE, IP)
    const correctCode = sms.sent.get(PHONE)!
    const wrongCode = correctCode === '000000' ? '111111' : '000000'

    for (let i = 0; i < 4; i += 1) {
      const result = await verifyOtp(deps, PHONE, wrongCode, IP)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('invalid_code')
    }

    const fifth = await verifyOtp(deps, PHONE, wrongCode, IP)
    expect(fifth.ok).toBe(false)
    if (!fifth.ok) expect(fifth.reason).toBe('locked')

    // The correct code no longer works once locked — the lock, not the
    // guess, is what's being enforced now.
    const withCorrectCode = await verifyOtp(deps, PHONE, correctCode, IP)
    expect(withCorrectCode.ok).toBe(false)
    if (!withCorrectCode.ok) expect(withCorrectCode.reason).toBe('locked')

    // And a fresh /request is blocked too, not just /verify — otherwise an
    // attacker just resets their guess budget.
    await deps.redis.del(otpKeys.cooldown(PHONE))
    const requestWhileLocked = await requestOtp(deps, PHONE, IP)
    expect(requestWhileLocked.ok).toBe(false)
    if (!requestWhileLocked.ok) expect(requestWhileLocked.reason).toBe('locked')
  })
})

describe('refresh + logout', () => {
  it('issues a new access token for a valid refresh token', async () => {
    const { deps, sms } = await makeDeps()
    await requestOtp(deps, PHONE, IP)
    const verified = await verifyOtp(deps, PHONE, sms.sent.get(PHONE)!, IP)
    if (!verified.ok) throw new Error('setup failed')

    const refreshed = await refreshSession(deps, verified.refreshToken)
    expect(refreshed.ok).toBe(true)
  })

  it('rejects an unknown refresh token', async () => {
    const { deps } = await makeDeps()
    const result = await refreshSession(deps, 'not-a-real-token')
    expect(result.ok).toBe(false)
  })

  it('logout revokes the refresh token', async () => {
    const { deps, sms } = await makeDeps()
    await requestOtp(deps, PHONE, IP)
    const verified = await verifyOtp(deps, PHONE, sms.sent.get(PHONE)!, IP)
    if (!verified.ok) throw new Error('setup failed')

    await logout(deps, verified.refreshToken)
    const afterLogout = await refreshSession(deps, verified.refreshToken)
    expect(afterLogout.ok).toBe(false)
  })
})
