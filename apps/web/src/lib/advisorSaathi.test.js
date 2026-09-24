import { describe, it, expect, vi, beforeEach } from 'vitest'
import { askAdvisorSaathiStream } from './advisorSaathi'
import * as authLib from './auth'

function sseResponse(frames, { ok = true } = {}) {
  const body = frames.map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join('')
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  return { ok, body: stream }
}

describe('askAdvisorSaathiStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reconstructs the full answer from chunk events and reports it via onDone', async () => {
    vi.spyOn(authLib, 'authorizedFetch').mockResolvedValue(
      sseResponse([
        { event: 'start', data: {} },
        { event: 'chunk', data: { text: 'Your net ' } },
        { event: 'chunk', data: { text: 'surplus is ₹1,500.' } },
        { event: 'done', data: { narrationSource: 'llm', tier: 'fast', claims: [{ sourceId: 'ledger' }], numbers: { netSurplus: 1500 } } },
      ])
    )

    const onStart = vi.fn()
    const onChunk = vi.fn()
    const onDone = vi.fn()
    const onUnavailable = vi.fn()

    await askAdvisorSaathiStream({ question: 'How am I doing?', selection: {}, locale: 'en', onStart, onChunk, onDone, onUnavailable })

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(onChunk).toHaveBeenLastCalledWith('surplus is ₹1,500.', 'Your net surplus is ₹1,500.')
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'Your net surplus is ₹1,500.', narrationSource: 'llm', tier: 'fast' })
    )
    expect(onUnavailable).not.toHaveBeenCalled()
  })

  it('calls onUnavailable and never onDone when the server sends an error event', async () => {
    vi.spyOn(authLib, 'authorizedFetch').mockResolvedValue(
      sseResponse([{ event: 'start', data: {} }, { event: 'error', data: { message: 'boom' } }])
    )

    const onDone = vi.fn()
    const onUnavailable = vi.fn()
    await askAdvisorSaathiStream({ question: 'q', selection: {}, locale: 'en', onDone, onUnavailable })

    expect(onUnavailable).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onUnavailable when the stream ends without ever sending done (never a client-fabricated answer)', async () => {
    vi.spyOn(authLib, 'authorizedFetch').mockResolvedValue(
      sseResponse([{ event: 'start', data: {} }, { event: 'chunk', data: { text: 'partial...' } }])
    )

    const onDone = vi.fn()
    const onUnavailable = vi.fn()
    await askAdvisorSaathiStream({ question: 'q', selection: {}, locale: 'en', onDone, onUnavailable })

    expect(onUnavailable).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onUnavailable on a non-ok HTTP response', async () => {
    vi.spyOn(authLib, 'authorizedFetch').mockResolvedValue({ ok: false, body: null })
    const onUnavailable = vi.fn()
    await askAdvisorSaathiStream({ question: 'q', selection: {}, locale: 'en', onUnavailable })
    expect(onUnavailable).toHaveBeenCalledTimes(1)
  })

  it('calls onUnavailable when the fetch itself throws (offline)', async () => {
    vi.spyOn(authLib, 'authorizedFetch').mockRejectedValue(new Error('network down'))
    const onUnavailable = vi.fn()
    await askAdvisorSaathiStream({ question: 'q', selection: {}, locale: 'en', onUnavailable })
    expect(onUnavailable).toHaveBeenCalledTimes(1)
  })
})
