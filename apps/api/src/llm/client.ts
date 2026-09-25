// The LLM seam — modules/grounding/service.ts is the ONLY file in this app
// permitted to import from here (CLAUDE.md, non-negotiable boundary rule 2 —
// the LLM narrates and explains only, it never computes; nothing that
// touches this client ever produces a rupee figure a user sees).
import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env.js'
import { withTimeout } from '../lib/withTimeout.js'

export type LlmTier = 'fast' | 'strong'

export interface LlmProvider {
  generate(tier: LlmTier, systemPrompt: string, userPrompt: string): Promise<string>
}

// Default — no credentials needed, same posture as MockAgmarknetProvider /
// MockAccountAggregatorProvider. Deterministic, clearly "MOCK:"-prefixed so
// it's never mistaken for a real narration mid-demo, and safe to point the
// numeric validator at in tests.
export class MockLlmProvider implements LlmProvider {
  async generate(tier: LlmTier, _systemPrompt: string, userPrompt: string): Promise<string> {
    return `MOCK: (${tier} tier) ${userPrompt}`
  }
}

// Real, verified SDK usage (@anthropic-ai/sdk) — fast tier defaults to
// Claude Haiku 4.5 (the common case, called on every report; its latency is
// a number a rural user feels), strong tier to Claude Sonnet 5 (rare,
// genuinely ambiguous eligibility questions only). Both overridable via env
// without touching call sites.
export class RealLlmProvider implements LlmProvider {
  private readonly client: Anthropic
  private readonly tierModels: Record<LlmTier, string>

  constructor(apiKey: string, tierModels: Record<LlmTier, string> = { fast: env.LLM_FAST_MODEL, strong: env.LLM_STRONG_MODEL }) {
    this.client = new Anthropic({ apiKey })
    this.tierModels = tierModels
  }

  async generate(tier: LlmTier, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.tierModels[tier],
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
    if (!textBlock) {
      throw new Error(`Anthropic response for tier "${tier}" had no text block (stop_reason: ${response.stop_reason})`)
    }
    return textBlock.text
  }
}

const GEMINI_URL = (model: string, apiKey: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
  promptFeedback?: { blockReason?: string }
}

// Google AI Studio's Generative Language REST API, called directly (no SDK
// dependency — same lightweight pattern as embeddingProvider.ts's Voyage
// call) so this stays free to add without growing the deployed bundle.
// Chosen as the default real provider specifically because its free tier
// needs no card (see env.ts's GEMINI_API_KEY/GEMINI_FAST_MODEL comments —
// the default model names are Google's own always-current aliases, not a
// pinned snapshot, after a pinned one broke within this same session).
export class GeminiLlmProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly tierModels: Record<LlmTier, string> = { fast: env.GEMINI_FAST_MODEL, strong: env.GEMINI_STRONG_MODEL }
  ) {}

  async generate(tier: LlmTier, systemPrompt: string, userPrompt: string): Promise<string> {
    const model = this.tierModels[tier]
    const response = await fetch(GEMINI_URL(model, this.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Gemini request failed (${response.status}) for tier "${tier}": ${body.slice(0, 300)}`)
    }

    const data = (await response.json()) as GeminiResponse
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt for tier "${tier}": ${data.promptFeedback.blockReason}`)
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    if (!text) {
      throw new Error(`Gemini response for tier "${tier}" had no text (finishReason: ${data.candidates?.[0]?.finishReason ?? 'unknown'})`)
    }
    return text
  }
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

interface GroqResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
}

