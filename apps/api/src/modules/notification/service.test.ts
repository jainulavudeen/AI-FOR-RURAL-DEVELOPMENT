import { describe, expect, it, vi } from 'vitest'
import { NotFoundError, notifySchemeChange, sendNotification, type NotificationDeps } from './service.js'
import type { SchemeRuleSnapshot } from './schemeChangeDiff.js'
import type { NotificationProvider } from './types.js'

function makeProvider(): NotificationProvider {
  return { send: vi.fn(async () => undefined) }
}

function makeDeps(overrides: Partial<NotificationDeps> = {}): NotificationDeps {
  return {
    providers: { sms: makeProvider(), whatsapp: makeProvider(), push: makeProvider() },
    getApplicantPhone: async () => '+919999900002',
    getApplicantIdsMatchedToScheme: async () => [],
    ...overrides,
  }
}

describe('sendNotification', () => {
  it('sends through the requested channel only', async () => {
    const deps = makeDeps()
    await sendNotification(deps, 'applicant-1', 'sms', 'hello')
    expect(deps.providers.sms.send).toHaveBeenCalledWith({ phone: '+919999900002', message: 'hello' })
    expect(deps.providers.whatsapp.send).not.toHaveBeenCalled()
  })

  it('404s when the applicant has no phone on record', async () => {
    const deps = makeDeps({ getApplicantPhone: async () => null })
    await expect(sendNotification(deps, 'ghost', 'sms', 'hello')).rejects.toThrow(NotFoundError)
  })
})

describe('notifySchemeChange', () => {
  const oldRule: SchemeRuleSnapshot = { schemeId: 'micro_finance', version: 1, interestRate: 8, loanCap: 125000 }

  it('does not touch the provider at all when the change is not material', async () => {
    const deps = makeDeps({ getApplicantIdsMatchedToScheme: async () => ['a', 'b'] })
    const result = await notifySchemeChange(deps, oldRule, { ...oldRule, version: 2 })
    expect(result).toEqual({ materialChange: false, message: null, notifiedCount: 0, failedCount: 0 })
    expect(deps.providers.sms.send).not.toHaveBeenCalled()
  })

  it('notifies every applicant matched to the scheme on a material change', async () => {
    const deps = makeDeps({ getApplicantIdsMatchedToScheme: async () => ['a', 'b', 'c'] })
    const result = await notifySchemeChange(deps, oldRule, { ...oldRule, version: 2, interestRate: 9 })
    expect(result.materialChange).toBe(true)
    expect(result.notifiedCount).toBe(3)
    expect(result.failedCount).toBe(0)
    expect(deps.providers.sms.send).toHaveBeenCalledTimes(3)
  })

  it('one applicant\'s send failing does not stop the others', async () => {
    let call = 0
    const flaky: NotificationProvider = {
      send: vi.fn(async () => {
        call += 1
        if (call === 2) throw new Error('provider down')
      }),
    }
    const deps = makeDeps({ providers: { sms: flaky, whatsapp: makeProvider(), push: makeProvider() }, getApplicantIdsMatchedToScheme: async () => ['a', 'b', 'c'] })
    const result = await notifySchemeChange(deps, oldRule, { ...oldRule, version: 2, loanCap: 150000 })
    expect(result.notifiedCount).toBe(2)
    expect(result.failedCount).toBe(1)
  })

  it('respects the requested channel', async () => {
    const deps = makeDeps({ getApplicantIdsMatchedToScheme: async () => ['a'] })
    await notifySchemeChange(deps, oldRule, { ...oldRule, version: 2, interestRate: 9 }, 'whatsapp')
    expect(deps.providers.whatsapp.send).toHaveBeenCalledTimes(1)
    expect(deps.providers.sms.send).not.toHaveBeenCalled()
  })
})
