import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogIn, LogOut, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { requestOtp, verifyOtp } from '../lib/auth'

const PHONE_REGEX = /^\d{10}$/
const CODE_REGEX = /^\d{6}$/

// Phone + SMS OTP sign-in — a small popover off the navbar, not a page.
// "Flag this data" / "Request Human Review" open this via
// useAuth().requestLogin() when the user isn't signed in yet.
export default function OtpLogin() {
  const { t } = useI18n()
  const { phone, isAuthenticated, login, logout, loginRequested, clearLoginRequest } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (loginRequested) setOpen(true)
  }, [loginRequested])
  const [step, setStep] = useState('phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deliveryMode, setDeliveryMode] = useState(null)

  const reset = () => {
    setStep('phone')
    setPhoneInput('')
    setCodeInput('')
    setError('')
    setLoading(false)
    setDeliveryMode(null)
  }

  const close = () => {
    setOpen(false)
    clearLoginRequest()
    reset()
  }

  const lockedOutMessage = (retryAfterSeconds) => t('auth.lockedOut', { minutes: Math.ceil((retryAfterSeconds ?? 900) / 60) })

  const handleSendCode = async (event) => {
    event.preventDefault()
    if (!PHONE_REGEX.test(phoneInput)) return

    setLoading(true)
    setError('')
    const result = await requestOtp(`+91${phoneInput}`)
    setLoading(false)

    if (result.ok) {
      setDeliveryMode(result.data?.deliveryMode ?? null)
      setStep('code')
      return
    }
    if (result.status === 423) {
      setError(lockedOutMessage(result.data?.error?.retryAfterSeconds))
    } else if (result.status === 429) {
      setError(t('auth.rateLimited'))
    } else {
      setError(t('auth.genericError'))
    }
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    if (!CODE_REGEX.test(codeInput)) return

    setLoading(true)
    setError('')
    const result = await verifyOtp(`+91${phoneInput}`, codeInput)
    setLoading(false)

    if (result.ok) {
      login(result.session)
      close()
      return
    }

    const code = result.data?.error?.code
    if (code === 'INVALID_OTP') {
      setError(t('auth.invalidCode', { attemptsRemaining: result.data.error.attemptsRemaining }))
    } else if (code === 'OTP_EXPIRED_OR_NOT_FOUND') {
      setError(t('auth.expiredCode'))
    } else if (code === 'LOCKED') {
      setError(lockedOutMessage(result.data.error.retryAfterSeconds))
    } else if (code === 'RATE_LIMITED') {
      setError(t('auth.rateLimited'))
    } else {
      setError(t('auth.genericError'))
    }
  }

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
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
      >
        <LogIn size={13} />
        {t('auth.signIn')}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-primary-100 bg-white p-5 card-shadow-lg"
          >
            <button
              type="button"
              onClick={close}
              aria-label={t('auth.close')}
              className="absolute right-3 top-3 text-ink-900/40 hover:text-ink-900"
            >
              <X size={16} />
            </button>

            {step === 'phone' && (
              <form onSubmit={handleSendCode}>
                <label className="mb-2 block text-xs font-medium text-primary-900">{t('auth.phoneLabel')}</label>
                <div className="flex items-center gap-2 rounded-xl border border-primary-200 px-3 py-2.5 focus-within:border-primary-500">
                  <span className="text-sm text-ink-900/50">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('auth.phonePlaceholder')}
                    className="w-full bg-transparent text-sm text-ink-900 focus:outline-none"
                  />
                </div>
                {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={!PHONE_REGEX.test(phoneInput) || loading}
                  className="mt-4 w-full rounded-full bg-amber-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-amber-400 disabled:opacity-40"
                >
                  {loading ? t('auth.sendingCode') : t('auth.sendCode')}
                </button>
              </form>
            )}

            {step === 'code' && (
              <form onSubmit={handleVerify}>
                <label className="mb-2 block text-xs font-medium text-primary-900">{t('auth.codeLabel')}</label>
                {deliveryMode === 'console' && (
                  <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
                    {t('auth.consoleModeNotice')}
                  </p>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('auth.codePlaceholder')}
                  className="w-full rounded-xl border border-primary-200 px-3 py-2.5 text-sm tracking-widest text-ink-900 focus:border-primary-500 focus:outline-none"
                />
                {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={!CODE_REGEX.test(codeInput) || loading}
                  className="mt-4 w-full rounded-full bg-amber-500 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-amber-400 disabled:opacity-40"
                >
                  {loading ? t('auth.verifying') : t('auth.verify')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="mt-2 w-full text-center text-[11px] text-primary-600 hover:underline"
                >
                  {t('auth.changeNumber')}
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
