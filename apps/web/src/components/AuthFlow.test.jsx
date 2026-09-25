import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { I18nProvider } from '../i18n/I18nContext'
import { AuthProvider, useAuth } from '../context/AuthContext'
import AuthControl from './AuthControl'
import RequireRole from './RequireRole'
import SignIn from '../pages/SignIn'
import * as authLib from '../lib/auth'
import { safeNextPath } from '../lib/routeAccess'

// Every sign-in entry point (navbar, a page's own gate, a guarded route)
// goes to the ONE /signin page, and after sign-in the role returned by the
// server decides where the user lands: back where they were if their role
// may open it, otherwise their role's home.

function PageGateButton() {
  const { requestLogin } = useAuth()
  return (
    <button type="button" onClick={requestLogin}>
      gated-action
    </button>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderApp(initialPath) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <LocationProbe />
          <AuthControl />
          <Routes>
            <Route path="/" element={<PageGateButton />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/credit-score" element={<RequireRole roles={['applicant']}>credit-score-page</RequireRole>} />
            <Route path="/dashboard" element={<RequireRole roles={['applicant']}>applicant-home</RequireRole>} />
            <Route path="/review" element={<RequireRole roles={['officer']}>officer-home</RequireRole>} />
            <Route path="/admin" element={<RequireRole roles={['admin']}>admin-home</RequireRole>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>
  )
}

function mockSignIn(role) {
  vi.spyOn(authLib, 'verifyOtp').mockResolvedValue({
    ok: true,
    status: 200,
    session: { accessToken: 'tok', refreshToken: 'ref', phone: '+919876543210', role },
  })
}

async function completePhoneLogin() {
  const phoneInput = await screen.findByPlaceholderText(/10-digit mobile number/i)
  fireEvent.change(phoneInput, { target: { value: '9876543210' } })
  fireEvent.click(screen.getByRole('button', { name: /send code/i }))
  await waitFor(() => expect(authLib.requestOtp).toHaveBeenCalledWith('+919876543210'))
  const codeInput = await screen.findByPlaceholderText(/6-digit code/i)
  fireEvent.change(codeInput, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /^verify$/i }))
  await waitFor(() => expect(authLib.verifyOtp).toHaveBeenCalledWith('+919876543210', '123456'))
}

const location = () => screen.getByTestId('location').textContent

describe('one sign-in page, role-based landing', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.spyOn(authLib, 'requestOtp').mockResolvedValue({ ok: true, status: 200, data: { deliveryMode: 'sms' } })
    vi.spyOn(authLib, 'getAuthConfig').mockResolvedValue({ googleClientId: null })
    vi.spyOn(authLib, 'fetchMe').mockResolvedValue(undefined)
  })

  it('a guarded page sends a signed-out visitor to /signin, remembering where they were going', async () => {
    renderApp('/credit-score')
    await waitFor(() => expect(location()).toBe('/signin?next=%2Fcredit-score'))
    expect(screen.queryByText('credit-score-page')).not.toBeInTheDocument()
  })

  it('a page-level gate and the navbar button both go to the same sign-in page', async () => {
    renderApp('/')
    fireEvent.click(screen.getByText('gated-action'))
    await waitFor(() => expect(location()).toBe('/signin?next=%2F'))
    expect(await screen.findByPlaceholderText(/10-digit mobile number/i)).toBeInTheDocument()
  })

  it('returns an applicant to the page they were opening', async () => {
    mockSignIn('applicant')
    renderApp('/credit-score')
    await completePhoneLogin()
    await waitFor(() => expect(location()).toBe('/credit-score'))
    expect(screen.getByText('credit-score-page')).toBeInTheDocument()
  })

  it('an officer who was sent from an applicant page lands on the Review Queue instead', async () => {
    mockSignIn('officer')
    renderApp('/credit-score')
    await completePhoneLogin()
    await waitFor(() => expect(location()).toBe('/review'))
  })

  it('an admin signing in with no destination lands on the Admin Portal', async () => {
    mockSignIn('admin')
    renderApp('/signin')
    await completePhoneLogin()
    await waitFor(() => expect(location()).toBe('/admin'))
  })

  it('a signed-in applicant opening an admin page is sent to their own dashboard', async () => {
    localStorage.setItem('setu.auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'ref', role: 'applicant' }))
    renderApp('/admin')
    await waitFor(() => expect(location()).toBe('/dashboard'))
    expect(screen.queryByText('admin-home')).not.toBeInTheDocument()
  })
})

describe('safeNextPath', () => {
  it('never honours an off-site or protocol-relative redirect', () => {
    expect(safeNextPath('//evil.example/x', 'applicant')).toBeNull()
    expect(safeNextPath('https://evil.example', 'applicant')).toBeNull()
  })

  it('honours an in-app path only when the role may open it', () => {
    expect(safeNextPath('/credit-score?x=1', 'applicant')).toBe('/credit-score?x=1')
    expect(safeNextPath('/admin', 'applicant')).toBeNull()
    expect(safeNextPath('/bank-dossier/abc', 'officer')).toBe('/bank-dossier/abc')
  })
})
