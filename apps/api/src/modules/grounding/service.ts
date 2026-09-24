// Retrieval + narration. THE ONLY MODULE PERMITTED TO CALL AN LLM
// (CLAUDE.md, non-negotiable boundary rule 2). No other module in this app
// may import ../../llm/client — that import is the enforcement point.
import type { Redis } from 'ioredis'
import type { Db } from '../../db/client'
import { env } from '../../config/env'
import { sha256Hex, stableStringify } from '../../lib/hash'
import { withTimeout } from '../../lib/withTimeout'
import { createLlmProvider, type LlmProvider, type LlmTier } from '../../llm/client'
import { createEmbeddingProvider, type EmbeddingProvider } from '../../llm/embeddingProvider'
import { buildFallbackAnswer, buildFallbackNarration } from './fallbackTemplates'
import { buildFeasibilityEstimatePrompt, buildQueryPrompt, buildNarrationPrompt, type FeasibilityEstimateContext } from './promptBuilder'
import { retrieveGroundedClaims } from './retrieval'
import type { FeasibilityEstimate, GroundedClaim, Locale, NarrationInput, NarrationResult, QueryRequestBody, QueryResult } from './types'
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

// Shared by query() and queryWithClaims() below: tier decision, an
// optional cache lookup/write (null cacheKey skips caching entirely —
// queryWithClaims uses this for personal per-applicant data that
// shouldn't sit under a cross-user cache key), prompt build, generate,
// validate-or-fall-back-to-template. Neither caller duplicates this
// try/catch/fallback contract.
async function runQuery(
  deps: GroundingDeps,
  question: string,
  claims: GroundedClaim[],
  locale: Locale,
  numbers: Record<string, number> | undefined,
  cacheKey: string | null
): Promise<QueryResult> {
  const llmProvider = deps.llmProvider ?? createLlmProvider()
  const tier = decideTier(claims)

  if (cacheKey) {
    const cached = await deps.redis.get(cacheKey).catch(() => null)
    if (cached) return { answer: cached, narrationSource: 'llm', tier, claims }
  }

  const allowedNumbers = buildAllowedNumbers(numbers ?? {})
  const { system, user } = buildQueryPrompt(question, claims, locale, numbers)

  try {
    const text = await withTimeout(llmProvider.generate(tier, system, user), env.LLM_TIMEOUT_MS)
    const validation = validateNarration(text, allowedNumbers)
    if (!validation.valid) {
      console.warn('[grounding] query answer rejected — numbers not in structured input', { cacheKey, invalid: validation.invalid })
      return { answer: buildFallbackAnswer(locale, claims), narrationSource: 'template', tier, claims }
    }
    if (cacheKey) {
      const ttl = tier === 'strong' ? STRONG_CACHE_TTL_SECONDS : NARRATION_CACHE_TTL_SECONDS
      await deps.redis.set(cacheKey, text, 'EX', ttl).catch(() => {})
    }
    return { answer: text, narrationSource: 'llm', tier, claims }
  } catch (err) {
    console.warn('[grounding] query fell back to template', {
      cacheKey,
      reason: err instanceof Error ? err.message : String(err),
    })
    return { answer: buildFallbackAnswer(locale, claims), narrationSource: 'template', tier, claims }
  }
}

// Eligibility Q&A (backs POST /grounding/query). Retrieves cited claims
// itself, escalates to the strong tier only for genuine ambiguity, and
// applies the validate-or-fall-back-to-template contract via runQuery. A
// "what if" that needs a new number is the caller's job to recompute via
// @setu/core and call this again — this module never calls the calculator
// itself.
export async function query(deps: GroundingDeps, body: QueryRequestBody): Promise<QueryResult> {
  const embeddingProvider = deps.embeddingProvider ?? createEmbeddingProvider()
  const locale = body.context?.locale ?? 'en'

  const claims = await retrieveGroundedClaims({ db: deps.db, embeddingProvider }, body.question, body.context)
  const cacheKey = queryCacheKey(body, decideTier(claims))

  return runQuery(deps, body.question, claims, locale, body.context?.numbers, cacheKey)
}

