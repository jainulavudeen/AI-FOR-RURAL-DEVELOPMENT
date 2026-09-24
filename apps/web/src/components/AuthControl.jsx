import { LogIn, LogOut } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'

// Lean sign-in/out control, safe to mount more than once (desktop bar +
// mobile menu) since it holds no popover state of its own — it only reads
// shared AuthContext and opens the single global AuthModal via
// requestLogin(). See AuthModal.jsx for why the popover moved out of here.
export default function AuthControl() {
  const { t } = useI18n()
  const { phone, isAuthenticated, logout, requestLogin } = useAuth()

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-xs text-ink-900/60">{t('auth.signedInAs', { phone })}</span>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
        >
          <LogOut size={13} />
          {t('auth.signOut')}
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={requestLogin}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
    >
      <LogIn size={13} />
      {t('auth.signIn')}
    </button>
  )
}
