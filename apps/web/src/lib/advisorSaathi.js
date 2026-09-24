// POST /advisor-saathi/chat, consumed as a Server-Sent Events stream (see
// apps/api's routes.ts for why: the answer is fully computed and
// numeric-validated server-side before any of it streams out — the model
// never gets to show an unvalidated token, only a "start" event, then
// "chunk" events revealing the already-safe text progressively, then a
// "done" event with the transparency-panel payload). Deliberately NOT
// queued for offline background-sync the way lib/ledger.js's
// recordTransaction is — a chat question replayed minutes (or hours)
// later against context that's gone stale by then would be actively
// misleading, unlike a queued sale, which is just as true whenever it's
// finally recorded.
import { authorizedFetch } from './auth'

// Parses one complete "event: x\ndata: y\n\n" SSE frame. Returns null for
// anything malformed (a stray comment/heartbeat, a partial frame that
// shouldn't reach here) rather than throwing — a single bad frame must
// never break the rest of the stream.
function parseSseFrame(raw) {
  const eventMatch = raw.match(/^event:\s?(.+)$/m)
  const dataMatch = raw.match(/^data:\s?(.+)$/m)
  if (!eventMatch || !dataMatch) return null
  try {
    return { event: eventMatch[1].trim(), data: JSON.parse(dataMatch[1]) }
  } catch {
    return null
  }
}

// Callbacks: onStart(), onChunk(text, fullTextSoFar), onDone({answer,
// narrationSource, tier, claims, numbers}), onUnavailable() — the last one
// covers every failure mode (network error, non-2xx, a stream that ends
// with no "done" event, an explicit "error" event) with one honest
// "couldn't reach the advisor" outcome, never a client-fabricated answer,
// which would violate CLAUDE.md's "LLM narrates, never computes" boundary
// by proxy.
export async function askAdvisorSaathiStream({ question, selection, locale, onStart, onChunk, onDone, onUnavailable }) {
  let sawDone = false
  try {
    const response = await authorizedFetch('/advisor-saathi/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, selection, locale }),
    })

    if (!response.ok || !response.body) {
      onUnavailable()
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let answerText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sepIndex
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawFrame = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        const frame = parseSseFrame(rawFrame)
        if (!frame) continue

        if (frame.event === 'start') {
          onStart?.()
        } else if (frame.event === 'chunk') {
          answerText += frame.data.text
          onChunk?.(frame.data.text, answerText)
        } else if (frame.event === 'done') {
          sawDone = true
          onDone?.({ answer: answerText, ...frame.data })
        } else if (frame.event === 'error') {
          onUnavailable()
          return
        }
      }
    }

    if (!sawDone) onUnavailable()
  } catch {
    if (!sawDone) onUnavailable()
  }
}