export interface QueryWithClaimsInput {
  question: string
  // Caller-supplied, not retrieved — this is the seam a module like
  // advisorSaathi uses to ground an answer in data retrieval.ts has no
  // reason to know about (ledger/credit-score/scheme-match figures), while
  // still going through the exact same validate-or-fall-back-to-template
  // contract as query(). Never imports llm/client.ts itself — only this
  // file does (CLAUDE.md boundary rule 2).
  claims: GroundedClaim[]
  numbers: Record<string, number>
  locale: Locale
}

export async function queryWithClaims(deps: GroundingDeps, input: QueryWithClaimsInput): Promise<QueryResult> {
  return runQuery(deps, input.question, input.claims, input.locale, input.numbers, null)
}

const FEASIBILITY_ESTIMATE_TIMEOUT_MS = 6000 // strong tier, genuinely reasoning, not just paraphrasing
const FEASIBILITY_ESTIMATE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60 // a district's general profile doesn't change day to day
const FEASIBILITY_RANGES = { demand: 7, infrastructure: 6, market: 5 } as const

function feasibilityEstimateCacheKey(context: FeasibilityEstimateContext): string {
  return `grounding:feasibility-estimate:${sha256Hex(stableStringify(context))}`
}

// Clamps to the field's real range and rejects anything that isn't a
// finite number — a value out of range or malformed is worth exactly as
// much as no value at all, never silently clamped-and-kept-anyway as if
// the model had been more careful than it was.
function sanitizeEstimateField(value: unknown, maxAbs: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (Math.abs(rounded) > maxAbs) return null
  return rounded
}

function parseFeasibilityEstimate(text: string): FeasibilityEstimate | null {
  try {
    // Models occasionally wrap JSON in a code fence despite instructions
    // not to — strip one if present rather than failing outright on
    // something this easy to tolerate.
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    return {
      demand: sanitizeEstimateField(parsed.demand, FEASIBILITY_RANGES.demand),
      infrastructure: sanitizeEstimateField(parsed.infrastructure, FEASIBILITY_RANGES.infrastructure),
      market: sanitizeEstimateField(parsed.market, FEASIBILITY_RANGES.market),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 300) : null,
    }
  } catch {
    return null
  }
}

// THE deliberate, narrow exception to boundary rule 2 in this whole app —
// see promptBuilder.ts's buildFeasibilityEstimatePrompt for the honesty
// contract this is built under. Only ever called by
// feasibility/service.ts, and only for factors where no real ingested
// signal resolved; the result is always labelled 'ai_estimated', never
// merged into or mistaken for 'real'. Never throws, never blocks — a
// parse failure, an out-of-range value, a timeout, or the LLM being
// unreachable all degrade to `null` for that field, which the caller
// treats exactly like "no data, excluded."
export async function estimateFeasibilityFactors(
  deps: GroundingDeps,
  context: FeasibilityEstimateContext
): Promise<FeasibilityEstimate | null> {
  const llmProvider = deps.llmProvider ?? createLlmProvider()
  const cacheKey = feasibilityEstimateCacheKey(context)

  const cached = await deps.redis.get(cacheKey).catch(() => null)
  if (cached) {
    try {
      return JSON.parse(cached) as FeasibilityEstimate
    } catch {
      // fall through to a fresh estimate — a corrupted cache entry is no
      // different from a cache miss.
    }
  }

  const { system, user } = buildFeasibilityEstimatePrompt(context)

  try {
    const text = await withTimeout(llmProvider.generate('strong', system, user), FEASIBILITY_ESTIMATE_TIMEOUT_MS)
    const estimate = parseFeasibilityEstimate(text)
    if (!estimate) {
      console.warn('[grounding] feasibility estimate rejected — response did not parse as the expected JSON shape', { cacheKey })
      return null
    }
    await deps.redis.set(cacheKey, JSON.stringify(estimate), 'EX', FEASIBILITY_ESTIMATE_CACHE_TTL_SECONDS).catch(() => {})
    return estimate
  } catch (err) {
    console.warn('[grounding] feasibility estimate unavailable', { cacheKey, reason: err instanceof Error ? err.message : String(err) })
    return null
  }
}
