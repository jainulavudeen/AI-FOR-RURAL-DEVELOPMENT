import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Landmark, ArrowRight, Pencil } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAppData } from '../context/AppDataContext'
import { getEligibleSchemes, SCHEME_REFERENCES, structureFinance } from '@setu/core'
import { formatINR } from '../lib/format'
import SchemeEligibilityCard from '../components/SchemeEligibilityCard'

// "Government Schemes & Loan Matcher" — every scheme Setu knows about
// (the two cost-band-routed generic schemes plus the seven category-based
// corporations), ranked against the applicant's own report when one
// exists. Card-first, not a dense table: see CLAUDE.md's target user.
export default function SchemeComparison() {
  const { t } = useI18n()
  const { selection, hasReport } = useAppData()
  const [tab, setTab] = useState('matched')

  const personalized = hasReport && !!selection.businessId

  const finance = useMemo(() => structureFinance(selection.margin), [selection.margin])

  // Lazy initializer: the recommended generic scheme starts expanded when
  // there's a real report to recommend one from, nothing does otherwise —
  // computed once, not re-derived on every render.
  const [expandedId, setExpandedId] = useState(() => (personalized ? finance.scheme.id : null))

  const schemes = useMemo(
    () =>
      getEligibleSchemes({
        projectCost: finance.projectCost,
        categoryId: selection.categoryId,
        isWomanOwned: selection.isWomanOwned,
        stateId: selection.stateId,
      }),
    [finance.projectCost, selection.categoryId, selection.isWomanOwned, selection.stateId]
  )

  const matched = schemes.filter((s) => s.eligible)
  const visible = personalized && tab === 'matched' ? matched : schemes

  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 sm:py-20">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
          <Landmark size={22} />
        </span>
        <h1 className="text-3xl font-extrabold text-primary-900">{t('scheme.compareTitle')}</h1>
        <p className="mt-3 text-ink-900/60">{t('scheme.compareSubtitle')}</p>
      </div>

      {personalized ? (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 px-5 py-3.5">
            <p className="text-[12.5px] font-medium text-primary-800">
              {t('eligibility.rankedAgainst', { amount: formatINR(finance.projectCost) })}
            </p>
            <Link
              to="/eligibility"
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary-700 hover:text-primary-900"
            >
              <Pencil size={12} />
              {t('common.editInputs')}
            </Link>
          </div>

          <div className="mb-6 flex gap-2">
            <button
              type="button"
              onClick={() => setTab('matched')}
              className={`flex-1 rounded-xl px-4 py-3 text-[13px] font-bold transition-colors ${
                tab === 'matched' ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
              }`}
            >
              {t('eligibility.tabMatched', { count: matched.length })}
            </button>
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`flex-1 rounded-xl px-4 py-3 text-[13px] font-bold transition-colors ${
                tab === 'all' ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
              }`}
            >
              {t('eligibility.tabAll', { count: schemes.length })}
            </button>
          </div>
        </>
      ) : (
        <div className="mb-8 rounded-2xl border-2 border-amber-500/30 bg-amber-50/60 px-5 py-4 text-center">
          <p className="text-[13px] text-amber-900/80 leading-relaxed">{t('eligibility.browseHint')}</p>
          <Link
            to="/eligibility"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-400 transition-colors"
          >
            {t('scheme.ctaButton')}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {personalized && tab === 'matched' && matched.length === 0 && (
        <p className="mb-6 text-center text-[13px] text-ink-900/50 leading-relaxed">{t('eligibility.noMatches')}</p>
      )}

      <div className="space-y-3">
        {visible.map((item, idx) => (
          <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: idx * 0.04 }}>
            <SchemeEligibilityCard
              item={item}
              facts={buildFacts(item, t)}
              reference={SCHEME_REFERENCES[item.id]}
              personalized={personalized}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
            />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function buildFacts(item, t) {
  if (item.kind === 'generic') {
    const s = item.scheme
    return [
      { icon: 'Landmark', label: t('scheme.colLoanCap'), value: `${t('scheme.colLoanCap')}: ${formatINR(s.loanCap)}` },
      { icon: 'Percent', label: t('scheme.colInterest'), value: `${s.interestRate}% ${t('common.perAnnum')}` },
      { icon: 'Calendar', label: t('scheme.colTenure'), value: `${s.tenureYears} ${t('common.years')}` },
    ]
  }
  if (item.kind === 'national' && item.scheme.projectCostMin != null && item.scheme.projectCostMax != null) {
    return [
      {
        icon: 'Wallet',
        label: t('scheme.colProjectCost'),
        value: `${formatINR(item.scheme.projectCostMin)} – ${formatINR(item.scheme.projectCostMax)}`,
      },
    ]
  }
  const ref = SCHEME_REFERENCES[item.id]
  if (ref?.maxAmount != null) {
    return [{ icon: 'Landmark', label: t('eligibility.maxAmountLabel'), value: t('eligibility.upToAmount', { amount: formatINR(ref.maxAmount) }) }]
  }
  return []
}
