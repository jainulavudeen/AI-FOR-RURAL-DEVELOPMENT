// Builds the full-report narration text — read aloud in-language, not just
// the numbers: the business/location context, the score and verdict, the
// scheme match and EMI, and the top local insight, strung into plain
// sentences. Every number in here is read straight from the already-
// computed report (feasibility/finance/schedule) passed in by Results.jsx
// — this never computes or estimates anything itself (THE NON-NEGOTIABLE
// BOUNDARY, CLAUDE.md rule 1/2: narration only narrates numbers the
// calculator already produced).
export function buildReportNarration(t, { business, feasibility, finance, schedule, stateName, districtName, blockName }) {
  const sentences = []

  sentences.push(
    t('narration.intro', {
      business: t(business.labelKey),
      block: blockName,
      district: districtName,
      state: stateName,
    })
  )

  sentences.push(t('narration.score', { score: feasibility.score, verdict: t(feasibility.verdictKey) }))

  if (feasibility.insights[0]) {
    sentences.push(t(feasibility.insights[0].textKey, { value: feasibility.insights[0].value }))
  }

  sentences.push(
    t('narration.scheme', {
      scheme: t(finance.scheme.nameKey),
      loanAmount: Math.round(finance.loanAmount),
      rate: finance.scheme.interestRate,
    })
  )

  sentences.push(t('narration.emi', { emi: Math.round(schedule.emi), months: finance.scheme.tenureYears * 12 }))

  if (finance.scheme.moratoriumMonths > 0) {
    sentences.push(t('narration.moratorium', { months: finance.scheme.moratoriumMonths }))
  }

  return sentences.join(' ')
}
