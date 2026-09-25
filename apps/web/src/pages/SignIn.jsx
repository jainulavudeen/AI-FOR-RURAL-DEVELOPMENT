import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { roleHome, signInWithGoogle, verifyOtp } from '../lib/auth'
import { safeNextPath } from '../lib/routeAccess'
import GoogleButton from '../components/GoogleButton'
import PhoneOtpForm from '../components/PhoneOtpForm'

// The ONE sign-in page — every "Sign in" in the app routes here
// (AuthContext.requestLogin). Two methods, one account: Google (verified
// server-side from the GIS ID token) or phone OTP. After sign-in the role
// FROM THE SERVER decides where you land: back to the page you were
// opening if your role can use it, else your role's home — applicant →
// My Dashboard, officer → Review Queue, admin → Admin Portal. Nobody can
// sign up as an officer or admin here; every new account is an applicant.
export default function SignIn() {
  const { t } = useI18n()
  const { isAuthenticated, role, login } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [googleError, setGoogleError] = useState('')
  const [googleAvailable, setGoogleAvailable] = useState(true)
  const next = params.get('next')

  const finish = (session) => {
    login(session)
    navigate(safeNextPath(next, session.role) ?? roleHome(session.role), { replace: true })
  }

  if (isAuthenticated) {
    return <Navigate to={safeNextPath(next, role) ?? roleHome(role)} replace />
  }

  const handleGoogle = async (credential) => {
    setGoogleError('')
    const result = await signInWithGoogle(credential)
    if (result.ok) {
      finish(result.session)
      return
    }
    const code = result.data?.error?.code
    if (code === 'ACCOUNT_DEACTIVATED') setGoogleError(t('auth.deactivated'))
    else if (code === 'GOOGLE_EMAIL_UNVERIFIED') setGoogleError(t('signIn.googleUnverified'))
    else if (result.status === 0) setGoogleError(t('auth.offline'))
    else setGoogleError(t('signIn.googleFailed'))
  }

  return (
    <div className="mx-auto max-w-md px-5 sm:px-8 py-12 sm:py-16">
      <div className="text-center mb-7">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
          <LogIn size={22} />
        </span>
        <h1 className="text-2xl font-extrabold text-primary-900">{t('signIn.title')}</h1>
        <p className="mt-2 text-sm text-ink-900/60">{next ? t('signIn.subtitleContinue') : t('signIn.subtitle')}</p>
      </div>

      <div className="rounded-3xl border border-primary-100 bg-white p-6 sm:p-7 card-shadow-lg">
        {googleAvailable && (
          <>
            <GoogleButton onCredential={handleGoogle} onUnavailable={() => setGoogleAvailable(false)} />
            {googleError && <p className="mt-2 text-center text-[12px] text-red-600">{googleError}</p>}
            <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-ink-900/35">
              <span className="h-px flex-1 bg-primary-100" />
              {t('signIn.or')}
              <span className="h-px flex-1 bg-primary-100" />
            </div>
          </>
        )}

        <PhoneOtpForm verify={verifyOtp} onSuccess={(result) => finish(result.session)} />
      </div>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-ink-900/50">{t('signIn.newAccountNote')}</p>
      <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-900/50">{t('signIn.staffNote')}</p>
    </div>
  )
}
