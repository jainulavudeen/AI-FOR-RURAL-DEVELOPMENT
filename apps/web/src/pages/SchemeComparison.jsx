import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Percent, Calendar, Clock, Wallet, Landmark, Users, ArrowRight } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { SCHEMES } from '@setu/core'
import { formatINR } from '../lib/format'
import Icon from '../components/Icon'

const ROWS = [
  { icon: Wallet, labelKey: 'scheme.colProjectCost', render: (s) => `${formatINR(s.projectCostMin)} – ${formatINR(s.projectCostMax)}` },
  { icon: Landmark, labelKey: 'scheme.colLoanCap', render: (s) => formatINR(s.loanCap) },
  { icon: Percent, labelKey: 'scheme.colInterest', render: (s, t) => `${s.interestRate}% ${t('common.perAnnum')}` },
  { icon: Calendar, labelKey: 'scheme.colTenure', render: (s, t) => `${s.tenureYears} ${t('common.years')}` },
  { icon: Clock, labelKey: 'scheme.colMoratorium', render: (s, t) => `${s.moratoriumMonths} ${t('common.months')}` },
]

export default function SchemeComparison() {
  const { t } = useI18n()
  const schemes = [SCHEMES.micro_finance, SCHEMES.term_loan]
  const bestFor = { micro_finance: 'scheme.bestForMicro', term_loan: 'scheme.bestForTerm' }

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <h1 className="text-3xl font-extrabold text-primary-900">{t('scheme.compareTitle')}</h1>
        <p className="mt-3 text-ink-900/60">{t('scheme.compareSubtitle')}</p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-primary-100 card-shadow-lg bg-white">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="w-56 px-6 py-6 text-left align-bottom">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-900/40">{t('scheme.colFeature')}</span>
              </th>
              {schemes.map((s, idx) => (
                <th key={s.id} className={`px-6 py-6 text-left align-bottom ${idx === 0 ? 'border-l border-primary-100' : 'border-l border-primary-100'}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-700 text-white">
                      <Icon name={s.icon} size={20} />
                    </span>
                    <div>
                      <p className="text-base font-extrabold text-primary-900">{t(s.nameKey)}</p>
                    </div>
                  </motion.div>
                  <p className="mt-3 text-xs text-ink-900/50 leading-relaxed max-w-[220px]">{t(`scheme.${s.id}.desc`)}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const RowIcon = row.icon
              return (
                <tr key={row.labelKey} className="border-t border-primary-50">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2.5 text-ink-900/60">
                      <RowIcon size={15} className="text-primary-500" />
                      <span className="text-sm font-medium">{t(row.labelKey)}</span>
                    </div>
                  </td>
                  {schemes.map((s, idx) => (
                    <td key={s.id} className={`px-6 py-5 text-sm font-bold text-primary-900 ${idx === 0 ? 'border-l border-primary-50' : 'border-l border-primary-50'}`}>
                      {row.render(s, t)}
                    </td>
                  ))}
                </tr>
              )
            })}
            <tr className="border-t border-primary-50 bg-primary-50/40">
              <td className="px-6 py-5">
                <div className="flex items-center gap-2.5 text-ink-900/60">
                  <Users size={15} className="text-primary-500" />
                  <span className="text-sm font-medium">{t('scheme.colBestFor')}</span>
                </div>
              </td>
              {schemes.map((s, idx) => (
                <td key={s.id} className={`px-6 py-5 text-[13px] leading-snug text-ink-900/70 ${idx === 0 ? 'border-l border-primary-100' : 'border-l border-primary-100'}`}>
                  {t(bestFor[s.id])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-14 text-center">
        <h2 className="text-xl font-bold text-primary-900">{t('scheme.ctaTitle')}</h2>
        <Link
          to="/eligibility"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-500 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-amber-900/20 hover:bg-amber-400 transition-colors"
        >
          {t('scheme.ctaButton')}
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  )
}
