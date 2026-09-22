import { Landmark, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext'

// Compact Results-page card pointing at the full /schemes matcher, instead
// of listing every scheme inline — keeps Results focused on the one
// recommended scheme + EMI, and pushes "browse everything, see why, see
// how to apply" to its own dedicated screen. See CLAUDE.md's target user:
// one task per screen beats one long scroll.
export default function SchemeEligibilityTeaser({ matchedCount, totalCount }) {
  const { t } = useI18n()
  return (
    <div className="rounded-2xl border-2 border-teal-600/25 bg-teal-600/5 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
          <Landmark size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-primary-900">{t('eligibility.teaserTitle', { count: matchedCount })}</p>
          <p className="mt-0.5 text-[11.5px] text-ink-900/55 leading-snug">{t('eligibility.teaserSubtitle', { total: totalCount })}</p>
        </div>
      </div>
      <Link
        to="/schemes"
        className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-[13px] font-bold text-white hover:bg-teal-500 transition-colors"
      >
        {t('eligibility.teaserCta')}
        <ArrowRight size={15} />
      </Link>
    </div>
  )
}
