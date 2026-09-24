// The LLM seam — modules/grounding/service.ts is the ONLY file in this app
// permitted to import from here (CLAUDE.md, non-negotiable boundary rule 2 —
// the LLM narrates and explains only, it never computes; nothing that
// touches this client ever produces a rupee figure a user sees).
import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env.js'

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

const TIER_MODELS: Record<LlmTier, string> = {
  fast: env.LLM_FAST_MODEL,
  strong: env.LLM_STRONG_MODEL,
}

// Real, verified SDK usage (@anthropic-ai/sdk) — fast tier defaults to
// Claude Haiku 4.5 (the common case, called on every report; its latency is
// a number a rural user feels), strong tier to Claude Sonnet 5 (rare,
// genuinely ambiguous eligibility questions only). Both overridable via env
// without touching call sites.
export class RealLlmProvider implements LlmProvider {
  private readonly client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async generate(tier: LlmTier, systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: TIER_MODELS[tier],
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
    if (!textBlock) {
      throw new Error(`LLM response for tier "${tier}" had no text block (stop_reason: ${response.stop_reason})`)
    }
    return textBlock.text
  }
}

export function createLlmProvider(): LlmProvider {
  if (env.LLM_PROVIDER === 'real') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY must be set when LLM_PROVIDER=real')
    }
    return new RealLlmProvider(env.ANTHROPIC_API_KEY)
  }
  return new MockLlmProvider()
}
