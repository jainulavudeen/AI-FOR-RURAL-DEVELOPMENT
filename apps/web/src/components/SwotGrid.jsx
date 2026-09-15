import { TrendingUp, AlertTriangle, Lightbulb, ShieldAlert } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

const QUADRANTS = [
  { key: 'strengths', icon: TrendingUp, bg: 'bg-teal-500/8', border: 'border-teal-500/20', iconBg: 'bg-teal-600 text-white' },
  { key: 'weaknesses', icon: AlertTriangle, bg: 'bg-amber-500/8', border: 'border-amber-500/25', iconBg: 'bg-amber-600 text-white' },
  { key: 'opportunities', icon: Lightbulb, bg: 'bg-primary-500/8', border: 'border-primary-400/25', iconBg: 'bg-primary-700 text-white' },
  { key: 'threats', icon: ShieldAlert, bg: 'bg-red-500/8', border: 'border-red-500/20', iconBg: 'bg-red-600 text-white' },
]

export default function SwotGrid({ businessId }) {
  const { t, raw } = useI18n()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {QUADRANTS.map((q) => {
        const Icon = q.icon
        const items = raw(`swot.${businessId}.${q.key}`) || []
        return (
          <div key={q.key} className={`rounded-2xl border ${q.border} ${q.bg} p-5`}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${q.iconBg}`}>
                <Icon size={14} />
              </span>
              <h4 className="text-sm font-bold text-primary-900">{t(`swot.label.${q.key}`)}</h4>
            </div>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className="text-[13px] leading-snug text-ink-900/75 flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
