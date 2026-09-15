// Retrieval + narration. THE ONLY MODULE PERMITTED TO CALL AN LLM
// (CLAUDE.md, non-negotiable boundary rule 2). No other module in this app
// may import ../../llm/client — that import is the enforcement point.
import type Redis from 'ioredis'
import type { Db } from '../../db/client'
import { env } from '../../config/env'
import { sha256Hex, stableStringify } from '../../lib/hash'
import { withTimeout } from '../../lib/withTimeout'
import { createLlmProvider, type LlmProvider, type LlmTier } from '../../llm/client'
import { createEmbeddingProvider, type EmbeddingProvider } from '../../llm/embeddingProvider'
import { buildFallbackAnswer, buildFallbackNarration } from './fallbackTemplates'
import { buildQueryPrompt, buildNarrationPrompt } from './promptBuilder'
import { retrieveGroundedClaims } from './retrieval'
import type { GroundedClaim, NarrationInput, NarrationResult, QueryRequestBody, QueryResult } from './types'
import { buildAllowedNumbers, validateNarration } from './validator'

const NARRATION_CACHE_TTL_SECONDS = 24 * 60 * 60 // fast tier — the common case, refreshed daily
const STRONG_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60 // "cached hard" — rare, expensive strong-tier answers
const SIMILARITY_AMBIGUOUS_THRESHOLD = 0.75
const SIMILARITY_EPSILON = 0.05

export interface GroundingDeps {
  db: Db
  redis: Redis
  llmProvider?: LlmProvider
  embeddingProvider?: EmbeddingProvider
}

function narrationCacheKey(input: NarrationInput): string {
  // Keyed on the structured inputs, not the prose — CLAUDE.md's explicit
  // instruction. Same (numbers, schemeId, locale) always narrates the same
  // way, so the LLM is skipped entirely on a cache hit.
  return `grounding:narration:${sha256Hex(stableStringify({ numbers: input.numbers, schemeId: input.schemeId, locale: input.locale }))}`
}

// Not the model's decision — a deterministic heuristic on the retrieval
// results decides whether this question needs the strong tier: either
// nothing retrieved matches well, or more than one scheme is plausible
// (e.g. an SC applicant who is also woman-owned: NSFDC vs. Stand-Up India).
function decideTier(claims: GroundedClaim[]): LlmTier {
  if (claims.length === 0) return 'fast'
  const top = claims[0]!.similarity
  if (top < SIMILARITY_AMBIGUOUS_THRESHOLD) return 'strong'
  const topSources = new Set(claims.filter((c) => top - c.similarity <= SIMILARITY_EPSILON).map((c) => c.sourceId))
  return topSources.size > 1 ? 'strong' : 'fast'
}

function queryCacheKey(body: QueryRequestBody, tier: LlmTier): string {
  return `grounding:query:${tier}:${sha256Hex(stableStringify({ question: body.question, context: body.context ?? null }))}`
}

// Report narration: reproduce the calculator's numbers verbatim, explain
// WHY using retrieved eligibility text. Never hangs (rule 4) and never lets
// an invented number through (rule 2, enforced by validator.ts) — both
// failure modes degrade to the deterministic template, logged.
export async function narrateReport(deps: GroundingDeps, input: NarrationInput): Promise<NarrationResult> {
  const llmProvider = deps.llmProvider ?? createLlmProvider()
  const cacheKey = narrationCacheKey(input)

  const cached = await deps.redis.get(cacheKey).catch(() => null)
  if (cached) return { text: cached, narrationSource: 'llm', tier: 'fast' }

  const allowedNumbers = buildAllowedNumbers(
    input.numbers,
    input.factors.map((f) => f.value)
  )
  const { system, user } = buildNarrationPrompt(input)

  try {
    const text = await withTimeout(llmProvider.generate('fast', system, user), env.LLM_TIMEOUT_MS)
    const validation = validateNarration(text, allowedNumbers)
    if (!validation.valid) {
      console.warn('[grounding] narration rejected — numbers not in structured input', { cacheKey, invalid: validation.invalid })
      return { text: buildFallbackNarration(input), narrationSource: 'template' }
    }
    await deps.redis.set(cacheKey, text, 'EX', NARRATION_CACHE_TTL_SECONDS).catch(() => {})
    return { text, narrationSource: 'llm', tier: 'fast' }
  } catch (err) {
    console.warn('[grounding] narration fell back to template', {
      cacheKey,
      reason: err instanceof Error ? err.message : String(err),
    })
    return { text: buildFallbackNarration(input), narrationSource: 'template' }
  }
}

// Eligibility Q&A (backs POST /grounding/query). Retrieves cited claims,
// escalates to the strong tier only for genuine ambiguity, and applies the
// same validate-or-fall-back-to-template contract. A "what if" that needs a
// new number is the caller's job to recompute via @setu/core and call this
// again — this module never calls the calculator itself.
export async function query(deps: GroundingDeps, body: QueryRequestBody): Promise<QueryResult> {
  const embeddingProvider = deps.embeddingProvider ?? createEmbeddingProvider()
  const llmProvider = deps.llmProvider ?? createLlmProvider()
  const locale = body.context?.locale ?? 'en'

  const claims = await retrieveGroundedClaims({ db: deps.db, embeddingProvider }, body.question, body.context)
  const tier = decideTier(claims)
  const cacheKey = queryCacheKey(body, tier)

  const cached = await deps.redis.get(cacheKey).catch(() => null)
  if (cached) return { answer: cached, narrationSource: 'llm', tier, claims }

  const allowedNumbers = buildAllowedNumbers(body.context?.numbers ?? {})
  const { system, user } = buildQueryPrompt(body.question, claims, locale, body.context?.numbers)

  try {
    const text = await withTimeout(llmProvider.generate(tier, system, user), env.LLM_TIMEOUT_MS)
    const validation = validateNarration(text, allowedNumbers)
    if (!validation.valid) {
      console.warn('[grounding] query answer rejected — numbers not in structured input', { cacheKey, invalid: validation.invalid })
      return { answer: buildFallbackAnswer(locale, claims), narrationSource: 'template', tier, claims }
    }
    const ttl = tier === 'strong' ? STRONG_CACHE_TTL_SECONDS : NARRATION_CACHE_TTL_SECONDS
    await deps.redis.set(cacheKey, text, 'EX', ttl).catch(() => {})
    return { answer: text, narrationSource: 'llm', tier, claims }
  } catch (err) {
    console.warn('[grounding] query fell back to template', {
      cacheKey,
      reason: err instanceof Error ? err.message : String(err),
    })
    return { answer: buildFallbackAnswer(locale, claims), narrationSource: 'template', tier, claims }
  }
}
