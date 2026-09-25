import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Download, RefreshCcw, Pencil, BadgeCheck, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { humanizeSlug } from '../lib/slug'
import { BUSINESS_TYPES } from '../data/businesses'
import { getEligibleSchemes, structureFinance, buildEmiSchedule } from '@setu/core'
import { generateFeasibility, applyRealFactors, applyLiveCompetition, getBestAlternativeBusiness } from '../lib/feasibility'
import { FALLBACK_INFORMAL_RATE, getInformalLendingRate, getFeasibilityScore, getCensusFacilities } from '../lib/marketData'
import { getReportEnhancement } from '../lib/googleMaps'
import { saveReport } from '../lib/feedback'
import { formatINR, formatIndianNumber, formatPercent } from '../lib/format'
import RadialGauge from '../components/RadialGauge'
import InsightCard from '../components/InsightCard'
import SwotGrid from '../components/SwotGrid'
import MarginLoanDonut from '../components/MarginLoanDonut'
import StatTile from '../components/StatTile'
import EmiScheduleTable from '../components/EmiScheduleTable'
import ScoreBreakdown from '../components/ScoreBreakdown'
import SchemeEligibilityTeaser from '../components/SchemeEligibilityTeaser'
import AppealPanel from '../components/AppealPanel'
import SaveAsApplication from '../components/SaveAsApplication'
import CostOfInactionCard from '../components/CostOfInactionCard'
import AccountAggregatorOptIn from '../components/AccountAggregatorOptIn'
import MicroLesson from '../components/MicroLesson'
import PeerBenchmarkCard from '../components/PeerBenchmarkCard'
import AlternativeBusinessCard from '../components/AlternativeBusinessCard'
import SiteCaptureCard from '../components/SiteCaptureCard'
import SiteContextCard from '../components/SiteContextCard'
import MarketplaceNudge from '../components/MarketplaceNudge'
import ReportNarration from '../components/ReportNarration'
import Icon from '../components/Icon'

const SIM_MIN_MARGIN = 5000
const SIM_MAX_MARGIN = 500000
const SIM_STEP_MARGIN = 1000

