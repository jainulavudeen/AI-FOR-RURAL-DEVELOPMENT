import { TrendingUp, ArrowRight, Scale } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import Icon from './Icon'

// Surfaces the single best-scoring alternative business at the applicant's
// chosen location, computed by lib/feasibility.js's getBestAlternativeBusiness
// (which reuses generateFeasibility — never a separate scoring path, per
// CLAUDE.md boundary rule 1). Only rendered by the caller when a genuine,
// above-threshold alternative exists.
export default function AlternativeBusinessCard({ business, altScore, currentScore, alternative, onViewAlternative, onCompareBoth }) {
  const { t } = useI18n()

  return (
    <div className="mt-6 rounded-2xl border-2 border-teal-500/30 bg-teal-50/50 p-5">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp size={16} className="text-teal-700" />
        <span className="text-sm font-bold text-teal-900">{t('results.alternativeTitle')}</span>
      </div>

      <p className="text-[13px] leading-relaxed text-ink-900/70 mb-4">
        {t('results.alternativeBody', {
          business: t(business.labelKey),
          score: currentScore,
          altBusiness: t(alternative.labelKey),
          altScore,
        })}
      </p>

      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white shrink-0">
          <Icon name={alternative.icon} size={19} />
        </span>
        <span className="text-base font-extrabold text-primary-900">{t(alternative.labelKey)}</span>
        <span className="ml-auto rounded-full bg-teal-700/10 px-3 py-1 text-sm font-bold text-teal-800">{altScore}</span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={onViewAlternative}
          className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 transition-colors"
        >
          {t('results.alternativeViewCta', { altBusiness: t(alternative.labelKey) })}
          <ArrowRight size={13} />
        </button>
        <button
          type="button"
          onClick={onCompareBoth}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal-600/40 px-4 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100/60 transition-colors"
        >
          <Scale size={13} />
          {t('results.alternativeCompareCta')}
        </button>
      </div>
    </div>
  )
}
