import { describe, expect, it } from 'vitest'
import { getPeerBenchmark, K_ANONYMITY_THRESHOLD } from './peerBenchmark'

// Drizzle's chainable query builder is mocked by hand here rather than
// pulled in for real — the point under test is the k-anonymity gate and
// the shape of what's returned above/below it, not Postgres itself
// (integration coverage against a real Postgres lives elsewhere in this
// repo's test setup). `select` is called twice when the cohort clears the
// threshold (aggregate, then scheme distribution) and once when it doesn't
// (aggregate only, short-circuited before the distribution query).
function makeDb(cohortSize: number, medianScore: number, distribution: { schemeId: string; count: number }[]) {
  let call = 0
  return {
    select: () => {
      call += 1
      const isAggregateCall = call === 1
      const rows = isAggregateCall ? [{ cohortSize, medianScore }] : distribution
      const builder = {
        from: () => ({
          where: () => (isAggregateCall ? Promise.resolve(rows) : { groupBy: () => Promise.resolve(rows) }),
        }),
      }
      return builder
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('getPeerBenchmark', () => {
  it(`returns { available: false } when the cohort is below the k=${K_ANONYMITY_THRESHOLD} threshold`, async () => {
    const db = makeDb(K_ANONYMITY_THRESHOLD - 1, 70, [])
    const result = await getPeerBenchmark(db, { businessId: 'dairy', districtId: 'madurai', verdictKey: 'verdict.moderate' })
    expect(result).toEqual({ available: false })
  })

  it('returns the aggregate once the cohort meets the threshold exactly', async () => {
    const db = makeDb(K_ANONYMITY_THRESHOLD, 70, [{ schemeId: 'micro_finance', count: K_ANONYMITY_THRESHOLD }])
    const result = await getPeerBenchmark(db, { businessId: 'dairy', districtId: 'madurai', verdictKey: 'verdict.moderate' })
    expect(result).toEqual({
      available: true,
      cohortSize: K_ANONYMITY_THRESHOLD,
      medianScore: 70,
      schemeDistribution: [{ schemeId: 'micro_finance', count: K_ANONYMITY_THRESHOLD }],
    })
  })

  it('never queries the (identity-shaped) scheme distribution when the cohort is too small', async () => {
    let selectCalls = 0
    const db = {
      select: () => {
        selectCalls += 1
        return { from: () => ({ where: () => Promise.resolve([{ cohortSize: 2, medianScore: 70 }]) }) }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    await getPeerBenchmark(db, { businessId: 'dairy', districtId: 'madurai', verdictKey: 'verdict.moderate' })
    expect(selectCalls).toBe(1)
  })
})