export default function Results() {
  const { t, language } = useI18n()
  const { isAuthenticated } = useAuth()
  const { selection, hasReport, resetSelection, updateSelection, startComparison } = useAppData()
  const navigate = useNavigate()

  useEffect(() => {
    if (!hasReport || !selection.stateId || !selection.districtId || !selection.blockId || !selection.businessId) {
      navigate('/eligibility', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasReport])

  const business = BUSINESS_TYPES.find((b) => b.id === selection.businessId)

  const finance = useMemo(() => structureFinance(selection.margin), [selection.margin])
  const schedule = useMemo(
    () =>
      buildEmiSchedule({
        loanAmount: finance.loanAmount,
        interestRate: finance.scheme.interestRate,
        tenureYears: finance.scheme.tenureYears,
        moratoriumMonths: finance.scheme.moratoriumMonths,
      }),
    [finance]
  )
  const baseFeasibility = useMemo(
    () =>
      generateFeasibility({
        businessId: selection.businessId,
        stateId: selection.stateId,
        districtId: selection.districtId,
        blockId: selection.blockId,
      }),
    [selection.businessId, selection.stateId, selection.districtId, selection.blockId]
  )

  // Computed off the same seeded baseline as baseFeasibility, deliberately
  // not the demand/infra-overlaid `feasibility` below — the suggestion
  // should reflect a stable, comparable score across business types, the
  // same basis Compare.jsx uses, not one business's live overlay racing
  // against four others' un-overlaid seeded scores.
  const alternative = useMemo(
    () =>
      getBestAlternativeBusiness({
        businessId: selection.businessId,
        stateId: selection.stateId,
        districtId: selection.districtId,
        blockId: selection.blockId,
      }),
    [selection.businessId, selection.stateId, selection.districtId, selection.blockId]
  )

  const eligibleSchemes = useMemo(
    () =>
      getEligibleSchemes({
        projectCost: finance.projectCost,
        categoryId: selection.categoryId,
        isWomanOwned: selection.isWomanOwned,
        stateId: selection.stateId,
      }),
    [finance.projectCost, selection.categoryId, selection.isWomanOwned, selection.stateId]
  )
  const [informalRate, setInformalRate] = useState(FALLBACK_INFORMAL_RATE)
  useEffect(() => {
    let cancelled = false
    getInformalLendingRate(selection.districtId).then((rate) => {
      if (!cancelled) setInformalRate(rate)
    })
    return () => {
      cancelled = true
    }
  }, [selection.stateId, selection.districtId, selection.blockId])

  // Renders instantly on the offline, baseline-only estimate (CLAUDE.md
  // rule 4: a screen must render with nothing but cached state), then
  // replaces it wholesale with the real composite score — real Census
  // infra + Agmarknet demand + NRLM SHG factors, each with its own
  // source and vintage, plus the grounding narration — from apps/api's
  // POST /feasibility/score, once/if that resolves. See
  // lib/feasibility.js's applyRealFactors for why this is a replacement,
  // not a factor-by-factor overlay onto fake seeded numbers.
  const [realFactors, setRealFactors] = useState(null)
  useEffect(() => {
    let cancelled = false
    setRealFactors(null)
    getFeasibilityScore(selection.businessId, selection.stateId, selection.districtId, selection.blockId, language).then((result) => {
      if (!cancelled) setRealFactors(result)
    })
    return () => {
      cancelled = true
    }
  }, [selection.businessId, selection.stateId, selection.districtId, selection.blockId, language])

  const feasibility = useMemo(() => applyRealFactors(baseFeasibility, realFactors), [baseFeasibility, realFactors])

  // Live Google Maps enhancement + the Census 2011 figures it's compared
  // against, both keyed on the Wizard's DIGIPIN pin. Fired in parallel,
  // after first render, never awaited by anything: the report above is
  // already complete from government data. lib/googleMaps.js skips the
  // call entirely when offline.
  const pinLat = selection.digipinLat
  const pinLon = selection.digipinLon
  const [censusFacilities, setCensusFacilities] = useState(null)
  const [liveEnhancement, setLiveEnhancement] = useState(null)
  useEffect(() => {
    let cancelled = false
    setCensusFacilities(null)
    setLiveEnhancement(null)
    if (pinLat == null || pinLon == null) return undefined
    getCensusFacilities(pinLat, pinLon).then((result) => {
      if (!cancelled) setCensusFacilities(result)
    })
    getReportEnhancement(pinLat, pinLon, selection.businessId).then((result) => {
      if (!cancelled) setLiveEnhancement(result)
    })
    return () => {
      cancelled = true
    }
  }, [pinLat, pinLon, selection.businessId])

  // Display-only: the low-weight live competition factor. Everything that
  // is saved or appealed (saveReport, AppealPanel below) uses the
  // government-data `feasibility`, never this — a stored report must
  // trace to auditable sources. See @setu/core's liveCompetitionAdjustment
  // for why this can never change the verdict.
  const displayFeasibility = useMemo(
    () => applyLiveCompetition(feasibility, liveEnhancement?.competition ?? null),
    [feasibility, liveEnhancement]
  )

  // Best-effort, silent persistence of every completed report a logged-in
  // applicant views — not just the ones they appeal. Feeds the peer
  // benchmark's cohort (PeerBenchmarkCard below) and gives SiteCaptureCard
  // a real reportId to attach evidence to; see lib/feedback.js's saveReport
  // for why this is never queued/retried like the appeal flow. Fires once
  // per distinct report (business/district/block/margin/score
  // combination), not on every render.
  const [savedReportId, setSavedReportId] = useState(null)
  useEffect(() => {
    if (!isAuthenticated || !selection.businessId || !selection.districtId || !selection.blockId) return
    saveReport({
      inputs: selection,
      score: feasibility.score,
      verdictKey: feasibility.verdictKey,
      matchedSchemeId: finance.scheme.id,
      emiSchedule: schedule.rows,
      marginCapitalSource: selection.marginSource,
    }).then((result) => {
      if (result.ok) setSavedReportId(result.data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, selection.businessId, selection.districtId, selection.blockId, selection.margin, feasibility.score])

  if (!business || !selection.stateId || !selection.districtId || !selection.blockId) return null

  // Real nationwide names (see Wizard.jsx — selection now carries
  // stateName/districtName/blockName alongside the ids, set at selection
  // time from lib/geography.js's real Census data). humanizeSlug is only
  // a fallback for a report saved before that existed.
  const stateName = selection.stateName || humanizeSlug(selection.stateId)
  const districtName = selection.districtName || humanizeSlug(selection.districtId)
  const blockName = selection.blockName || humanizeSlug(selection.blockId)
  const needsReview = feasibility.verdictKey === 'verdict.marginal' || feasibility.verdictKey === 'verdict.low'

  const today = new Date().toLocaleDateString(language === 'en' ? 'en-IN' : language, {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 sm:py-14">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-900">{t('results.title')}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-900/60">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Icon name={business.icon} size={14} />
            </span>
            {t('results.subtitle', {
              business: t(business.labelKey),
              block: blockName,
              district: districtName,
              state: stateName,
            })}
          </p>
          {selection.digipin && (
            <p className="mt-1 text-[11px] font-medium text-teal-700">{t('wizard.digipinPinned', { digipin: selection.digipin })}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <ReportNarration
            business={business}
            feasibility={displayFeasibility}
            finance={finance}
            schedule={schedule}
            stateName={stateName}
            districtName={districtName}
            blockName={blockName}
          />
          <Link
            to="/eligibility"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
          >
            <Pencil size={13} />
            {t('common.editInputs')}
          </Link>
          <button
            type="button"
            onClick={() => {
              resetSelection()
              navigate('/eligibility')
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
          >
            <RefreshCcw size={13} />
            {t('common.startOver')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600 transition-colors"
          >
            <Download size={13} />
            {t('common.download')}
          </button>
        </div>
      </div>

      {/* The step from "a report" to "an application an officer reviews":
          save it as a draft (or attach it to one that needs changes), then
          submit it from My Dashboard. */}
      <div className="mb-8">
        <SaveAsApplication reportId={savedReportId} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MODULE 1 */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-primary-100 bg-white card-shadow-lg p-6 sm:p-8"
        >
          <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-primary-900">{t('results.module1Title')}</h2>
              <p className="text-xs text-ink-900/45 mt-0.5">{t('results.module1Subtitle')}</p>
            </div>
            {feasibility.isEstimate && (
              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">
                {t('results.estimateBadge')}
              </span>
            )}
          </div>

          {feasibility.usedAiEstimate && (
            <p className="mb-4 flex items-start gap-1.5 rounded-xl bg-purple-50 border border-purple-200 px-3 py-2.5 text-[11.5px] text-purple-800 leading-snug">
              <Sparkles size={13} className="shrink-0 mt-0.5" />
              {t('results.aiEstimateBanner')}
            </p>
          )}

          <RadialGauge score={displayFeasibility.score} verdict={t(displayFeasibility.verdictKey)} />

          <div className="mt-8">
            <ScoreBreakdown factors={displayFeasibility.factors} excludedFactors={displayFeasibility.excludedFactors} />
          </div>

          {alternative && (
            <AlternativeBusinessCard
              business={business}
              currentScore={alternative.currentScore}
              alternative={alternative.business}
              altScore={alternative.feasibility.score}
              onViewAlternative={() => updateSelection({ businessId: alternative.business.id })}
              onCompareBoth={() => {
                startComparison([selection.businessId, alternative.business.id])
                navigate('/compare')
              }}
            />
          )}

          <h3 className="mt-8 mb-3 text-sm font-bold text-primary-900">{t('results.insightsTitle')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {feasibility.insights.map((ins) => (
              <InsightCard
                key={ins.textKey}
                icon={ins.icon}
                text={t(ins.textKey, { value: ins.value })}
                sourceKey={ins.sourceKey}
                sourceRowId={`${business.id}|${selection.stateId}|${selection.districtId}|${selection.blockId}|${ins.textKey}`}
              />
            ))}
          </div>

          <h3 className="mt-8 mb-3 text-sm font-bold text-primary-900">{t('results.swotTitle')}</h3>
          <SwotGrid businessId={business.id} />

          <PeerBenchmarkCard
            businessId={selection.businessId}
            districtId={selection.districtId}
            verdictKey={feasibility.verdictKey}
          />

          <SiteContextCard census={censusFacilities} live={liveEnhancement} />

          <SiteCaptureCard reportId={savedReportId} />

          {!needsReview && <MarketplaceNudge />}

          {needsReview && (
            <AppealPanel
              inputs={selection}
              score={feasibility.score}
              verdictKey={feasibility.verdictKey}
              matchedSchemeId={finance.scheme.id}
              emiSchedule={schedule.rows}
              marginSource={selection.marginSource}
            />
          )}
        </motion.section>

        {/* MODULE 2 */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-3xl border border-primary-100 bg-white card-shadow-lg p-6 sm:p-8"
        >
          <div className="mb-6">
            <h2 className="text-lg font-bold text-primary-900">{t('results.module2Title')}</h2>
            <p className="text-xs text-ink-900/45 mt-0.5">{t('results.module2Subtitle')}</p>
          </div>

          <div className="mb-7 rounded-2xl border border-primary-100 bg-primary-50/40 p-4">
            <div className="flex items-center gap-2 mb-1">
              <SlidersHorizontal size={14} className="text-primary-600" />
              <span className="text-xs font-bold text-primary-900">{t('results.scenarioTitle')}</span>
            </div>
            <p className="mb-3 text-[11px] text-ink-900/45">{t('results.scenarioSubtitle')}</p>
            <input
              type="range"
              min={SIM_MIN_MARGIN}
              max={SIM_MAX_MARGIN}
              step={SIM_STEP_MARGIN}
              value={selection.margin}
              onChange={(e) => updateSelection({ margin: Number(e.target.value), marginSource: 'self_reported' })}
              className="w-full accent-primary-700 h-2 cursor-pointer"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-ink-900/40">₹{formatIndianNumber(SIM_MIN_MARGIN)}</span>
              <span className="text-sm font-bold text-primary-800">{formatINR(selection.margin)}</span>
              <span className="text-[11px] text-ink-900/40">₹{formatIndianNumber(SIM_MAX_MARGIN)}</span>
            </div>
            <AccountAggregatorOptIn
              marginSource={selection.marginSource}
              onVerified={(estimatedMarginCapital) =>
                updateSelection({ margin: estimatedMarginCapital, marginSource: 'aa' })
              }
            />
            <MicroLesson topic="margin" highlight={needsReview} />
          </div>

          <h3 className="mb-3 text-sm font-bold text-primary-900 text-center">{t('results.splitTitle')}</h3>
          <MarginLoanDonut marginAmount={finance.marginAmount} loanAmount={finance.loanAmount} />

          <div className="mt-7 rounded-2xl border-2 border-amber-500/30 bg-amber-50/60 p-5">
            <div className="flex items-center gap-2 mb-1">
              <BadgeCheck size={16} className="text-amber-600" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{t('results.recommendedScheme')}</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
                <Icon name={finance.scheme.icon} size={19} />
              </span>
              <div>
                <p className="text-base font-extrabold text-primary-900">{t(finance.scheme.nameKey)}</p>
                <p className="text-[11px] text-ink-900/50 mt-0.5">
                  {finance.scheme.id === 'micro_finance' ? t('results.ruleBadgeMicro') : t('results.ruleBadgeTerm')}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile icon="Wallet" label={t('results.statProjectCost')} value={formatINR(finance.projectCost)} />
            <StatTile icon="Landmark" label={t('results.statLoanAmount')} value={formatINR(finance.loanAmount)} />
            <StatTile icon="Percent" label={t('results.statInterestRate')} value={`${finance.scheme.interestRate}% ${t('common.perAnnum')}`} />
            <StatTile icon="Calendar" label={t('results.statTenure')} value={`${finance.scheme.tenureYears} ${t('common.years')}`} />
            <StatTile icon="Clock" label={t('results.statMoratorium')} value={`${finance.scheme.moratoriumMonths} ${t('common.months')}`} />
            <StatTile
              icon="IndianRupee"
              label={t('results.statEmi')}
              value={formatINR(Math.round(schedule.emi))}
              sub={t('results.postMoratorium')}
            />
          </div>

          {finance.scheme.moratoriumMonths > 0 && <MicroLesson topic="moratorium" highlight={needsReview} />}

          {finance.capped && (
            <div className="mt-6 rounded-2xl border-2 border-amber-500/40 bg-amber-50 p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-700" />
                <span className="text-sm font-bold text-amber-800">{t('results.cappedBannerTitle')}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-amber-900/80">
                {t('results.cappedBannerBody', {
                  naiveProjectCost: formatIndianNumber(finance.naiveProjectCost),
                  naiveLoan: formatIndianNumber(finance.naiveLoan),
                  schemeName: t(finance.scheme.nameKey),
                  loanCap: formatIndianNumber(finance.scheme.loanCap),
                  projectCost: formatIndianNumber(finance.projectCost),
                  margin: formatIndianNumber(finance.marginAmount),
                  marginPercent: formatPercent(finance.marginPercentActual * 100),
                })}
              </p>
            </div>
          )}

          <CostOfInactionCard informalRate={informalRate.ratePercent} isEstimate={informalRate.label === 'regional_estimate'} schemeRate={finance.scheme.interestRate} />

          <MicroLesson topic="emi" highlight={needsReview} />

          <EmiScheduleTable rows={schedule.rows} />

          <div className="mt-6 pt-6 border-t border-primary-100">
            <SchemeEligibilityTeaser
              matchedCount={eligibleSchemes.filter((s) => s.eligible).length}
              totalCount={eligibleSchemes.length}
            />
          </div>
        </motion.section>
      </div>

      <p className="mt-10 text-center text-xs text-ink-900/35">
        {t('results.generatedOn', { date: today })} &middot; {t('results.disclaimer')}
      </p>
    </div>
  )
}