// Groq's REST API is OpenAI-chat-completions-compatible — called directly,
// same reasoning as Gemini above. Only ever used as the fallback (see
// FallbackLlmProvider): fast, free-tier inference over an open-weight
// model, retried when the primary real provider fails or times out.
export class GroqLlmProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = env.GROQ_MODEL
  ) {}

  async generate(tier: LlmTier, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Groq request failed (${response.status}) for tier "${tier}": ${body.slice(0, 300)}`)
    }

    const data = (await response.json()) as GroqResponse
    const text = data.choices?.[0]?.message?.content
    if (!text) {
      throw new Error(`Groq response for tier "${tier}" had no content (finish_reason: ${data.choices?.[0]?.finish_reason ?? 'unknown'})`)
    }
    return text
  }
}

// Primary, then — only on a genuine failure or timeout, never raced
// speculatively against a primary that's still likely to succeed, so a
// working primary never triggers a second, unnecessary paid/rate-limited
// call — a free fallback provider. The caller (grounding/service.ts) already
// wraps the whole generate() in its own withTimeout(env.LLM_TIMEOUT_MS) and
// degrades to a deterministic template on any throw, so this never risks a
// hang; it only decides how that one budget is split across up to two
// sequential attempts, and turns "both failed" into one combined error with
// both reasons for the caller's warn log.
export class FallbackLlmProvider implements LlmProvider {
  constructor(
    private readonly primary: LlmProvider,
    private readonly fallback: LlmProvider,
    private readonly primaryTimeoutMs: number = env.LLM_TIMEOUT_MS,
    private readonly fallbackTimeoutMs: number = env.LLM_TIMEOUT_MS
  ) {}

  async generate(tier: LlmTier, systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      return await withTimeout(this.primary.generate(tier, systemPrompt, userPrompt), this.primaryTimeoutMs)
    } catch (primaryErr) {
      const primaryReason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      console.warn('[llm] primary provider failed, trying fallback', { tier, reason: primaryReason })
      try {
        return await withTimeout(this.fallback.generate(tier, systemPrompt, userPrompt), this.fallbackTimeoutMs)
      } catch (fallbackErr) {
        const fallbackReason = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        throw new Error(`primary and fallback LLM providers both failed for tier "${tier}": primary=${primaryReason}; fallback=${fallbackReason}`)
      }
    }
  }
}

// LLM_TIMEOUT_MS is one budget shared across up to two sequential calls
// (primary, then fallback) — split 60/40 rather than giving each the full
// amount, so a primary that's genuinely down still leaves the fallback a
// real chance to answer inside the SAME overall bound the caller already
// enforces, instead of the fallback attempt starting only after that outer
// timeout would already have fired.
function primaryFallbackSplit(totalMs: number): { primaryMs: number; fallbackMs: number } {
  const primaryMs = Math.max(1000, Math.round(totalMs * 0.6))
  const fallbackMs = Math.max(1000, totalMs - primaryMs)
  return { primaryMs, fallbackMs }
}

function buildRealProvider(which: 'gemini' | 'anthropic'): LlmProvider {
  if (which === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY must be set when LLM_REAL_PROVIDER=gemini')
    return new GeminiLlmProvider(env.GEMINI_API_KEY)
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY must be set when LLM_REAL_PROVIDER=anthropic')
  return new RealLlmProvider(env.ANTHROPIC_API_KEY)
}

export function createLlmProvider(): LlmProvider {
  if (env.LLM_PROVIDER !== 'real') return new MockLlmProvider()

  // The primary is an explicit choice — missing its key is a startup error,
  // same posture as the original Anthropic-only version of this function.
  const primary = buildRealProvider(env.LLM_REAL_PROVIDER)

  if (env.LLM_FALLBACK_PROVIDER === 'none') return primary
  if (!env.GROQ_API_KEY) {
    // The fallback is a safety net, not a requirement — losing it is fine
    // (rule 4: degrade, don't refuse to start over an optional extra).
    console.warn('[llm] LLM_FALLBACK_PROVIDER=groq but GROQ_API_KEY is not set — running with no fallback')
    return primary
  }
  const fallback = new GroqLlmProvider(env.GROQ_API_KEY)
  const { primaryMs, fallbackMs } = primaryFallbackSplit(env.LLM_TIMEOUT_MS)
  return new FallbackLlmProvider(primary, fallback, primaryMs, fallbackMs)
}
