import { Link } from 'react-router-dom'
import { LogIn, LogOut, UserRound } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'

// Sign-in/out control, mounted in both the desktop bar and the mobile
// menu. "Sign in" always goes to the one sign-in page (/signin) via
// requestLogin(), which remembers where the user was.
export default function AuthControl() {
  const { t } = useI18n()
  const { isAuthenticated, displayName, phone, email, role, logout, requestLogin } = useAuth()

  if (isAuthenticated) {
    const who = displayName || phone || email
    return (
      <div className="flex items-center gap-3">
        <Link to="/account" className="hidden 2xl:inline-flex items-center gap-1.5 text-xs text-ink-900/60 hover:text-primary-700">
          <UserRound size={13} />
          <span className="max-w-[10rem] truncate">{who}</span>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10.5px] font-bold text-primary-700">{t(`roles.${role}`)}</span>
        </Link>
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
