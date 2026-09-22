import { CalendarClock } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

// "What's Happening Near You" — reads packages/core's static
// FESTIVAL_CALENDAR (see that file's header for why it's a static dataset,
// not a live calendar integration). Renders fully offline: getUpcomingFestivals
// is pure/synchronous, called once by the parent Dashboard with no network
// round-trip of its own.
export default function FestivalDemandCard({ festivals }) {
  const { t } = useI18n()

  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-6">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock size={16} className="text-primary-600" />
        <span className="text-sm font-bold text-primary-900">{t('dashboard.festivalCardTitle')}</span>
      </div>
      <p className="text-[12px] text-ink-900/50 mb-4">{t('dashboard.festivalCardSubtitle')}</p>

      {festivals.length === 0 ? (
        <p className="text-[13px] text-ink-900/45">{t('dashboard.festivalEmpty')}</p>
      ) : (
        <div className="space-y-3">
          {festivals.map((f) => (
            <div key={f.id} className="rounded-2xl border border-primary-50 bg-primary-50/40 px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-extrabold text-primary-900">{t(f.nameKey)}</p>
                <span className="shrink-0 rounded-full bg-primary-700 px-2.5 py-0.5 text-[10.5px] font-bold text-white">
                  {t('dashboard.daysLeft', { count: f.daysLeft })}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-900/35">{t('dashboard.priorityStock')}</p>
              <p className="text-[12px] text-ink-900/65">{f.stockCategoryKeys.map((k) => t(k)).join(', ')}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11.5px] font-bold text-teal-700">{t('dashboard.surgeEstimate', { percent: f.demandSurgePercent })}</span>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-ink-900/35 leading-snug">{t('dashboard.surgeDisclaimer')}</p>
        </div>
      )}
    </div>
  )
}
