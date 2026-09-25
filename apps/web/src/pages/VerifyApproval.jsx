import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BadgeCheck, CircleAlert, ShieldQuestion, WifiOff } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { verifyApproval } from '../lib/applications'

const DATE_LOCALE = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

// Public — where the QR code on a printed dossier lands. A bank officer
// with no Setu account scans it and sees whether this Verified Approval is
// genuine: who approved it, their designation, when, and whether it is
// still the current approval. It shows NOTHING about the applicant — the
// bank already holds the document; this only confirms it wasn't forged.
export default function VerifyApproval() {
  const { t, language } = useI18n()
  const { hash } = useParams()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    verifyApproval(hash).then((result) => {
      if (cancelled) return
      if (result.status === 0) setState({ status: 'offline' })
      else if (result.ok && result.data?.valid) setState({ status: 'valid', data: result.data })
      else setState({ status: 'invalid' })
    })
    return () => {
      cancelled = true
    }
  }, [hash])

  return (
    <div className="mx-auto max-w-lg px-5 sm:px-8 py-12 sm:py-16">
      <h1 className="text-center text-2xl font-extrabold text-primary-900">{t('verify.title')}</h1>
      <p className="mt-2 text-center text-sm text-ink-900/60">{t('verify.subtitle')}</p>

      <div className="mt-8 rounded-3xl border border-primary-100 bg-white p-6 card-shadow-lg">
        {state.status === 'loading' && <p className="text-center text-sm text-ink-900/50">{t('common.loading')}</p>}

        {state.status === 'offline' && (
          <p className="flex items-center justify-center gap-2 text-sm text-amber-700">
            <WifiOff size={16} />
            {t('verify.offline')}
          </p>
        )}

        {state.status === 'invalid' && (
          <div className="text-center">
            <ShieldQuestion size={40} className="mx-auto text-red-600" />
            <p className="mt-3 text-lg font-extrabold text-red-700">{t('verify.invalidTitle')}</p>
            <p className="mt-2 text-[13px] text-ink-900/65">{t('verify.invalidBody')}</p>
          </div>
        )}

        {state.status === 'valid' && (
          <div>
            <div className="text-center">
              {state.data.current ? (
                <BadgeCheck size={44} className="mx-auto text-teal-600" />
              ) : (
                <CircleAlert size={44} className="mx-auto text-amber-600" />
              )}
              <p className={`mt-3 text-lg font-extrabold ${state.data.current ? 'text-teal-700' : 'text-amber-700'}`}>
                {state.data.current ? t('verify.validTitle') : t('verify.supersededTitle')}
              </p>
              {!state.data.current && <p className="mt-1 text-[13px] text-ink-900/65">{t('verify.supersededBody')}</p>}
            </div>
            <dl className="mt-6 space-y-3">
              {[
                [t('bankDossier.approvedByLabel'), state.data.officerName],
                [t('bankDossier.officerDesignationLabel'), state.data.officerDesignation],
                [
                  t('bankDossier.approvedAtLabel'),
                  new Date(state.data.approvedAt).toLocaleString(DATE_LOCALE[language] || 'en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                ],
                ...(state.data.docRef ? [[t('verify.docRefLabel'), state.data.docRef]] : []),
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-primary-50/60 px-4 py-2.5">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-900/40">{label}</dt>
                  <dd className="text-[14px] font-bold text-primary-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-[11.5px] leading-relaxed text-ink-900/45">{t('verify.disclaimer')}</p>
      <p className="mt-2 text-center font-mono text-[10px] text-ink-900/35 break-all">{hash}</p>
    </div>
  )
}
