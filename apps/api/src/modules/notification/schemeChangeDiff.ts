// Scheme-change alerts fire on a MATERIAL change — rate or cap — never on
// every scheme_rules write (a corrected typo in a scheme's tenure or
// moratorium field, say, shouldn't page every affected applicant). This is
// the gate: a pure diff, easy to reason about and test independent of any
// database or notification-sending concern.
export interface SchemeRuleSnapshot {
  schemeId: string
  version: number
  interestRate: number
  loanCap: number
}

export function isMaterialSchemeChange(oldRule: SchemeRuleSnapshot, newRule: SchemeRuleSnapshot): boolean {
  if (oldRule.schemeId !== newRule.schemeId) {
    throw new Error(`Cannot diff scheme_rules across different schemes ("${oldRule.schemeId}" vs "${newRule.schemeId}")`)
  }
  return oldRule.interestRate !== newRule.interestRate || oldRule.loanCap !== newRule.loanCap
}

// Plain-language SMS/WhatsApp-ready summary of what changed — short, no
// jargon, matches the target user's device/literacy constraints (CLAUDE.md).
export function describeSchemeChange(oldRule: SchemeRuleSnapshot, newRule: SchemeRuleSnapshot): string {
  const parts: string[] = []
  if (oldRule.interestRate !== newRule.interestRate) {
    parts.push(`interest rate changed from ${oldRule.interestRate}% to ${newRule.interestRate}%`)
  }
  if (oldRule.loanCap !== newRule.loanCap) {
    parts.push(`the maximum loan changed from Rs ${Math.round(oldRule.loanCap)} to Rs ${Math.round(newRule.loanCap)}`)
  }
  const schemeName = oldRule.schemeId === 'micro_finance' ? 'Micro Finance' : oldRule.schemeId === 'term_loan' ? 'Term Loan' : oldRule.schemeId
  return `Setu update: your matched scheme (${schemeName}) has changed — ${parts.join(' and ')}. Check your report for the latest numbers.`
}
