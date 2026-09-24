export type Locale = 'en' | 'hi' | 'ta'
export type LlmTier = 'fast' | 'strong'
export type NarrationSource = 'llm' | 'template'

// CLAUDE.md rule 3: every claim carries a source and a data-vintage label.
export interface GroundedClaim {
  text: string
  sourceId: string
  section: string
  sourceUrl: string
  dataVintage: string
  similarity: number
}

export interface ScoreFactor {
  labelKey: string
  value: number
}

// Every number the narration is allowed to mention. Built from *all*
// numeric fields the calculator/feasibility assembly produced — not just
// currency figures — so the post-generation validator (validator.ts) has a
// complete allow-list. The model receives these as structured fields and is
// instructed to reproduce them verbatim; it never computes a new one.
export interface NarrationInput {
  numbers: Record<string, number>
  factors: ScoreFactor[]
  schemeId: string
  schemeName: string
  groundedClaims: GroundedClaim[]
  locale: Locale
}

export interface NarrationResult {
  text: string
  narrationSource: NarrationSource
  tier?: LlmTier
}

export interface QueryRequestBody {
  question: string
  context?: {
    category?: string
    isWomanOwned?: boolean
    numbers?: Record<string, number>
    locale?: Locale
  }
}

export interface QueryResult {
  answer: string
  narrationSource: NarrationSource
  tier: LlmTier
  claims: GroundedClaim[]
}

// The model's own general-knowledge guess at demand/infrastructure/market
// for a district with no real ingested data — see promptBuilder.ts's
// buildFeasibilityEstimatePrompt for why this is a deliberate, narrow
// exception to "the LLM never computes." Each field is null if the model's
// response didn't parse, was out of range, or the call failed/timed out —
// feasibility/service.ts treats a null field exactly like "still excluded,"
// never a fabricated 0 standing in for a real absence.
export interface FeasibilityEstimate {
  demand: number | null
  infrastructure: number | null
  market: number | null
  reasoning: string | null
}
