import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../i18n/I18nContext'
import { AuthProvider } from '../context/AuthContext'
import { AppDataProvider } from '../context/AppDataContext'
import AdvisorSaathi from './AdvisorSaathi'
import * as advisorSaathiLib from '../lib/advisorSaathi'

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <AuthProvider>
          <AppDataProvider>
            <AdvisorSaathi />
          </AppDataProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>
  )
}

function seedAuthedSession() {
  localStorage.setItem(
    'setu.auth',
    JSON.stringify({
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      phone: '+919876543210',
      role: 'applicant',
      expiresAt: Date.now() + 900_000,
    })
  )
}

// Regression coverage for item 3: streaming reveal (not a single blocking
// wait), a distinguishable "still working" state when the server is slow,
// and the transparency panel showing exactly what was fed to the model —
// all driven through the real AdvisorSaathi page + its real send()
// wiring, with only the network-facing askAdvisorSaathiStream mocked.
describe('AdvisorSaathi chat page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('reveals the answer progressively as chunk callbacks fire, then shows the transparency panel', async () => {
    seedAuthedSession()
    let callbacks
    vi.spyOn(advisorSaathiLib, 'askAdvisorSaathiStream').mockImplementation(async (opts) => {
      callbacks = opts
    })

    renderPage()
    const input = screen.getByPlaceholderText(/ask in plain language/i)
    fireEvent.change(input, { target: { value: 'How is my business doing?' } })
    fireEvent.submit(input.closest('form'))

    await waitFor(() => expect(callbacks).toBeDefined())

    act(() => callbacks.onStart())
    // Nothing revealed yet — just the thinking indicator, not a blank
    // screen and not the full answer prematurely.
    expect(screen.getByText(/saathi is thinking/i)).toBeInTheDocument()

    act(() => callbacks.onChunk('Your net ', 'Your net '))
    expect(screen.getByText(/Your net/)).toBeInTheDocument()

    act(() => callbacks.onChunk('surplus is ₹1,500.', 'Your net surplus is ₹1,500.'))
    expect(screen.getByText(/Your net surplus is ₹1,500\./)).toBeInTheDocument()

    act(() =>
      callbacks.onDone({
        answer: 'Your net surplus is ₹1,500.',
        narrationSource: 'llm',
        tier: 'fast',
        claims: [{ text: 'Ledger says so.', sourceId: 'ledger', section: 'Cash flow', dataVintage: '2026-09-24' }],
        numbers: { netSurplus: 1500 },
      })
    )

    // Input re-enables once the turn completes.
    await waitFor(() => expect(screen.getByPlaceholderText(/ask in plain language/i)).not.toBeDisabled())

    fireEvent.click(screen.getByText(/inspect data fed to ai/i))
    expect(screen.getByText(/ledger says so/i)).toBeInTheDocument()
    expect(screen.getByText(/netSurplus/)).toBeInTheDocument()
  })

  it('shows the unavailable fallback and never a client-fabricated answer when the stream fails', async () => {
    seedAuthedSession()
    vi.spyOn(advisorSaathiLib, 'askAdvisorSaathiStream').mockImplementation(async (opts) => {
      opts.onStart?.()
      opts.onUnavailable?.()
    })

    renderPage()
    const input = screen.getByPlaceholderText(/ask in plain language/i)
    fireEvent.change(input, { target: { value: 'q' } })
    fireEvent.submit(input.closest('form'))

    expect(await screen.findByText(/advisor saathi is unavailable/i)).toBeInTheDocument()
  })

  it('shows a distinct "still working" notice if no chunk arrives within the slow threshold', async () => {
    vi.useFakeTimers()
    seedAuthedSession()
    let callbacks
    vi.spyOn(advisorSaathiLib, 'askAdvisorSaathiStream').mockImplementation(async (opts) => {
      callbacks = opts
    })

    renderPage()
    const input = screen.getByPlaceholderText(/ask in plain language/i)
    fireEvent.change(input, { target: { value: 'q' } })
    fireEvent.submit(input.closest('form'))

    await vi.waitFor(() => expect(callbacks).toBeDefined())
    act(() => callbacks.onStart())

    expect(screen.queryByText(/still working/i)).not.toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText(/still working/i)).toBeInTheDocument()

    vi.useRealTimers()
  })
})
