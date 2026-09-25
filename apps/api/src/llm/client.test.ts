import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// createLlmProvider() reads every field off `env` at call time (never
// captured at module load), so one mutable mock object can drive every
// selection/error-path test below. vi.mock's factory is hoisted by vitest
// above every import in this file (including the `client.js` import below,
// which itself imports env.js) — a plain `const mockEnv = {...}` referenced
// from inside the factory would still be in its temporal dead zone at that
// point, so the value itself has to go through vi.hoisted() too.
const mockEnv = vi.hoisted(() => ({
  LLM_PROVIDER: 'mock' as 'mock' | 'real',
  LLM_REAL_PROVIDER: 'gemini' as 'gemini' | 'anthropic',
  LLM_FALLBACK_PROVIDER: 'groq' as 'groq' | 'none',
  ANTHROPIC_API_KEY: undefined as string | undefined,
  GEMINI_API_KEY: undefined as string | undefined,
  GROQ_API_KEY: undefined as string | undefined,
  LLM_FAST_MODEL: 'claude-haiku-4-5-20251001',
  LLM_STRONG_MODEL: 'claude-sonnet-5',
  GEMINI_FAST_MODEL: 'gemini-2.5-flash',
  GEMINI_STRONG_MODEL: 'gemini-2.5-flash',
  GROQ_MODEL: 'llama-3.3-70b-versatile',
  LLM_TIMEOUT_MS: 8000,
}))
vi.mock('../config/env.js', () => ({ env: mockEnv }))

import { FallbackLlmProvider, GeminiLlmProvider, GroqLlmProvider, MockLlmProvider, RealLlmProvider, createLlmProvider, type LlmProvider } from './client.js'

function resetEnv() {
  mockEnv.LLM_PROVIDER = 'mock'
  mockEnv.LLM_REAL_PROVIDER = 'gemini'
  mockEnv.LLM_FALLBACK_PROVIDER = 'groq'
  mockEnv.ANTHROPIC_API_KEY = undefined
  mockEnv.GEMINI_API_KEY = undefined
  mockEnv.GROQ_API_KEY = undefined
}

// MockLlmProvider and RealLlmProvider (Anthropic, via the SDK) were already
// exercised indirectly through every module that injects its own
// llmProvider (grounding/advisorSaathi service tests). What's new and
// genuinely untested until now: Gemini/Groq's REST parsing, and the
// fallback-on-failure logic — those get direct coverage here, with
// global.fetch mocked so nothing here makes a real network call.

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

describe('MockLlmProvider', () => {
  it('echoes the prompt with a clearly-fake MOCK prefix, per tier', async () => {
    const result = await new MockLlmProvider().generate('fast', 'system', 'how much stock should I buy?')
    expect(result).toBe('MOCK: (fast tier) how much stock should I buy?')
  })
})

describe('GeminiLlmProvider', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the system instruction and user prompt, and extracts the candidate text', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'Your udhaar is within a safe range.' }] }, finishReason: 'STOP' }] })
    )

    const provider = new GeminiLlmProvider('fake-key', { fast: 'gemini-2.5-flash', strong: 'gemini-2.5-flash' })
    const result = await provider.generate('fast', 'You are a business advisor.', 'How is my udhaar looking?')

    expect(result).toBe('Your udhaar is within a safe range.')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('gemini-2.5-flash:generateContent')
    expect(String(url)).toContain('key=fake-key')
    const body = JSON.parse(init.body)
    expect(body.systemInstruction.parts[0].text).toBe('You are a business advisor.')
    expect(body.contents[0].parts[0].text).toBe('How is my udhaar looking?')
  })

  it('uses the strong-tier model when asked for the strong tier', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: 'answer' }] } }] }))
    const provider = new GeminiLlmProvider('fake-key', { fast: 'flash-model', strong: 'pro-model' })
    await provider.generate('strong', 'sys', 'user')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('pro-model:generateContent')
  })

  it('throws on a non-OK HTTP response, including the status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'API key not valid' } }, false, 400))
    const provider = new GeminiLlmProvider('bad-key')
    await expect(provider.generate('fast', 'sys', 'user')).rejects.toThrow(/400/)
  })

  it('throws when the prompt was blocked, naming the block reason', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }))
    const provider = new GeminiLlmProvider('fake-key')
    await expect(provider.generate('fast', 'sys', 'user')).rejects.toThrow(/SAFETY/)
  })

  it('throws when there is no candidate text (e.g. finishReason MAX_TOKENS with empty parts)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }))
    const provider = new GeminiLlmProvider('fake-key')
    await expect(provider.generate('fast', 'sys', 'user')).rejects.toThrow(/MAX_TOKENS/)
  })
})

describe('GroqLlmProvider', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends an OpenAI-shaped chat request with a bearer token and extracts the message content', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'Stock up before Pongal.' }, finish_reason: 'stop' }] }))

    const provider = new GroqLlmProvider('groq-key', 'llama-3.3-70b-versatile')
    const result = await provider.generate('fast', 'sys prompt', 'user prompt')

    expect(result).toBe('Stock up before Pongal.')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer groq-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('llama-3.3-70b-versatile')
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys prompt' },
      { role: 'user', content: 'user prompt' },
    ])
  })

  it('throws on a non-OK HTTP response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'rate limited' }, false, 429))
    const provider = new GroqLlmProvider('groq-key')
    await expect(provider.generate('fast', 'sys', 'user')).rejects.toThrow(/429/)
  })

  it('throws when the response has no message content', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: {}, finish_reason: 'length' }] }))
    const provider = new GroqLlmProvider('groq-key')
    await expect(provider.generate('fast', 'sys', 'user')).rejects.toThrow(/length/)
  })
})

