import { useI18n } from '../i18n/I18nContext'
import Icon from './Icon'

export default function SocialSchemesPanel({ schemes }) {
  const { t } = useI18n()

  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-primary-900">{t('results.alsoEligibleTitle')}</h3>
      {schemes.length === 0 ? (
        <p className="text-[12px] text-ink-900/40 leading-relaxed">{t('results.alsoEligibleNone')}</p>
      ) : (
        <>
          <p className="mb-3 text-[11px] text-ink-900/40 leading-relaxed">{t('results.alsoEligibleSubtitle')}</p>
          <div className="space-y-2.5">
            {schemes.map((s) => (
              <div key={s.id} className="flex items-start gap-3 rounded-xl border border-teal-600/20 bg-teal-600/5 px-3.5 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
                  <Icon name={s.icon} size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-primary-900 leading-snug">{t(s.nameKey)}</p>
                  <p className="mt-0.5 text-[11px] text-ink-900/55 leading-snug">{t(s.descKey)}</p>
                  {s.ministryNoteKey && (
                    <p className="mt-1 text-[10.5px] text-amber-700 leading-snug">{t(s.ministryNoteKey)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
