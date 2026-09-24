import { createFakeRedis } from '../../testUtils/fakeRedis.js'
import { describe, expect, it } from 'vitest'
import { processUssdTurn } from './service.js'

describe('processUssdTurn', () => {
  it('shows the entry menu on true first contact (empty input, no prior session)', async () => {
    const redis = createFakeRedis()
    const result = await processUssdTurn(redis as never, 'session-1', '')
    expect(result.continueSession).toBe(true)
    expect(result.screen).toContain('Setu Eligibility Check')
  })

  it('persists session state across turns using the same sessionId', async () => {
    const redis = createFakeRedis()
    await processUssdTurn(redis as never, 'session-2', '')
    const afterBusiness = await processUssdTurn(redis as never, 'session-2', '1')
    expect(afterBusiness.screen).toContain('margin')

    const final = await processUssdTurn(redis as never, 'session-2', '20000')
    expect(final.continueSession).toBe(false)
    expect(final.screen).toContain('Scheme:')
  })

  it('keeps two concurrent sessions independent', async () => {
    const redis = createFakeRedis()
    await processUssdTurn(redis as never, 'session-a', '')
    await processUssdTurn(redis as never, 'session-a', '1') // session-a now on margin step

    const sessionBEntry = await processUssdTurn(redis as never, 'session-b', '')
    expect(sessionBEntry.screen).toContain('Setu Eligibility Check') // unaffected by session-a's progress
  })

  it('deletes the session record once the flow completes (no dangling state)', async () => {
    const redis = createFakeRedis()
    await processUssdTurn(redis as never, 'session-3', '')
    await processUssdTurn(redis as never, 'session-3', '1')
    await processUssdTurn(redis as never, 'session-3', '20000')
    expect(await redis.get('ussd:session:session-3')).toBeNull()
  })

  it('degrades to a fresh session if Redis reads fail, rather than hanging or erroring', async () => {
    const redis = createFakeRedis()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(redis as any).get = async () => {
      throw new Error('redis down')
    }
    const result = await processUssdTurn(redis as never, 'session-4', '')
    expect(result.screen).toContain('Setu Eligibility Check')
  })
})
