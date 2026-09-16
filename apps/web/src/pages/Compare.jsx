import { useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { structureFinance, buildEmiSchedule } from '@setu/core'
import { useI18n } from '../i18n/I18nContext'
import { useAppData } from '../context/AppDataContext'
import { LOCATIONS } from '../data/locations'
import { BUSINESS_TYPES } from '../data/businesses'
import { generateFeasibility } from '../lib/feasibility'
import { formatINR } from '../lib/format'
import Icon from '../components/Icon'
import RadialGauge from '../components/RadialGauge'

// Same feasibility factors, same scheme routing, same EMI math as the
// single-business Results page — this deliberately reuses
// generateFeasibility/@setu/core rather than a parallel implementation
// (CLAUDE.md rule 1: the calculator is never forked). Scoped difference
// from Results.jsx: this view intentionally skips the live
// Agmarknet/Census/grounding overlay fetches (getFeasibilityScore et al.)
// that Results.jsx layers on for a single business — running 2-3 of those
// in parallel for a side-by-side table added real complexity for a
// comparison view whose job is a fast, at-a-glance first look, not the
// fully-grounded final report. "View Full Report" on any column takes the
// applicant to the real Results page, real overlays included.
export default function Compare() {
  const { t, language } = useI18n()
  const { selection, compareBusinessIds, hasComparison, updateSelection, setHasReport } = useAppData()
  const navigate = useNavigate()

  useEffect(() => {
    if (!hasComparison || compareBusinessIds.length < 2 || !selection.stateId || !selection.districtId || !selection.blockId) {
      navigate('/eligibility', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasComparison])

  const finance = useMemo(() => structureFinance(selection.margin), [selection.margin])

  const rows = useMemo(
    () =>
      compareBusinessIds.map((businessId) => {
        const business = BUSINESS_TYPES.find((b) => b.id === businessId)
        const feasibility = generateFeasibility({
          businessId,
          stateId: selection.stateId,
          districtId: selection.districtId,
          blockId: selection.blockId,
        })
        const schedule = buildEmiSchedule({
          loanAmount: finance.loanAmount,
          interestRate: finance.scheme.interestRate,
          tenureYears: finance.scheme.tenureYears,
          moratoriumMonths: finance.scheme.moratoriumMonths,
        })
        return { business, feasibility, schedule }
      }),
    [compareBusinessIds, selection.stateId, selection.districtId, selection.blockId, finance]
  )

  if (!hasComparison || compareBusinessIds.length < 2) return null

  const districtObj = LOCATIONS[selection.stateId]?.districts.find((d) => d.id === selection.districtId)
  const districtLabelKey = districtObj?.labelKey
  const blockLabelKey = districtObj?.blocks.find((b) => b.id === selection.blockId)?.labelKey
  const stateLabelKey = LOCATIONS[selection.stateId]?.labelKey

  const viewFullReport = (businessId) => {
    updateSelection({ businessId })
    setHasReport(true)
    navigate('/results')
  }

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-900">{t('compare.pageTitle')}</h1>
          <p className="mt-2 text-sm text-ink-900/60">
            {t('compare.pageSubtitle', {
              block: t(blockLabelKey),
              district: t(districtLabelKey),
              state: t(stateLabelKey),
            })}
          </p>
        </div>
        <Link
          to="/eligibility"
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors self-start"
        >
          {t('compare.backToWizard')}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-primary-100 bg-white card-shadow-lg">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="w-48 px-5 py-5 text-left align-bottom">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-900/40">
                  {t('scheme.colFeature')}
                </span>
              </th>
              {rows.map(({ business }) => (
                <th key={business.id} className="px-5 py-5 text-left align-bottom border-l border-primary-100">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white">
                      <Icon name={business.icon} size={17} />
                    </span>
                    <span className="text-sm font-extrabold text-primary-900">{t(business.labelKey)}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            <tr className="border-t border-primary-50">
              <td className="px-5 py-4 font-medium text-ink-900/60">{t('compare.colFeasibilityScore')}</td>
              {rows.map(({ business, feasibility }) => (
                <td key={business.id} className="px-5 py-4 border-l border-primary-50">
                  <div className="scale-75 origin-left -my-6">
                    <RadialGauge score={feasibility.score} verdict={t(feasibility.verdictKey)} />
                  </div>
                </td>
              ))}
            </tr>
            <tr className="border-t border-primary-50">
              <td className="px-5 py-4 font-medium text-ink-900/60">{t('compare.colScheme')}</td>
              {rows.map(({ business }) => (
                <td key={business.id} className="px-5 py-4 border-l border-primary-50 font-semibold text-primary-900">
                  {t(finance.scheme.nameKey)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-primary-50">
              <td className="px-5 py-4 font-medium text-ink-900/60">{t('compare.colProjectCost')}</td>
              {rows.map(({ business }) => (
                <td key={business.id} className="px-5 py-4 border-l border-primary-50">{formatINR(finance.projectCost)}</td>
              ))}
            </tr>
            <tr className="border-t border-primary-50">
              <td className="px-5 py-4 font-medium text-ink-900/60">{t('compare.colLoanAmount')}</td>
              {rows.map(({ business }) => (
                <td key={business.id} className="px-5 py-4 border-l border-primary-50">{formatINR(finance.loanAmount)}</td>
              ))}
            </tr>
            <tr className="border-t border-primary-50">
              <td className="px-5 py-4 font-medium text-ink-900/60">{t('compare.colEmi')}</td>
              {rows.map(({ business, schedule }) => (
                <td key={business.id} className="px-5 py-4 border-l border-primary-50 font-semibold text-primary-900">
                  {formatINR(Math.round(schedule.emi))}
                </td>
              ))}
            </tr>
            <tr className="border-t border-primary-50">
              <td className="px-5 py-4 font-medium text-ink-900/60 align-top">{t('compare.colTopInsight')}</td>
              {rows.map(({ business, feasibility }) => (
                <td key={business.id} className="px-5 py-4 border-l border-primary-50 align-top text-[13px] text-ink-900/70">
                  {feasibility.insights[0] ? t(feasibility.insights[0].textKey, { value: feasibility.insights[0].value }) : '—'}
                </td>
              ))}
            </tr>
            <tr className="border-t border-primary-50">
              <td className="px-5 py-4" />
              {rows.map(({ business }) => (
                <td key={business.id} className="px-5 py-4 border-l border-primary-50">
                  <button
                    type="button"
                    onClick={() => viewFullReport(business.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600 transition-colors"
                  >
                    {t('compare.viewFullReport')}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-center text-xs text-ink-900/35">
        {t('results.generatedOn', { date: new Date().toLocaleDateString(language === 'en' ? 'en-IN' : language, { day: 'numeric', month: 'long', year: 'numeric' }) })}
        {' '}&middot; {t('results.disclaimer')}
      </p>
    </div>
  )
}
