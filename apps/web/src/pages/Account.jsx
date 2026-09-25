import { useState } from 'react'
import { CheckCircle2, Mail, Phone, UserRound } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { linkGoogle, linkPhone } from '../lib/auth'
import GoogleButton from '../components/GoogleButton'
import PhoneOtpForm from '../components/PhoneOtpForm'

// One account, both sign-in methods. Linking only ever happens from here,
// while already signed in — the server refuses (409) if the Gmail or phone
// already belongs to a different account, so linking can never create a
// duplicate or silently merge two people.
export default function Account() {
  const { t } = useI18n()
  const { session, login } = useAuth()
  const [googleError, setGoogleError] = useState('')
  const [linked, setLinked] = useState('')

  if (!session) return null
  const hasGoogle = Boolean(session.hasGoogle)
  const hasPhone = Boolean(session.phone)

  const handleGoogle = async (credential) => {
    setGoogleError('')
    const result = await linkGoogle(credential)
    if (result.ok && result.session) {
      login(result.session)
      setLinked('google')
      return
    }
    const code = result.data?.error?.code
    if (code === 'ALREADY_LINKED_ELSEWHERE') setGoogleError(t('account.googleTaken'))
    else if (code === 'ALREADY_HAS_METHOD') setGoogleError(t('account.alreadyHasGoogle'))
    else if (result.status === 0) setGoogleError(t('auth.offline'))
    else setGoogleError(t('signIn.googleFailed'))
  }

  return (
    <div className="mx-auto max-w-lg px-5 sm:px-8 py-12 sm:py-16">
      <div className="flex items-center gap-3 mb-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-700 text-white">
          <UserRound size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-primary-900">{t('account.title')}</h1>
          <p className="text-sm text-ink-900/55">{t(`roles.${session.role}`)}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-primary-100 bg-white p-6 space-y-5">
        {(session.displayName || session.designation) && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-900/40">{t('account.nameLabel')}</p>
            <p className="text-sm font-semibold text-primary-900">{session.displayName}</p>
            {session.designation && <p className="text-[12.5px] text-ink-900/60">{session.designation}</p>}
          </div>
        )}

        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-900/40">
            <Phone size={12} />
            {t('account.phoneMethod')}
          </p>
          {hasPhone ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-primary-900">
              <CheckCircle2 size={14} className="text-teal-600" />
              {session.phone}
            </p>
          ) : linked === 'phone' ? null : (
            <div className="mt-3">
              <p className="mb-3 text-[12.5px] text-ink-900/60">{t('account.linkPhoneHint')}</p>
              <PhoneOtpForm
                verify={linkPhone}
                submitLabel={t('account.linkPhoneCta')}
                onSuccess={(result) => {
                  if (result.session) login(result.session)
                  setLinked('phone')
                }}
              />
            </div>
          )}
        </div>

        <div className="border-t border-primary-50 pt-5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-900/40">
            <Mail size={12} />
            {t('account.googleMethod')}
          </p>
          {hasGoogle ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-primary-900">
              <CheckCircle2 size={14} className="text-teal-600" />
              {session.email}
            </p>
          ) : (
            <div className="mt-3">
              <p className="mb-3 text-[12.5px] text-ink-900/60">{t('account.linkGoogleHint')}</p>
              <GoogleButton text="continue_with" onCredential={handleGoogle} />
              {googleError && <p className="mt-2 text-[12px] text-red-600">{googleError}</p>}
            </div>
          )}
        </div>

        {linked && <p className="rounded-xl bg-teal-50 px-3 py-2 text-[12.5px] font-semibold text-teal-800">{t('account.linkedSuccess')}</p>}
      </div>
    </div>
  )
}
