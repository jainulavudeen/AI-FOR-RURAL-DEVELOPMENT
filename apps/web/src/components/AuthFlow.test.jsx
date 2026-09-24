import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { I18nProvider } from '../i18n/I18nContext'
import { AuthProvider, useAuth } from '../context/AuthContext'
import AuthControl from './AuthControl'
import AuthModal from './AuthModal'
import * as authLib from '../lib/auth'

// Regression coverage for: "sign-in only works from the nav bar" — every
// other gated entry point (Dashboard, CreditScore, AdvisorSaathi,
// BankDossier, BahiKhata, AppealPanel, ...) calls the exact same
// useAuth().requestLogin() that PageGateButton simulates here. The bug was
// never in that wiring — it was that the popover they woke up lived inside
// a CSS-hidden Navbar breakpoint. This test proves the property that fix
// actually guarantees: ANY caller of requestLogin() reaches the SAME,
// always-mounted AuthModal, and login lands the user back where they were.

function PageGateButton({ label = 'gated-action' }) {
  const { requestLogin } = useAuth()
  return (
    <button type="button" onClick={requestLogin}>
      {label}
    </button>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderApp(initialPath, gateLabel) {
  return render(
    <I18nProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <LocationProbe />
          {/* AuthControl mimics the Navbar's own sign-in button; it is
              deliberately mounted alongside a page-level gate button (both
              call requestLogin) to prove they drive one shared modal. */}
          <AuthControl />
          <Routes>
            <Route path={initialPath} element={<PageGateButton label={gateLabel} />} />
          </Routes>
          <AuthModal />
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>
  )
}

async function completeLogin({ triggerLabel }) {
  fireEvent.click(screen.getByText(triggerLabel))

  const phoneInput = await screen.findByPlaceholderText(/10-digit mobile number/i)
  fireEvent.change(phoneInput, { target: { value: '9876543210' } })
  fireEvent.click(screen.getByRole('button', { name: /send code/i }))

  await waitFor(() => expect(authLib.requestOtp).toHaveBeenCalledWith('+919876543210'))

  const codeInput = await screen.findByPlaceholderText(/6-digit code/i)
  fireEvent.change(codeInput, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /^verify$/i }))

  await waitFor(() => expect(authLib.verifyOtp).toHaveBeenCalledWith('+919876543210', '123456'))
}

describe('sign-in entry points share one modal and one auth state', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.spyOn(authLib, 'requestOtp').mockResolvedValue({ ok: true, status: 200, data: { deliveryMode: 'sms' } })
    vi.spyOn(authLib, 'verifyOtp').mockResolvedValue({
      ok: true,
      status: 200,
      session: { accessToken: 'tok', refreshToken: 'ref', phone: '+919876543210', role: 'applicant' },
    })
  })

  it('opens the modal from a page-level gate button (not just the navbar)', async () => {
    renderApp('/credit-score', 'open-from-page')

    // Before clicking, no login form should be present anywhere — proves
    // there's no second, hidden instance already rendered open.
    expect(screen.queryByPlaceholderText(/10-digit mobile number/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('open-from-page'))

    // The SAME AuthModal (mounted once, outside Navbar/AuthControl) must
    // become visible in response — this is the exact thing that silently
    // failed before, when the only mounted popover sat under display:none.
    // (waitFor, not a bare assertion: framer-motion's opacity fade-in is a
    // real requestAnimationFrame-driven transition even in jsdom, so
    // toBeVisible() can observe it mid-fade — that's animation timing, not
    // the display:none regression this test targets.)
    const phoneInput = await screen.findByPlaceholderText(/10-digit mobile number/i)
    await waitFor(() => expect(phoneInput).toBeVisible())
  })

  it('opens the modal from the navbar control too, proving both share state', async () => {
    renderApp('/dashboard', 'open-from-page')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    const phoneInput = await screen.findByPlaceholderText(/10-digit mobile number/i)
    await waitFor(() => expect(phoneInput).toBeVisible())
  })

  it('returns the user to the page that requested login, not the home page', async () => {
    renderApp('/credit-score', 'open-from-page')
    await completeLogin({ triggerLabel: 'open-from-page' })

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/credit-score'))
    // Modal must also actually close once login completes.
    expect(screen.queryByPlaceholderText(/10-digit mobile number/i)).not.toBeInTheDocument()
  })
})
