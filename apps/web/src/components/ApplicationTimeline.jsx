import { Check } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { STATUS_STYLES } from '../lib/applications'

const DATE_LOCALE = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

export function StatusBadge({ status }) {
  const { t } = useI18n()
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status] ?? ''}`}>
      {t(`applications.status.${status}`)}
    </span>
  )
}

// The fixed path every application walks, drawn as steps:
//   Draft → Submitted → Under review → Approved / Rejected / More info needed
// Reached steps show when they happened (from the application's own
// append-only event history); the final step shows whichever outcome
// actually happened. A resubmission loops back, so each step shows its
// MOST RECENT time.
export default function ApplicationTimeline({ application }) {
  const { t, language } = useI18n()
  const events = application.events ?? []
  const lastAt = (status) => [...events].reverse().find((e) => e.toStatus === status)?.createdAt ?? null
  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleString(DATE_LOCALE[language] || 'en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  const outcome = ['approved', 'rejected', 'more_info'].includes(application.status) ? application.status : null
  const order = ['draft', 'submitted', 'under_review', 'outcome']
  const currentIndex = outcome ? 3 : order.indexOf(application.status)

  const steps = [
    { key: 'draft', label: t('applications.status.draft'), at: lastAt('draft') },
    { key: 'submitted', label: t('applications.status.submitted'), at: lastAt('submitted') },
    { key: 'under_review', label: t('applications.status.under_review'), at: lastAt('under_review') },
    {
      key: 'outcome',
      label: outcome ? t(`applications.status.${outcome}`) : t('applications.timeline.decision'),
      at: outcome ? lastAt(outcome) : null,
      tone: outcome,
    },
  ]

  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start" aria-label={t('applications.timeline.label')}>
      {steps.map((step, i) => {
        const reached = i <= currentIndex
        const isCurrent = i === currentIndex
        const dot =
          step.tone === 'rejected'
            ? 'bg-red-600 text-white'
            : step.tone === 'more_info'
              ? 'bg-orange-500 text-white'
              : reached
                ? 'bg-teal-600 text-white'
                : 'bg-primary-50 text-ink-900/30 border border-primary-100'
        return (
          <li key={step.key} className="flex flex-1 items-start gap-2.5 sm:flex-col sm:items-center sm:text-center">
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span className={`hidden h-0.5 flex-1 sm:block ${i === 0 ? 'invisible' : reached ? 'bg-teal-600' : 'bg-primary-100'}`} />
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${dot}`}>
                {reached ? <Check size={13} /> : i + 1}
              </span>
              <span className={`hidden h-0.5 flex-1 sm:block ${i === steps.length - 1 ? 'invisible' : i < currentIndex ? 'bg-teal-600' : 'bg-primary-100'}`} />
              <span className={`my-0.5 h-4 w-0.5 sm:hidden ${i === steps.length - 1 ? 'invisible' : i < currentIndex ? 'bg-teal-600' : 'bg-primary-100'}`} />
            </div>
            <div className="pb-2 sm:mt-1.5 sm:px-1">
              <p className={`text-[12px] font-bold ${isCurrent ? 'text-primary-900' : reached ? 'text-ink-900/70' : 'text-ink-900/35'}`}>{step.label}</p>
              {reached && step.at && <p className="text-[10.5px] text-ink-900/45">{fmt(step.at)}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
