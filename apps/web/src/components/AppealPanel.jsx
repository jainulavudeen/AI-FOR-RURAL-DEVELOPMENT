import { useState } from 'react'
import { ShieldQuestion, Check, Clock, AlertTriangle, ArrowUpRight } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { requestReview, escalateAppeal } from '../lib/feedback'

// 'idle' | 'sending' | 'sent' | 'queued' | 'error'
export default function AppealPanel({ inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginSource }) {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const [state, setState] = useState('idle')
  const [appealId, setAppealId] = useState(null)
  // 'idle' | 'sending' | 'done' | 'error'
  const [escalationState, setEscalationState] = useState('idle')
  const [cpgramsReferenceId, setCpgramsReferenceId] = useState(null)

  const handleClick = async () => {
    if (!isAuthenticated) {
      requestLogin()
      return
    }

    setState('sending')
    const result = await requestReview({ inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource: marginSource })
    if (result.queued) {
      setState('queued')
    } else if (result.ok) {
      setState('sent')
      setAppealId(result.data?.id ?? null)
    } else {
      setState('error')
    }
  }

  // Only reachable once the appeal was actually saved server-side (not
  // 'queued' — escalating an appeal Workbox hasn't replayed yet would have
  // no appealId to escalate).
  const handleEscalate = async () => {
    if (!appealId) return
    setEscalationState('sending')
    const result = await escalateAppeal(appealId)
    if (result.ok) {
      setEscalationState('done')
      setCpgramsReferenceId(result.data?.cpgramsReferenceId ?? null)
    } else {
      setEscalationState('error')
    }
  }

  const isDone = state === 'sent' || state === 'queued'

  return (
    <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
      <div className="flex items-center gap-2 mb-2">
        <ShieldQuestion size={16} className="text-primary-600" />
        <span className="text-sm font-bold text-primary-900">{t('results.requestReviewTitle')}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-900/65 mb-3.5">{t('results.requestReviewBody')}</p>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDone || state === 'sending'}
        className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
          isDone
            ? 'bg-teal-600/10 text-teal-700 cursor-default'
            : state === 'error'
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-primary-700 text-white hover:bg-primary-600'
        }`}
      >
        {state === 'sent' && <Check size={15} />}
        {state === 'queued' && <Clock size={15} />}
        {state === 'error' && <AlertTriangle size={15} />}
        {(state === 'idle' || state === 'sending') && <ShieldQuestion size={15} />}
        {state === 'sent' && t('results.requestReviewSent')}
        {state === 'queued' && t('results.requestReviewQueued')}
        {state === 'error' && t('results.requestReviewError')}
        {state === 'sending' && t('results.requestReviewSending')}
        {state === 'idle' && t('results.requestReviewCta')}
      </button>

      {state === 'sent' && appealId && escalationState !== 'done' && (
        <button
          type="button"
          onClick={handleEscalate}
          disabled={escalationState === 'sending'}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline disabled:opacity-50"
        >
          <ArrowUpRight size={13} />
          {escalationState === 'sending' ? t('escalation.sending') : t('escalation.cta')}
        </button>
      )}
      {escalationState === 'error' && <p className="mt-2 text-[11px] text-red-600">{t('escalation.error')}</p>}
      {escalationState === 'done' && (
        <p className="mt-3 text-[12px] text-teal-700">
          {t('escalation.done', { referenceId: cpgramsReferenceId ?? '—' })}
        </p>
      )}
    </div>
  )
}
