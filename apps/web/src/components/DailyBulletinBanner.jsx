import { Link } from 'react-router-dom'
import { Plus, BookOpen, Landmark } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

// The Dashboard's top banner — a greeting plus the 3 actions a returning
// applicant reaches for most: log today's sale, open the full ledger,
// check government schemes. onLogSale opens LogSaleModal directly (no
// route change) so logging a sale never costs more than one tap from
// wherever the applicant lands.
export default function DailyBulletinBanner({ phone, onLogSale }) {
  const { t } = useI18n()

  return (
    <div className="rounded-3xl bg-primary-950 px-6 py-8 sm:px-8 sm:py-10 text-white">
      <p className="text-lg sm:text-xl font-extrabold">{t('dashboard.greeting', { phone })}</p>
      <p className="mt-2 max-w-2xl text-[13px] text-white/70 leading-relaxed">{t('dashboard.bulletinBody')}</p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={onLogSale}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-amber-400 transition-colors"
        >
          <Plus size={15} />
          {t('dashboard.logSaleCta')}
        </button>
        <Link
          to="/bahi-khata"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-white/20 transition-colors"
        >
          <BookOpen size={15} />
          {t('dashboard.viewLedgerCta')}
        </Link>
        <Link
          to="/schemes"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-white/20 transition-colors"
        >
          <Landmark size={15} />
          {t('dashboard.viewSchemesCta')}
        </Link>
      </div>
    </div>
  )
}
