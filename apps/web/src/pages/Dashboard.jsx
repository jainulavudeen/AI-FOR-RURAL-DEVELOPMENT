import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ArrowRight } from 'lucide-react'
import { computeCreditScore, getUpcomingFestivals, summarizeLedger } from '@setu/core'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { getTransactions } from '../lib/ledger'
import { generateFeasibility, getBestAlternativeBusiness } from '../lib/feasibility'
import { BUSINESS_TYPES } from '../data/businesses'
import RadialGauge from '../components/RadialGauge'
import DailyBulletinBanner from '../components/DailyBulletinBanner'
import FestivalDemandCard from '../components/FestivalDemandCard'
import CashFlowSnapshotCard from '../components/CashFlowSnapshotCard'
import PeerBenchmarkCard from '../components/PeerBenchmarkCard'
import AlternativeBusinessCard from '../components/AlternativeBusinessCard'
import LogSaleModal from '../components/LogSaleModal'
import MyApplications from '../components/MyApplications'

// "Your shop at a glance" — the V2 home base a returning applicant lands
// on, composing pieces that already exist elsewhere rather than
// recomputing anything: the same ledger summary Bahi-Khata shows, the same
// credit score computation Credit Score shows, the same festival calendar
// data, and the existing (Unit 1) peer-benchmark feature. Every piece
// degrades independently per CLAUDE.md rule 4 — a failed ledger fetch
// doesn't blank the festival card, which needs no network at all.
export default function Dashboard() {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin, phone } = useAuth()
  const { selection, updateSelection, startComparison } = useAppData()
  const navigate = useNavigate()
  const [transactions, setTransactions] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    getTransactions().then((result) => {
      if (!cancelled && result.ok) setTransactions(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const summary = useMemo(() => summarizeLedger(transactions ?? [], new Date()), [transactions])
  const creditScoreResult = useMemo(() => computeCreditScore({ summary, vintageYears: 0 }), [summary])
  const upcomingFestivals = useMemo(
    () => getUpcomingFestivals(new Date(), selection.stateId || null, selection.businessId || null, 75),
    [selection.stateId, selection.businessId]
  )

  const hasLocationAndBusiness = Boolean(selection.businessId && selection.stateId && selection.districtId)
  const feasibility = useMemo(
    () =>
      hasLocationAndBusiness
        ? generateFeasibility({
            businessId: selection.businessId,
            stateId: selection.stateId,
            districtId: selection.districtId,
            blockId: selection.blockId,
          })
        : null,
    [hasLocationAndBusiness, selection.businessId, selection.stateId, selection.districtId, selection.blockId]
  )

  // Same suggestion Results.jsx already surfaces after generating a
  // report — reused verbatim here (identical getBestAlternativeBusiness()
  // call + AlternativeBusinessCard component) rather than recomputed, so
  // Dashboard can never disagree with Results about which business is
  // actually the better bet at this location.
  const alternative = useMemo(
    () =>
      hasLocationAndBusiness
        ? getBestAlternativeBusiness({
            businessId: selection.businessId,
            stateId: selection.stateId,
            districtId: selection.districtId,
            blockId: selection.blockId,
          })
        : null,
    [hasLocationAndBusiness, selection.businessId, selection.stateId, selection.districtId, selection.blockId]
  )
  const currentBusiness = useMemo(() => BUSINESS_TYPES.find((b) => b.id === selection.businessId) ?? null, [selection.businessId])

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 sm:py-20 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
          <LayoutDashboard size={22} />
        </span>
        <h1 className="text-2xl font-extrabold text-primary-900">{t('dashboard.title')}</h1>
        <div className="mt-8 rounded-3xl border border-primary-100 card-shadow-lg bg-white px-8 py-14">
          <p className="text-sm text-ink-900/60">{t('dashboard.signInPrompt')}</p>
          <button
            type="button"
            onClick={requestLogin}
            className="mt-5 inline-flex items-center rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-400 transition-colors"
          >
            {t('dashboard.signInCta')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-5 sm:px-8 py-10 sm:py-14">
      <h1 className="mb-5 text-2xl font-extrabold text-primary-900">{t('applications.dashboardTitle')}</h1>
      <MyApplications />

      <div className="mt-6">
        <DailyBulletinBanner phone={phone} onLogSale={() => setModalOpen(true)} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FestivalDemandCard festivals={upcomingFestivals} />

        <div className="rounded-3xl border border-primary-100 bg-white p-6 flex flex-col items-center text-center">
          <p className="text-sm font-bold text-primary-900">{t('dashboard.creditScoreCardTitle')}</p>
          <p className="text-[12px] text-ink-900/50 mb-3">{t('dashboard.creditScoreCardSubtitle')}</p>
          <div className="scale-90 -my-3">
            <RadialGauge score={creditScoreResult.score} verdict={t(creditScoreResult.verdictKey)} min={300} max={850} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 w-full">
            {creditScoreResult.pillars.map((p) => (
              <div key={p.id} className="rounded-xl bg-primary-50/60 px-2.5 py-2 text-left">
                <p className="text-[10px] font-semibold text-ink-900/45 truncate">{t(p.labelKey)}</p>
                <div className="mt-1 h-1 w-full rounded-full bg-primary-100 overflow-hidden">
                  <div className="h-full bg-primary-700" style={{ width: `${p.achievedPercent}%` }} />
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/credit-score"
            className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-primary-700 hover:text-primary-900"
          >
            {t('dashboard.viewBreakdownCta')}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {alternative && currentBusiness && (
        <AlternativeBusinessCard
          business={currentBusiness}
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

      <div className="mt-6">
        <CashFlowSnapshotCard summary={summary} />
      </div>

      {feasibility && (
        <PeerBenchmarkCard businessId={selection.businessId} districtId={selection.districtId} verdictKey={feasibility.verdictKey} />
      )}

      <LogSaleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={({ queued, record, submitted }) => {
          const entry = queued
            ? { id: `local-${Date.now()}`, ...submitted, note: null, occurredAt: new Date().toISOString(), createdAt: new Date().toISOString(), pending: true }
            : record
          setTransactions((prev) => [entry, ...(prev ?? [])])
        }}
      />
    </div>
  )
}
