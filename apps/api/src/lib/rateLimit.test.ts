import { createFakeRedis } from '../testUtils/fakeRedis'
import { describe, expect, it } from 'vitest'
import { checkAndIncrement, checkCooldown } from './rateLimit'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('checkAndIncrement', () => {
  it('allows calls up to the limit and blocks the next one', async () => {
    const redis = createFakeRedis()
    const key = 'test:counter'

    for (let i = 0; i < 3; i += 1) {
      const result = await checkAndIncrement(redis, key, 3, 60)
      expect(result.allowed).toBe(true)
    }

    const fourth = await checkAndIncrement(redis, key, 3, 60)
    expect(fourth.allowed).toBe(false)
    expect(fourth.remaining).toBe(0)
  })

  it('resets once the window actually elapses', async () => {
    const redis = createFakeRedis()
    const key = 'test:window'

    const first = await checkAndIncrement(redis, key, 1, 1)
    expect(first.allowed).toBe(true)

    const second = await checkAndIncrement(redis, key, 1, 1)
    expect(second.allowed).toBe(false)

    await sleep(1100)

    const third = await checkAndIncrement(redis, key, 1, 1)
    expect(third.allowed).toBe(true)
  })
})

describe('checkCooldown', () => {
  it('blocks a second call within the cooldown window', async () => {
    const redis = createFakeRedis()
    const key = 'test:cooldown'

    const first = await checkCooldown(redis, key, 60)
    expect(first.allowed).toBe(true)

    const second = await checkCooldown(redis, key, 60)
    expect(second.allowed).toBe(false)
    expect(second.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('allows again once the cooldown actually elapses', async () => {
    const redis = createFakeRedis()
    const key = 'test:cooldown-elapse'

    await checkCooldown(redis, key, 1)
    await sleep(1100)

    const result = await checkCooldown(redis, key, 1)
    expect(result.allowed).toBe(true)
  })
})
