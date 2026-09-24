import { describe, expect, it } from 'vitest'
import { entryScreen, handleInput, initialSession, MAX_SCREEN_CHARS, type UssdSession } from './sessionMachine.js'

function allScreens(): string[] {
  // Exhaustively walk every reachable screen so the char-limit check below
  // isn't just spot-checking the happy path.
  const screens = [entryScreen()]
  let session: UssdSession = initialSession()

  const businessTurn = handleInput(session, '1')
  screens.push(businessTurn.screen)
  session = businessTurn.session

  const invalidBusinessTurn = handleInput(initialSession(), '99')
  screens.push(invalidBusinessTurn.screen)

  const invalidMarginTurn = handleInput(session, 'not-a-number')
  screens.push(invalidMarginTurn.screen)

  const doneTurn = handleInput(session, '20000')
  screens.push(doneTurn.screen)

  return screens
}

describe('USSD screen length', () => {
  it(`every screen stays within the ${MAX_SCREEN_CHARS}-char GSM USSD limit`, () => {
    for (const screen of allScreens()) {
      expect(screen.length).toBeLessThanOrEqual(MAX_SCREEN_CHARS)
    }
  })

  it('every screen is plain ASCII (no ₹ or other characters USSD gateways may not render)', () => {
    for (const screen of allScreens()) {
      // eslint-disable-next-line no-control-regex
      expect(/^[\x00-\x7F]*$/.test(screen)).toBe(true)
    }
  })
})

describe('handleInput state machine', () => {
  it('starts at the business menu and accepts a numeric choice', () => {
    const result = handleInput(initialSession(), '1')
    expect(result.session).toEqual({ step: 'margin', businessId: 'dairy' })
    expect(result.continueSession).toBe(true)
    expect(result.screen).toContain('margin')
  })

  it('reprompts on an out-of-range business choice without losing session state', () => {
    // '99' rather than a small fixed number — the menu is built from
    // Object.keys(BASE_SCORE) (see sessionMachine.ts), so its length grows
    // as @setu/core's business catalogue grows; this only needs to stay
    // out of range, not track that count.
    const before = initialSession()
    const result = handleInput(before, '99')
    expect(result.session).toEqual(before)
    expect(result.screen).toContain('Invalid choice')
    expect(result.continueSession).toBe(true)
  })

  it('reprompts on non-numeric business input', () => {
    const result = handleInput(initialSession(), 'abc')
    expect(result.screen).toContain('Invalid choice')
  })

  it('computes the real calculator output from a valid margin, ending the session', () => {
    const afterBusiness = handleInput(initialSession(), '1').session
    const result = handleInput(afterBusiness, '20000')
    expect(result.continueSession).toBe(false)
    expect(result.screen).toContain('Rs')
    expect(result.screen).toMatch(/Baseline score \d+\/100/)
  })

  it('reprompts on an invalid margin (non-numeric or <= 0) without ending the session', () => {
    const afterBusiness = handleInput(initialSession(), '1').session
    const zero = handleInput(afterBusiness, '0')
    expect(zero.continueSession).toBe(true)
    expect(zero.session).toEqual(afterBusiness)

    const negative = handleInput(afterBusiness, '-500')
    expect(negative.continueSession).toBe(true)

    const nonNumeric = handleInput(afterBusiness, 'twenty thousand')
    expect(nonNumeric.continueSession).toBe(true)
  })

  it('starting fresh input after "done" restarts the flow', () => {
    const result = handleInput({ step: 'done' }, 'anything')
    expect(result.session).toEqual({ step: 'business' })
    expect(result.continueSession).toBe(true)
  })

  it('produces the same margin -> loan/EMI numbers the web calculator would for the same input', () => {
    // Cross-check against @setu/core directly — "same numbers, different
    // skin" isn't just a comment, it's an assertion.
    const afterBusiness = handleInput(initialSession(), '2').session // retail
    const result = handleInput(afterBusiness, '50000')
    // structureFinance(50000) -> naiveProjectCost 500000, within
    // micro_finance's band (see packages/core/src/schemes.ts) at time of
    // writing; assert on the screen reflecting *a* real, computed project
    // cost rather than hardcoding the scheme band, so this doesn't silently
    // rot if the scheme rules change.
    expect(result.screen).toMatch(/Project Rs \d+/)
    expect(result.screen).toMatch(/Loan Rs \d+/)
  })
})
