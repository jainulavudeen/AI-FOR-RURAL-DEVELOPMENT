import { useState } from 'react'
import { ShieldQuestion, Check, Clock, AlertTriangle } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { requestReview } from '../lib/feedback'

// 'idle' | 'sending' | 'sent' | 'queued' | 'error'
export default function AppealPanel({ inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginSource }) {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const [state, setState] = useState('idle')

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
    } else {
      setState('error')
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
    </div>
  )
}
