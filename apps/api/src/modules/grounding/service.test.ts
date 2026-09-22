import RedisMock from 'ioredis-mock'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LlmProvider, LlmTier } from '../../llm/client'
import type { EmbeddingProvider } from '../../llm/embeddingProvider'
import { narrateReport, query, queryWithClaims } from './service'
import type { NarrationInput, QueryRequestBody } from './types'

function makeLlmProvider(fn: LlmProvider['generate']): LlmProvider {
  return { generate: fn }
}

function makeEmbeddingProvider(): EmbeddingProvider {
  return { embed: async () => new Array(8).fill(0) }
}

// Mimics a drizzle chained query builder — every method returns the same
// thenable, `await`ing it resolves to `rows`. Same inline-fake-db technique
// as feasibility/service.test.ts, extended to a longer chain
// (select→from→innerJoin→where→orderBy→limit) for retrieval.ts's query.
function makeFakeDb(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: (rows: unknown[]) => void) => resolve(rows),
  }
  return chain
}

const baseInput: NarrationInput = {
  numbers: { loanAmount: 125000, emi: 3805, score: 78 },
  factors: [{ labelKey: 'results.factorDemand', value: 4 }],
  schemeId: 'micro_finance',
  schemeName: 'Micro Finance',
  groundedClaims: [],
  locale: 'en',
}

describe('narrateReport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the LLM narration and caches it when the output is valid', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const generate = vi.fn(async () => 'Your score is 78 with a loan of ₹1,25,000 and EMI ₹3,805.')
    const llmProvider = makeLlmProvider(generate)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await narrateReport({ db: {} as any, redis, llmProvider }, baseInput)

    expect(result.narrationSource).toBe('llm')
    expect(generate).toHaveBeenCalledTimes(1)
    const cachedKeys = await redis.keys('grounding:narration:*')
    expect(cachedKeys).toHaveLength(1)
  })

  it('skips the LLM entirely on a cache hit', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const generate = vi.fn(async () => 'Your score is 78.')
    const llmProvider = makeLlmProvider(generate)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = { db: {} as any, redis, llmProvider }

    const first = await narrateReport(deps, baseInput)
    expect(generate).toHaveBeenCalledTimes(1)

    const second = await narrateReport(deps, baseInput)
    expect(generate).toHaveBeenCalledTimes(1) // not called again
    expect(second.text).toBe(first.text)
  })

  it('falls back to the deterministic template when the LLM times out', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const llmProvider = makeLlmProvider(() => new Promise((resolve) => setTimeout(() => resolve('too slow'), 10_000)))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await narrateReport({ db: {} as any, redis, llmProvider }, baseInput)

    expect(result.narrationSource).toBe('template')
    expect(result.text).toContain('Micro Finance')
    expect(warnSpy).toHaveBeenCalled()
  }, 10_000)

  it('rejects a narration that invents a number and falls back to the template — the adversarial case', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    // A deliberately number-inventing mock model: ₹2,00,000 was never given.
    const llmProvider = makeLlmProvider(async () => 'We suggest a loan of ₹2,00,000 for your business.')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await narrateReport({ db: {} as any, redis, llmProvider }, baseInput)

    expect(result.narrationSource).toBe('template')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rejected'),
      expect.objectContaining({ invalid: expect.arrayContaining([200000]) })
    )
  })
})

