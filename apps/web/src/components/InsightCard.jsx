import { useState } from 'react'
import { Flag, Check, Clock, X } from 'lucide-react'
import Icon from './Icon'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { flagInsight } from '../lib/feedback'

// 'idle' | 'sending' | 'flagged' | 'queued' | 'error'
export default function InsightCard({ icon, text, sourceKey, sourceRowId }) {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const [state, setState] = useState('idle')

  const handleFlag = async () => {
    if (!isAuthenticated) {
      requestLogin()
      return
    }

    setState('sending')
    const result = await flagInsight({ sourceTable: sourceKey, sourceRowId, reason: t('results.flagDataReason') })
    if (result.queued) {
      setState('queued')
    } else if (result.ok) {
      setState('flagged')
    } else {
      setState('error')
    }
  }

  const isDone = state === 'flagged' || state === 'queued'

  return (
    <div className="group relative flex items-start gap-3.5 rounded-2xl border border-primary-100 bg-white px-4 py-4 card-shadow">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-snug text-ink-900 font-medium pr-5">{text}</p>
        <p className="mt-1.5 text-[11px] text-ink-900/40">
          {t('common.source')}: {t(sourceKey)}
        </p>
      </div>
      <button
        type="button"
        onClick={handleFlag}
        disabled={isDone || state === 'sending'}
        aria-label={t('results.flagDataAria')}
        title={
          state === 'flagged'
            ? t('results.flagDataSent')
            : state === 'queued'
              ? t('results.flagDataQueued')
              : state === 'error'
                ? t('results.flagDataError')
                : t('results.flagDataAria')
        }
        className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full transition-all ${
          isDone
            ? 'text-teal-600'
            : state === 'error'
              ? 'text-red-600'
              : 'text-ink-900/0 group-hover:text-ink-900/30 hover:!text-amber-600 hover:bg-amber-50'
        }`}
      >
        {state === 'flagged' && <Check size={13} />}
        {state === 'queued' && <Clock size={13} />}
        {state === 'error' && <X size={13} />}
        {(state === 'idle' || state === 'sending') && <Flag size={12} />}
      </button>
    </div>
  )
}
