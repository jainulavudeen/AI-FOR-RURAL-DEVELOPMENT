import { BASE_SCORE, structureFinance } from '@setu/core'

// A *99#-style USSD eligibility check — same calculator, different skin.
// structureFinance() only ever takes a margin figure (see
// packages/core/src/calculator.ts) and never forks that logic; the
// business-type step below feeds BASE_SCORE, the same real shared baseline
// constant apps/web's mock feasibility score is seeded from (not a number
// invented for USSD) — picking a business type here gives a genuine,
// if minimal, viability signal alongside the real EMI structuring.
//
// GSM USSD screens are conventionally capped at 182 characters, and the
// character set doesn't reliably support ₹ — every screen here is plain
// ASCII, "Rs" instead of ₹, and checked against the limit in tests.
export const MAX_SCREEN_CHARS = 182

// Short menu labels, not the app's full i18n business.<id>.name strings —
// USSD screens have no room for them, and (see HANDOVER.md) this pass
// doesn't add USSD language selection, so these stay English-only for now.
const BUSINESS_MENU: { id: string; label: string }[] = Object.keys(BASE_SCORE).map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}))

export type UssdStep = 'business' | 'margin' | 'done'

export interface UssdSession {
  step: UssdStep
  businessId?: string
}

export function initialSession(): UssdSession {
  return { step: 'business' }
}

export interface UssdTurnResult {
  session: UssdSession
  screen: string
  continueSession: boolean
}

function businessMenuScreen(errorNote?: string): string {
  const lines = BUSINESS_MENU.map((b, i) => `${i + 1} ${b.label}`)
  const header = errorNote ? `${errorNote}\nSetu Eligibility Check` : 'Setu Eligibility Check'
  return [header, ...lines].join('\n')
}

function marginScreen(errorNote?: string): string {
  const prompt = 'Enter your margin money in Rs, e.g. 20000'
  return errorNote ? `${errorNote}\n${prompt}` : prompt
}

function resultScreen(businessId: string, margin: number): string {
  const finance = structureFinance(margin)
  const baseline = BASE_SCORE[businessId] ?? '-'
  const schemeName = finance.scheme.id === 'micro_finance' ? 'Micro Finance' : 'Term Loan'
  return [
    `Baseline score ${baseline}/100`,
    `Project Rs ${Math.round(finance.projectCost)}`,
    `Loan Rs ${Math.round(finance.loanAmount)}`,
    `Scheme: ${schemeName}`,
    'Dial again for another check',
  ].join('\n')
}

// One input per turn — the gateway/session layer (service.ts) is
// responsible for loading the prior session and persisting the result;
// this function is pure and synchronous, trivially testable without Redis.
export function handleInput(session: UssdSession, rawInput: string): UssdTurnResult {
  const input = rawInput.trim()

  if (session.step === 'business') {
    const choice = Number(input)
    const picked = Number.isInteger(choice) ? BUSINESS_MENU[choice - 1] : undefined
    if (!picked) {
      return { session, screen: businessMenuScreen('Invalid choice.'), continueSession: true }
    }
    const nextSession: UssdSession = { step: 'margin', businessId: picked.id }
    return { session: nextSession, screen: marginScreen(), continueSession: true }
  }

  if (session.step === 'margin') {
    const margin = Number(input)
    if (!Number.isFinite(margin) || margin <= 0) {
      return { session, screen: marginScreen('Please enter a number greater than 0.'), continueSession: true }
    }
    const businessId = session.businessId
    if (!businessId) {
      // Unreachable via the public API (margin step always carries a
      // businessId — see the transition above), kept only so this function
      // stays total rather than throwing on a malformed session record.
      return { session: initialSession(), screen: businessMenuScreen('Session reset.'), continueSession: true }
    }
    return { session: { step: 'done' }, screen: resultScreen(businessId, margin), continueSession: false }
  }

  // step === 'done': any further input in the same session starts fresh.
  return { session: initialSession(), screen: businessMenuScreen(), continueSession: true }
}

export function entryScreen(): string {
  return businessMenuScreen()
}