describe('FallbackLlmProvider', () => {
  function stub(fn: LlmProvider['generate']): LlmProvider {
    return { generate: fn }
  }

  it('returns the primary result and never calls the fallback when the primary succeeds', async () => {
    const fallbackGenerate = vi.fn()
    const provider = new FallbackLlmProvider(
      stub(async () => 'primary answer'),
      stub(fallbackGenerate),
      1000,
      1000
    )
    await expect(provider.generate('fast', 'sys', 'user')).resolves.toBe('primary answer')
    expect(fallbackGenerate).not.toHaveBeenCalled()
  })

  it('falls back when the primary throws, and returns the fallback result', async () => {
    const provider = new FallbackLlmProvider(
      stub(async () => {
        throw new Error('Gemini quota exceeded')
      }),
      stub(async () => 'groq answer'),
      1000,
      1000
    )
    await expect(provider.generate('fast', 'sys', 'user')).resolves.toBe('groq answer')
  })

  it('falls back when the primary times out (never hangs past the caller-observed budget)', async () => {
    const provider = new FallbackLlmProvider(
      stub(() => new Promise((resolve) => setTimeout(() => resolve('too slow to matter'), 5000))),
      stub(async () => 'groq answer'),
      50,
      1000
    )
    await expect(provider.generate('fast', 'sys', 'user')).resolves.toBe('groq answer')
  })

  it('throws one combined error naming both failure reasons when both providers fail', async () => {
    const provider = new FallbackLlmProvider(
      stub(async () => {
        throw new Error('primary down')
      }),
      stub(async () => {
        throw new Error('fallback down')
      }),
      1000,
      1000
    )
    await expect(provider.generate('fast', 'sys', 'user')).rejects.toThrow(/primary down/)
    await expect(provider.generate('fast', 'sys', 'user')).rejects.toThrow(/fallback down/)
  })

  it("passes the caller's tier/prompts through unchanged to whichever provider actually answers", async () => {
    const primaryGenerate = vi.fn(async () => {
      throw new Error('down')
    })
    const fallbackGenerate = vi.fn(async () => 'ok')
    const provider = new FallbackLlmProvider(stub(primaryGenerate), stub(fallbackGenerate), 1000, 1000)
    await provider.generate('strong', 'the system prompt', 'the user prompt')
    expect(primaryGenerate).toHaveBeenCalledWith('strong', 'the system prompt', 'the user prompt')
    expect(fallbackGenerate).toHaveBeenCalledWith('strong', 'the system prompt', 'the user prompt')
  })
})

describe('createLlmProvider', () => {
  beforeEach(resetEnv)

  it('returns the mock provider when LLM_PROVIDER is mock, regardless of what keys are set', () => {
    mockEnv.LLM_PROVIDER = 'mock'
    expect(createLlmProvider()).toBeInstanceOf(MockLlmProvider)
  })

  it('defaults to Gemini as the primary real provider, wrapped with a Groq fallback when both keys are present', () => {
    mockEnv.LLM_PROVIDER = 'real'
    mockEnv.GEMINI_API_KEY = 'gemini-key'
    mockEnv.GROQ_API_KEY = 'groq-key'
    expect(createLlmProvider()).toBeInstanceOf(FallbackLlmProvider)
  })

  it('throws when LLM_PROVIDER=real and the chosen primary has no key — an explicit choice must actually work', () => {
    mockEnv.LLM_PROVIDER = 'real'
    mockEnv.LLM_REAL_PROVIDER = 'gemini'
    mockEnv.GEMINI_API_KEY = undefined
    expect(() => createLlmProvider()).toThrow(/GEMINI_API_KEY/)
  })

  it('can select Anthropic as the primary instead, and requires ITS key, not GEMINI_API_KEY', () => {
    mockEnv.LLM_PROVIDER = 'real'
    mockEnv.LLM_REAL_PROVIDER = 'anthropic'
    mockEnv.GEMINI_API_KEY = 'gemini-key' // present but irrelevant — anthropic is primary
    expect(() => createLlmProvider()).toThrow(/ANTHROPIC_API_KEY/)
    mockEnv.ANTHROPIC_API_KEY = 'anthropic-key'
    expect(createLlmProvider()).toBeInstanceOf(RealLlmProvider)
  })

  it('runs with no fallback (never throws) when GROQ_API_KEY is missing — a fallback is optional, not required', () => {
    mockEnv.LLM_PROVIDER = 'real'
    mockEnv.GEMINI_API_KEY = 'gemini-key'
    mockEnv.GROQ_API_KEY = undefined
    const provider = createLlmProvider()
    expect(provider).toBeInstanceOf(GeminiLlmProvider)
    expect(provider).not.toBeInstanceOf(FallbackLlmProvider)
  })

  it('skips the fallback entirely when LLM_FALLBACK_PROVIDER=none, even with a Groq key present', () => {
    mockEnv.LLM_PROVIDER = 'real'
    mockEnv.GEMINI_API_KEY = 'gemini-key'
    mockEnv.GROQ_API_KEY = 'groq-key'
    mockEnv.LLM_FALLBACK_PROVIDER = 'none'
    expect(createLlmProvider()).toBeInstanceOf(GeminiLlmProvider)
  })
})
