import type { Locale } from '../grounding/types.js'
import type { ApplicantSelection } from '../../lib/financialSnapshot.js'

// applicantId is deliberately absent — always request.user.sub, never
// client-supplied. `selection` mirrors apps/web's AppDataContext shape —
// see financialSnapshot.ts's header for why this (non-financial, routing-
// only) piece has to be caller-supplied: it has no server-side persistence
// anywhere in this app today.
export interface ChatRequestBody {
  question: string
  selection?: ApplicantSelection
  locale?: Locale
}

export interface ChatResult {
  answer: string
  narrationSource: 'llm' | 'template'
  tier: 'fast' | 'strong'
  // Doubles as the "Inspect Data Fed to AI" transparency payload — the
  // same claims+numbers handed to the LLM are handed back to the caller
  // unchanged, so the frontend can show exactly what the model saw with no
  // separate bookkeeping (CLAUDE.md boundary rule 3: source + vintage per
  // claim, satisfied by construction).
  claims: Array<{ text: string; sourceId: string; section: string; sourceUrl: string; dataVintage: string }>
  numbers: Record<string, number>
}
