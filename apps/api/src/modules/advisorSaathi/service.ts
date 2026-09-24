import { schemeEnglishLabel, type LedgerTransaction } from '@setu/core'
import { queryWithClaims, type GroundingDeps } from '../grounding/service'
import { retrieveGroundedClaims } from '../grounding/retrieval'
import type { GroundedClaim, Locale } from '../grounding/types'
import { createEmbeddingProvider } from '../../llm/embeddingProvider'
import { buildFinancialSnapshot, type ApplicantSelection, type FinancialSnapshot } from '../../lib/financialSnapshot'
import type { ChatRequestBody, ChatResult } from './types'

export class ValidationError extends Error {
  statusCode = 400
  code = 'BAD_REQUEST'
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// Extends GroundingDeps (db/redis/llmProvider/embeddingProvider) with the
// one extra thing this module needs: the caller's own ledger rows. Never
// imports llm/client.ts itself — only grounding/service.ts does (CLAUDE.md
// boundary rule 2) — this module calls queryWithClaims(), the sibling seam
// built for exactly this purpose.
export interface AdvisorSaathiDeps extends GroundingDeps {
  getTransactionsByApplicantId: (applicantId: string) => Promise<LedgerTransaction[]>
}

function humanizeId(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Turns a FinancialSnapshot into the exact claims+numbers pair
// queryWithClaims (and, through it, the numeric-token validator) needs.
// Every number that could plausibly appear in the model's answer is in
// `numbers` — nothing here is left for the model to compute (rule 2).
// Similarity values are deliberately spread out (1.0 down to ~0.75, never
// clustering within decideTier's epsilon of each other) rather than
// reflecting real retrieval confidence — there's no retrieval-ambiguity
// concept for caller-supplied facts, so this keeps the tier decision at
// 'fast' by default instead of accidentally escalating every call to the
// expensive strong tier just because multiple distinct facts are present.
function buildClaimsAndNumbers(
  snapshot: FinancialSnapshot,
  selection: ApplicantSelection
): { claims: GroundedClaim[]; numbers: Record<string, number> } {
  const vintage = snapshot.asOfDate.slice(0, 10)
  const { summary, creditScore, topMatches, loanSanctionProbabilities, upcomingFestivals, finance, emi } = snapshot

  const round1 = (n: number) => Math.round(n * 10) / 10

  const numbers: Record<string, number> = {
    totalSales: summary.totalSales,
    totalExpenses: summary.totalExpenses,
    netSurplus: summary.netSurplus,
    netMarginPercent: round1(summary.netMarginPercent),
    pendingUdhaar: summary.pendingUdhaar,
    udhaarRecoveryRatePercent: round1(summary.udhaarRecoveryRatePercent),
    digitalSharePercent: round1(summary.digitalSharePercent),
    activeDayCount: summary.activeDayCount,
    creditScore: creditScore.score,
    projectCost: Math.round(finance.projectCost),
    loanAmount: Math.round(finance.loanAmount),
    marginAmount: Math.round(finance.marginAmount),
    interestRatePercent: finance.scheme.interestRate,
    tenureYears: finance.scheme.tenureYears,
    moratoriumMonths: finance.scheme.moratoriumMonths,
    emi: Math.round(emi.emi),
  }

  const claims: GroundedClaim[] = [
    {
      text: `Over the applicant's logged Bahi-Khata history, total sales were ₹${summary.totalSales}, total expenses ₹${summary.totalExpenses}, net surplus ₹${summary.netSurplus} (${numbers.netMarginPercent}% margin). Pending customer udhaar is ₹${summary.pendingUdhaar} with a ${numbers.udhaarRecoveryRatePercent}% recovery rate. ${numbers.digitalSharePercent}% of sales were paid via UPI, across ${summary.activeDayCount} distinct logged days.`,
      sourceId: 'ledger',
      section: 'Bahi-Khata cash flow',
      sourceUrl: '',
      dataVintage: vintage,
      similarity: 1.0,
    },
    {
      text: `The applicant's explainable alternative credit score is ${creditScore.score} out of 850. Pillar breakdown: ${creditScore.pillars.map((p) => `${humanizeId(p.id)} ${p.achievedPercent}%`).join(', ')}.`,
      sourceId: 'creditScore',
      section: 'Vikasit Saathi Credit Score',
      sourceUrl: '',
      dataVintage: vintage,
      similarity: 0.92,
    },
    {
      text: `Based on a margin capital of ₹${Math.round(selection.margin ?? 0) || Math.round(finance.marginAmount)}, the structured finance is: project cost ₹${numbers.projectCost}, loan amount ₹${numbers.loanAmount} (${schemeEnglishLabel(finance.scheme.id)}), margin ₹${numbers.marginAmount}, interest rate ${numbers.interestRatePercent}%, tenure ${numbers.tenureYears} years with a ${numbers.moratoriumMonths}-month moratorium. The resulting monthly EMI after moratorium is ₹${numbers.emi}.`,
      sourceId: 'calculator',
      section: 'Loan structuring',
      sourceUrl: '',
      dataVintage: vintage,
      similarity: 0.95,
    },
    {
      text: `The applicant operates a ${humanizeId(selection.businessId ?? 'unspecified business')} business${
        selection.districtId ? ` in ${humanizeId(selection.districtId)}` : ''
      }${selection.stateId ? `, ${humanizeId(selection.stateId)}` : ''}.`,
      sourceId: 'applicantProfile',
      section: 'Business & location',
      sourceUrl: '',
      dataVintage: vintage,
      similarity: 0.9,
    },
  ]

  topMatches.forEach((match, idx) => {
    numbers[`matchScore_${idx}`] = match.matchScore
    const prob = loanSanctionProbabilities.find((p) => p.schemeId === match.scheme.id)
    if (prob?.probabilityPercent != null) numbers[`sanctionProbability_${idx}`] = prob.probabilityPercent
    claims.push({
      text: `Scheme match #${idx + 1}: ${schemeEnglishLabel(match.scheme.id)}, a ${match.matchScore}% match${
        prob?.probabilityPercent != null ? `, ${prob.probabilityPercent}% estimated loan sanction probability` : ''
      }.`,
      sourceId: 'schemeMatch',
      section: `Rank ${idx + 1}`,
      sourceUrl: '',
      dataVintage: vintage,
      similarity: 0.85 - idx * 0.03,
    })
  })

  upcomingFestivals.slice(0, 2).forEach((festival, idx) => {
    numbers[`festivalSurgePercent_${idx}`] = festival.demandSurgePercent
    numbers[`festivalDaysLeft_${idx}`] = festival.daysLeft
    claims.push({
      text: `Upcoming demand shift: ${humanizeId(festival.id)} in ${festival.daysLeft} days — an editorial seasonal estimate of +${festival.demandSurgePercent}% demand, not sourced retrieval data.`,
      sourceId: 'festivalCalendar',
      section: 'Seasonal demand estimate',
      sourceUrl: '',
      dataVintage: vintage,
      similarity: 0.75 - idx * 0.03,
    })
  })

  return { claims, numbers }
}

export async function chat(deps: AdvisorSaathiDeps, applicantId: string, body: ChatRequestBody): Promise<ChatResult> {
  if (!body.question?.trim()) {
    throw new ValidationError('question is required')
  }

  const selection = body.selection ?? {}
  const transactions = await deps.getTransactionsByApplicantId(applicantId)
  const snapshot = buildFinancialSnapshot(transactions, selection)
  const { claims, numbers } = buildClaimsAndNumbers(snapshot, selection)
  const locale: Locale = body.locale ?? 'en'

  // Grounds eligibility-shaped questions ("what documents do I need",
  // "am I eligible") in the real ingested scheme corpus (retrieval.ts —
  // the same pgvector search POST /grounding/query uses), on top of the
  // applicant's own figures above. Never throws (retrieveGroundedClaims
  // degrades to []) and never imports llm/client.ts itself — only
  // grounding/service.ts does (CLAUDE.md boundary rule 2); this is a plain
  // retrieval call, not a model call.
  const embeddingProvider = deps.embeddingProvider ?? createEmbeddingProvider()
  const retrievedClaims = await retrieveGroundedClaims(
    { db: deps.db, embeddingProvider },
    body.question,
    { category: selection.categoryId ?? undefined, isWomanOwned: selection.isWomanOwned }
  )
  const allClaims = [...claims, ...retrievedClaims]

  const result = await queryWithClaims(deps, { question: body.question, claims: allClaims, numbers, locale })

  return { answer: result.answer, narrationSource: result.narrationSource, tier: result.tier, claims: allClaims, numbers }
}