describe('query — deterministic tier escalation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const body: QueryRequestBody = { question: 'Am I eligible for NSFDC?', context: { locale: 'en' } }

  it('uses the fast tier when retrieval finds one clear match', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const rows = [{ text: 'SC applicants qualify', section: 'Eligibility', schemeId: 'nsfdc', sourceUrl: 'https://nsfdc.nic.in', vintageLabel: '2024', distance: 0.1 }]
    let capturedTier: LlmTier | null = null
    const llmProvider = makeLlmProvider(async (tier) => {
      capturedTier = tier
      return 'SC applicants are eligible (NSFDC).'
    })

    await query(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: makeFakeDb(rows) as any, redis, llmProvider, embeddingProvider: makeEmbeddingProvider() },
      body
    )

    expect(capturedTier).toBe('fast')
  })

  it('escalates to the strong tier when retrieval similarity is weak (genuine ambiguity)', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const rows = [{ text: 'Unclear match', section: 'Eligibility', schemeId: 'nsfdc', sourceUrl: 'https://nsfdc.nic.in', vintageLabel: '2024', distance: 0.6 }]
    let capturedTier: LlmTier | null = null
    const llmProvider = makeLlmProvider(async (tier) => {
      capturedTier = tier
      return 'This needs more context.'
    })

    await query(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: makeFakeDb(rows) as any, redis, llmProvider, embeddingProvider: makeEmbeddingProvider() },
      body
    )

    expect(capturedTier).toBe('strong')
  })

  it('escalates to the strong tier when two different schemes are equally plausible', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const rows = [
      { text: 'SC applicants qualify', section: 'Eligibility', schemeId: 'nsfdc', sourceUrl: 'https://nsfdc.nic.in', vintageLabel: '2024', distance: 0.1 },
      { text: 'Woman-owned enterprises qualify', section: 'Eligibility', schemeId: 'jan_samarth', sourceUrl: 'https://jansamarth.in', vintageLabel: '2024', distance: 0.12 },
    ]
    let capturedTier: LlmTier | null = null
    const llmProvider = makeLlmProvider(async (tier) => {
      capturedTier = tier
      return 'Both may apply.'
    })

    await query(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: makeFakeDb(rows) as any, redis, llmProvider, embeddingProvider: makeEmbeddingProvider() },
      body
    )

    expect(capturedTier).toBe('strong')
  })

  it('degrades to the fallback answer, never throwing, when the LLM is unreachable', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const rows: unknown[] = []
    const llmProvider = makeLlmProvider(async () => {
      throw new Error('unreachable')
    })

    const result = await query(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: makeFakeDb(rows) as any, redis, llmProvider, embeddingProvider: makeEmbeddingProvider() },
      body
    )

    expect(result.narrationSource).toBe('template')
    expect(result.answer.length).toBeGreaterThan(0)
  })
})

describe('queryWithClaims — the advisorSaathi seam', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const callerClaims = [
    {
      text: 'Your ledger shows ₹52,000 average monthly sales over the last 90 days.',
      sourceId: 'ledger',
      section: 'cashflow',
      sourceUrl: '',
      dataVintage: '2026-09',
      similarity: 1,
    },
  ]

  it('never touches retrieval/the db — trusts the caller-supplied claims entirely', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const generate = vi.fn(async () => 'Your average monthly sales are ₹52,000.')
    const llmProvider = makeLlmProvider(generate)

    // db is deliberately `undefined` here — if queryWithClaims ever called
    // retrieveGroundedClaims internally (the way query() does), this would
    // throw immediately rather than silently succeed.
    const result = await queryWithClaims(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: undefined as any, redis, llmProvider },
      { question: 'What are my average sales?', claims: callerClaims, numbers: { avgMonthlySales: 52000 }, locale: 'en' }
    )

    expect(result.narrationSource).toBe('llm')
    expect(result.claims).toBe(callerClaims)
  })

  it('never caches — two calls with identical input both hit the LLM', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const generate = vi.fn(async () => 'Your average monthly sales are ₹52,000.')
    const llmProvider = makeLlmProvider(generate)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps = { db: undefined as any, redis, llmProvider }
    const input = { question: 'What are my average sales?', claims: callerClaims, numbers: { avgMonthlySales: 52000 }, locale: 'en' as const }

    await queryWithClaims(deps, input)
    await queryWithClaims(deps, input)

    expect(generate).toHaveBeenCalledTimes(2)
    const cachedKeys = await redis.keys('grounding:*')
    expect(cachedKeys).toHaveLength(0)
  })

  it('rejects an answer that invents a number outside the caller-supplied numbers map', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const llmProvider = makeLlmProvider(async () => 'Your average monthly sales are ₹99,000.')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await queryWithClaims(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: undefined as any, redis, llmProvider },
      { question: 'What are my average sales?', claims: callerClaims, numbers: { avgMonthlySales: 52000 }, locale: 'en' }
    )

    expect(result.narrationSource).toBe('template')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rejected'), expect.objectContaining({ invalid: [99000] }))
  })
})
