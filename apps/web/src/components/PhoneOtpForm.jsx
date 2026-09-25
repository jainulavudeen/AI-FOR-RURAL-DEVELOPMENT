import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext'
import { requestOtp } from '../lib/auth'

const PHONE_REGEX = /^\d{10}$/
const CODE_REGEX = /^\d{6}$/

// Phone + OTP, two steps — used by the sign-in page (verify = verifyOtp)
// and by Account's "Link a phone" (verify = linkPhone). Same server-side
// rate limits and lockout either way; this only renders the steps and
// maps error codes to messages.
export default function PhoneOtpForm({ verify, onSuccess, submitLabel }) {
  const { t } = useI18n()
  const [step, setStep] = useState('phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deliveryMode, setDeliveryMode] = useState(null)

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
    if (result.status === 423) setError(lockedOutMessage(result.data?.error?.retryAfterSeconds))
    else if (result.status === 429) setError(t('auth.rateLimited'))
    else if (result.status === 0) setError(t('auth.offline'))
    else setError(t('auth.genericError'))
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    if (!CODE_REGEX.test(codeInput)) return
    setLoading(true)
    setError('')
    const result = await verify(`+91${phoneInput}`, codeInput)
    setLoading(false)
    if (result.ok) {
      onSuccess(result)
      return
    }
    const code = result.data?.error?.code
    if (code === 'INVALID_OTP') setError(t('auth.invalidCode', { attemptsRemaining: result.data.error.attemptsRemaining }))
    else if (code === 'OTP_EXPIRED_OR_NOT_FOUND') setError(t('auth.expiredCode'))
    else if (code === 'LOCKED') setError(lockedOutMessage(result.data.error.retryAfterSeconds))
    else if (code === 'RATE_LIMITED') setError(t('auth.rateLimited'))
    else if (code === 'ACCOUNT_DEACTIVATED') setError(t('auth.deactivated'))
    else if (code === 'ALREADY_LINKED_ELSEWHERE') setError(t('account.phoneTaken'))
    else if (code === 'ALREADY_HAS_METHOD') setError(t('account.alreadyHasPhone'))
    else if (result.status === 0) setError(t('auth.offline'))
    else setError(t('auth.genericError'))
  }

  if (step === 'phone') {
    return (
      <form onSubmit={handleSendCode}>
        <label htmlFor="otp-phone" className="mb-2 block text-xs font-medium text-primary-900">
          {t('auth.phoneLabel')}
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2.5 focus-within:border-primary-500">
          <span className="text-sm text-ink-900/50">+91</span>
          <input
            id="otp-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
            placeholder={t('auth.phonePlaceholder')}
            className="w-full bg-transparent text-sm text-ink-900 focus:outline-none"
          />
        </div>
        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!PHONE_REGEX.test(phoneInput) || loading}
          className="mt-4 w-full rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          {loading ? t('auth.sendingCode') : t('auth.sendCode')}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleVerify}>
      <label htmlFor="otp-code" className="mb-2 block text-xs font-medium text-primary-900">
        {t('auth.codeLabel')}
      </label>
      {deliveryMode === 'console' && (
        <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">{t('auth.consoleModeNotice')}</p>
      )}
      <input
        id="otp-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        value={codeInput}
        onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
        placeholder={t('auth.codePlaceholder')}
        className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm tracking-widest text-ink-900 focus:border-primary-500 focus:outline-none"
      />
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!CODE_REGEX.test(codeInput) || loading}
        className="mt-4 w-full rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:opacity-40"
      >
        {loading ? t('auth.verifying') : submitLabel || t('auth.verify')}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep('phone')
          setCodeInput('')
          setError('')
        }}
        className="mt-2 w-full text-center text-[12px] text-primary-600 hover:underline"
      >
        {t('auth.changeNumber')}
      </button>
    </form>
  )
}
