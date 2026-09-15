import { TrendingDown } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

export default function CostOfInactionCard({ informalRate, schemeRate, isEstimate }) {
  const { t } = useI18n()

  return (
    <div className="mt-6 rounded-2xl border border-teal-600/20 bg-teal-600/5 p-5">
      <div className="flex items-center gap-2 mb-2">
        <TrendingDown size={16} className="text-teal-700" />
        <span className="text-sm font-bold text-teal-800">{t('results.costOfInactionTitle')}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-900/65 mb-3.5">
        {t('results.costOfInactionBody', { informalRate, schemeRate })}
      </p>
      {isEstimate && (
        <p className="text-[11px] leading-relaxed text-ink-900/45 mb-3.5 italic">
          {t('results.costOfInactionEstimateNote')}
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2.5 rounded-full bg-red-100 overflow-hidden">
            <div className="h-full bg-red-400 rounded-full" style={{ width: '100%' }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-900/50">{informalRate}% <span className="text-ink-900/35">{t('results.informalLabel')}</span></p>
        </div>
        <div className="flex-1">
          <div className="h-2.5 rounded-full bg-teal-100 overflow-hidden">
            <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(schemeRate / informalRate) * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-900/50">{schemeRate}% <span className="text-ink-900/35">{t('results.formalLabel')}</span></p>
        </div>
      </div>
    </div>
  )
}
