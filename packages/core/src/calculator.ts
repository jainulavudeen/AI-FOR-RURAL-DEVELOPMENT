import { SCHEMES, MARGIN_PERCENT, type SchemeRule } from './schemes'

/**
 * Core structuring logic.
 *
 * The applicant's available margin capital is always 10% of the project
 * cost. From that we derive the naive project cost (margin * 10) and route
 * to a scheme by project-cost band. If the resulting loan amount exceeds
 * the scheme's loan cap, the loan is capped and the project cost is
 * recomputed as margin + capped loan — which raises the applicant's
 * effective margin contribution above 10%. This mirrors the
 * ₹14,000 → ₹1,25,000 example: a ₹14,000 margin implies a ₹1,40,000
 * project (loan ₹1,26,000), but the Micro Finance loan cap of ₹1,25,000
 * pulls the project cost down to ₹1,39,000.
 *
 * THE NON-NEGOTIABLE BOUNDARY (see CLAUDE.md): this file is deterministic
 * and synchronous. No network call, no LLM, ever, decides a rupee figure
 * a user sees. This exact code runs on the client (offline) and on the
 * server (audit) — do not fork this logic.
 */

export interface StructureFinanceResult {
  scheme: SchemeRule
  projectCost: number
  loanAmount: number
  marginAmount: number
  marginPercentActual: number
  capped: boolean
  naiveProjectCost: number
  naiveLoan: number
}

export function structureFinance(marginCapital: number): StructureFinanceResult {
  const margin = Math.max(0, Number(marginCapital) || 0)
  const naiveProjectCost = margin / MARGIN_PERCENT

  const scheme: SchemeRule =
    naiveProjectCost <= SCHEMES.micro_finance.projectCostMax ? SCHEMES.micro_finance : SCHEMES.term_loan

  const naiveLoan = naiveProjectCost - margin
  let loanAmount = naiveLoan
  let projectCost = naiveProjectCost
  let capped = false

  if (naiveLoan > scheme.loanCap) {
    loanAmount = scheme.loanCap
    projectCost = margin + loanAmount
    capped = true
  }

  const marginAmount = projectCost - loanAmount
  const marginPercentActual = projectCost > 0 ? marginAmount / projectCost : MARGIN_PERCENT

  return {
    scheme,
    projectCost,
    loanAmount,
    marginAmount,
    marginPercentActual,
    capped,
    naiveProjectCost,
    naiveLoan,
  }
}

function monthlyEmi(principal: number, annualRatePercent: number, months: number): number {
  if (months <= 0) return 0
  const r = annualRatePercent / 12 / 100
  if (r === 0) return principal / months
  const factor = Math.pow(1 + r, months)
  return (principal * r * factor) / (factor - 1)
}

export interface EmiInput {
  loanAmount: number
  interestRate: number
  tenureYears: number
  moratoriumMonths: number
}

export interface EmiResult {
  emi: number
  repaymentMonths: number
  moratoriumInterest: number
}

export function computeEmi({ loanAmount, interestRate, tenureYears, moratoriumMonths }: EmiInput): EmiResult {
  const repaymentMonths = tenureYears * 12 - moratoriumMonths
  const emi = monthlyEmi(loanAmount, interestRate, repaymentMonths)
  const moratoriumInterest = loanAmount * (interestRate / 12 / 100)
  return { emi, repaymentMonths, moratoriumInterest }
}

export interface EmiScheduleRow {
  month: number
  isMoratorium: boolean
  opening: number
  interest: number
  principal: number
  payment: number
  closing: number
}

export interface EmiScheduleResult {
  rows: EmiScheduleRow[]
  emi: number
  repaymentMonths: number
}

export function buildEmiSchedule(
  { loanAmount, interestRate, tenureYears, moratoriumMonths }: EmiInput,
  monthsToShow = 6
): EmiScheduleResult {
  const r = interestRate / 12 / 100
  const { emi, repaymentMonths } = computeEmi({ loanAmount, interestRate, tenureYears, moratoriumMonths })

  const rows: EmiScheduleRow[] = []
  let balance = loanAmount

  for (let m = 1; m <= monthsToShow; m += 1) {
    if (m <= moratoriumMonths) {
      const interest = balance * r
      rows.push({
        month: m,
        isMoratorium: true,
        opening: balance,
        interest,
        principal: 0,
        payment: interest,
        closing: balance,
      })
    } else {
      const interest = balance * r
      const principal = Math.min(emi - interest, balance)
      const closing = Math.max(balance - principal, 0)
      rows.push({
        month: m,
        isMoratorium: false,
        opening: balance,
        interest,
        principal,
        payment: emi,
        closing,
      })
      balance = closing
    }
  }

  return { rows, emi, repaymentMonths }
}
