import { describe, expect, it } from 'vitest'
import { createFakeRedis } from '../../testUtils/fakeRedis.js'
import { linkGoogle, linkPhone, requestOtp, signInWithGoogle, type Applicant, type AuthDeps, type VerifiedGoogleIdentity } from './service.js'
import type { SmsProvider } from './smsProvider.js'

// In-memory stand-in for the applicants table, mirroring the real
// routes.ts deps closely enough to exercise the no-duplicate rules.
function makeDeps() {
  const sent = new Map<string, string>()
  const sms: SmsProvider = { sendOtp: async (phone, code) => void sent.set(phone, code) }
  const rows: Array<Applicant & { googleSub: string | null; invitedEmail: string | null }> = []
  let nextId = 1
  const view = (r: (typeof rows)[number]): Applicant => ({ ...r, hasGoogle: r.googleSub !== null })

  const deps: AuthDeps = {
    redis: createFakeRedis(),
    smsProvider: sms,
    findOrCreateApplicant: async (phone) => {
      let r = rows.find((x) => x.phone === phone)
      if (!r) {
        r = { id: String(nextId++), phone, role: 'applicant', googleSub: null, invitedEmail: null, active: true }
        rows.push(r)
      }
      return view(r)
    },
    getApplicantById: async (id) => {
      const r = rows.find((x) => x.id === id)
      return r ? view(r) : null
    },
    findByGoogleSub: async (sub) => {
      const r = rows.find((x) => x.googleSub === sub)
      return r ? view(r) : null
    },
    findByPhone: async (phone) => {
      const r = rows.find((x) => x.phone === phone)
      return r ? view(r) : null
    },
    claimInviteByEmail: async (identity) => {
      const r = rows.find((x) => x.invitedEmail === identity.email && x.googleSub === null)
      if (!r) return null
      r.googleSub = identity.sub
      r.email = identity.email
      r.invitedEmail = null
      return view(r)
    },
    createGoogleApplicant: async (identity) => {
      const r = { id: String(nextId++), phone: null, role: 'applicant', googleSub: identity.sub, email: identity.email, invitedEmail: null, active: true }
      rows.push(r)
      return view(r)
    },
    attachGoogle: async (id, identity) => {
      const r = rows.find((x) => x.id === id)!
      r.googleSub = identity.sub
      r.email = identity.email
      return view(r)
    },
    attachPhone: async (id, phone) => {
      const r = rows.find((x) => x.id === id)!
      r.phone = phone
      return view(r)
    },
  }
  return { deps, rows, sent }
}

const GMAIL: VerifiedGoogleIdentity = { sub: 'google-sub-1', email: 'asha@gmail.com', name: 'Asha' }
const PHONE = '+919876500001'
const IP = '198.51.100.1'

describe('signInWithGoogle', () => {
  it('creates a new account as role applicant on first sign-in, then finds the same one again', async () => {
    const { deps, rows } = makeDeps()
    const first = await signInWithGoogle(deps, GMAIL)
    expect(first.ok && first.created).toBe(true)
    expect(first.ok && first.applicant.role).toBe('applicant')

    const second = await signInWithGoogle(deps, GMAIL)
    expect(second.ok && second.created).toBe(false)
    expect(rows).toHaveLength(1)
  })

  it('a Gmail already linked to a phone account signs into THAT account — no duplicate', async () => {
    const { deps, rows } = makeDeps()
    const phoneAccount = await deps.findOrCreateApplicant(PHONE)
    const linked = await linkGoogle(deps, phoneAccount.id, GMAIL)
    expect(linked.ok).toBe(true)

    const signIn = await signInWithGoogle(deps, GMAIL)
    expect(signIn.ok && signIn.applicant.id).toBe(phoneAccount.id)
    expect(rows).toHaveLength(1)
  })

  it('claims a pending officer invite by verified email and keeps the officer role', async () => {
    const { deps, rows } = makeDeps()
    rows.push({ id: 'officer-1', phone: null, role: 'officer', googleSub: null, invitedEmail: 'asha@gmail.com', active: true })
    const result = await signInWithGoogle(deps, GMAIL)
    expect(result.ok && result.applicant.id).toBe('officer-1')
    expect(result.ok && result.applicant.role).toBe('officer')
    expect(rows).toHaveLength(1)
  })

  it('refuses a deactivated account', async () => {
    const { deps, rows } = makeDeps()
    rows.push({ id: 'x', phone: null, role: 'officer', googleSub: GMAIL.sub, invitedEmail: null, active: false })
    const result = await signInWithGoogle(deps, GMAIL)
    expect(result.ok).toBe(false)
  })
})

describe('account linking', () => {
  it('refuses to link a Gmail that already belongs to a different account', async () => {
    const { deps } = makeDeps()
    await signInWithGoogle(deps, GMAIL) // a Google-only account owns this Gmail
    const phoneAccount = await deps.findOrCreateApplicant(PHONE)
    const result = await linkGoogle(deps, phoneAccount.id, GMAIL)
    expect(result).toEqual({ ok: false, reason: 'already_linked_elsewhere' })
  })

  it('refuses to attach a second, different Gmail to one account', async () => {
    const { deps } = makeDeps()
    const phoneAccount = await deps.findOrCreateApplicant(PHONE)
    await linkGoogle(deps, phoneAccount.id, GMAIL)
    const result = await linkGoogle(deps, phoneAccount.id, { sub: 'other', email: 'b@gmail.com', name: null })
    expect(result).toEqual({ ok: false, reason: 'already_has_method' })
  })

  it('links a phone to a Google account only with the right OTP, then phone sign-in lands on the same account', async () => {
    const { deps, rows, sent } = makeDeps()
    const google = await signInWithGoogle(deps, GMAIL)
    if (!google.ok) throw new Error('setup failed')

    await requestOtp(deps, PHONE, IP)
    const wrong = await linkPhone(deps, google.applicant.id, PHONE, '000000' === sent.get(PHONE) ? '111111' : '000000', IP)
    expect(wrong.ok).toBe(false)

    const right = await linkPhone(deps, google.applicant.id, PHONE, sent.get(PHONE)!, IP)
    expect(right.ok).toBe(true)

    const viaPhone = await deps.findOrCreateApplicant(PHONE)
    expect(viaPhone.id).toBe(google.applicant.id)
    expect(rows).toHaveLength(1)
  })

  it('refuses to link a phone that already belongs to another account, even with a valid OTP', async () => {
    const { deps, sent } = makeDeps()
    await deps.findOrCreateApplicant(PHONE)
    const google = await signInWithGoogle(deps, GMAIL)
    if (!google.ok) throw new Error('setup failed')

    await requestOtp(deps, PHONE, IP)
    const result = await linkPhone(deps, google.applicant.id, PHONE, sent.get(PHONE)!, IP)
    expect(result).toEqual({ ok: false, reason: 'already_linked_elsewhere' })
  })
})
