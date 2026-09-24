import type { GroundedClaim, Locale, NarrationInput } from './types'

export interface FeasibilityEstimateContext {
  businessLabel: string
  stateName: string
  districtName: string
}

const LOCALE_NAME: Record<Locale, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil' }

const SHARED_RULES = `You explain numbers, you never invent or recalculate them. Every number in your
response MUST be copied exactly, character-for-character in value, from the "Numbers" section
given to you — do not round differently, do not compute a new figure, do not restate a number
in a different unit. If you are not given a number, do not state one. Cite retrieved sources by
their sourceId in parentheses when you use them, e.g. "(NSFDC)". Keep the response short (3-5
sentences) and written in plain, simple language a first-time smartphone user can follow.`

function formatClaims(claims: GroundedClaim[]): string {
  if (claims.length === 0) return '(none retrieved)'
  return claims.map((c) => `- [${c.sourceId} — ${c.section}, ${c.dataVintage}] ${c.text}`).join('\n')
}

// Report narration: reproduce the given numbers verbatim, explain WHY the
// calculator produced them using the retrieved eligibility text.
export function buildNarrationPrompt(input: NarrationInput): { system: string; user: string } {
  const system = `You are Setu's report narrator. ${SHARED_RULES} Respond in ${LOCALE_NAME[input.locale]}.`

  const numbersBlock = Object.entries(input.numbers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  const factorsBlock = input.factors.map((f) => `${f.labelKey}: ${f.value}`).join('\n')

  const user = `Scheme: ${input.schemeName} (id: ${input.schemeId})

Numbers (reproduce these exactly, never compute new ones):
${numbersBlock}

Score factors:
${factorsBlock}

Retrieved eligibility context:
${formatClaims(input.groundedClaims)}

Explain in plain language why this applicant matches this scheme and what these numbers mean for them.`

  return { system, user }
}

// Eligibility Q&A ("what if I lower my margin", "am I eligible as an OBC
// woman entrepreneur"): same rule — any number in `context.numbers` is
// reproducible verbatim; the model must never compute a fresh one. A
// what-if that requires a new number must be re-answered by the caller
// re-invoking the calculator and calling this again with fresh numbers —
// this module never calls @setu/core itself.
export function buildQueryPrompt(
  question: string,
  claims: GroundedClaim[],
  locale: Locale,
  numbers?: Record<string, number>
): { system: string; user: string } {
  const system = `You are Setu's eligibility assistant. ${SHARED_RULES} Respond in ${LOCALE_NAME[locale]}. If the retrieved context does not clearly answer the question, say so honestly rather than guessing.`

  const numbersBlock = numbers && Object.keys(numbers).length > 0
    ? Object.entries(numbers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    : '(none provided)'

  const user = `Question: ${question}

Numbers available (reproduce these exactly if relevant, never compute new ones):
${numbersBlock}

Retrieved eligibility context:
${formatClaims(claims)}

Answer the question, citing sources by sourceId.`

  return { system, user }
}

// The ONE place in this app where the model is deliberately asked to
// produce a number rather than narrate one already computed — a real,
// explicit exception to boundary rule 2, only for districts where no real
// Census/Agmarknet/NRLM data exists at all (see feasibility/service.ts).
// Every value it returns is permanently labelled 'ai_estimated' —
// visually and in the API response — never merged into or presented as
// 'real'. Strict JSON output, strict ranges the caller clamps regardless
// of what's returned, and any parse failure degrades to "still excluded"
// exactly like a real signal that didn't resolve.
export function buildFeasibilityEstimatePrompt(context: FeasibilityEstimateContext): { system: string; user: string } {
  const system = `You are estimating hyper-local business context from general knowledge, for a rural
entrepreneur in India who has no access to official statistics for their area. You are NOT
retrieving real data — you have none. Give your best honest general-knowledge estimate, the way
a well-informed local business advisor would reason about a district they've heard of but don't
have current data for. Respond with ONLY a single JSON object, no prose before or after, no
markdown code fences, in exactly this shape:
{"demand": <integer -7 to 7>, "infrastructure": <integer -6 to 6>, "market": <integer -5 to 5>, "reasoning": "<one short sentence in English>"}
demand: local market demand for this business type relative to a typical Indian district (0 = typical, negative = weaker, positive = stronger).
infrastructure: general physical/utility infrastructure access relative to a typical Indian block (roads, power, water).
market: market linkages and community financial infrastructure (cooperatives, SHGs, formal credit access) relative to a typical Indian block.
If you genuinely have no basis to estimate a field, use 0 rather than guessing wildly — 0 means "assume typical," not "definitely typical."`

  const user = `Business type: ${context.businessLabel}
State: ${context.stateName}
District: ${context.districtName}

Estimate demand/infrastructure/market for this business type in this district, as the JSON object described.`

  return { system, user }
}
