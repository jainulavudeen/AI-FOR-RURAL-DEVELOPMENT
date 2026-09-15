// Scheme rule definitions used by calculator.ts.
//
// This is the static default rule set — it's what makes the offline client
// deterministic with no backend. Once the API's schemeRouter module is wired
// for real, the `scheme_rules` DB table (versioned, with validity dates)
// becomes the source of truth for server-audited reports; these values are
// what seeds that table's version 1 row. See CLAUDE.md — scheme rules are
// versioned so an old report stays reproducible after a rule change.

export interface SchemeRule {
  id: string
  nameKey: string
  icon: string
  projectCostMin: number
  projectCostMax: number
  loanCap: number
  interestRate: number
  tenureYears: number
  moratoriumMonths: number
}

export const SCHEMES = {
  micro_finance: {
    id: 'micro_finance',
    nameKey: 'scheme.micro_finance.name',
    icon: 'HandCoins',
    projectCostMin: 0,
    projectCostMax: 140000,
    loanCap: 125000,
    interestRate: 6.5,
    tenureYears: 3,
    moratoriumMonths: 3,
  },
  term_loan: {
    id: 'term_loan',
    nameKey: 'scheme.term_loan.name',
    icon: 'Landmark',
    projectCostMin: 140000,
    projectCostMax: 5000000,
    loanCap: 4500000,
    interestRate: 8,
    tenureYears: 7,
    moratoriumMonths: 6,
  },
} as const satisfies Record<string, SchemeRule>

export const MARGIN_PERCENT = 0.1
