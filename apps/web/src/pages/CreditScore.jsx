import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, CheckCircle2, Circle, HelpCircle, Sparkles } from 'lucide-react'
import { computeCreditScore, simulateScoreDelta, getEligibleSchemes, getLoanSanctionProbabilities, structureFinance } from '@setu/core'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { getLedgerSummary } from '../lib/ledger'
import { getCreditScore } from '../lib/creditScore'
import { formatINR, formatPercent } from '../lib/format'
import RadialGauge from '../components/RadialGauge'

const SLIDER_MAX_EXTRA_DAYS = 30
const SLIDER_MAX_EXTRA_UDHAAR = 5000
const SLIDER_MAX_DIGITAL_SHARE = 80

// Vikasit Saathi Credit Score — the explainable 4-pillar score (see
// @setu/core's creditScore.ts). The "real" score comes from GET
// /credit-score/me (server-audited, computed from the applicant's own
// DB-stored ledger — can't be spoofed client-side); the interactive
// simulator recomputes the exact same computeCreditScore/simulateScoreDelta
// functions locally against the already-fetched ledger summary, so
// dragging a slider is instant and needs zero network round-trips.
export default function CreditScore() {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const { selection } = useAppData()
  const [summary, setSummary] = useState(null)
  const [serverResult, setServerResult] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [extraActiveDays, setExtraActiveDays] = useState(0)
  const [extraUdhaarRepaid, setExtraUdhaarRepaid] = useState(0)
  const [targetDigitalShare, setTargetDigitalShare] = useState(0)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    Promise.all([getLedgerSummary(), getCreditScore()]).then(([summaryResult, scoreResult]) => {
      if (cancelled) return
      if (summaryResult.ok && summaryResult.data) setSummary(summaryResult.data)
      if (scoreResult.ok && scoreResult.data) setServerResult(scoreResult.data)
      if (!summaryResult.ok || !scoreResult.ok) setLoadFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  // Recomputed client-side from the same summary the server used —
  // guaranteed to match serverResult exactly at zero slider adjustment
  // (both call the identical @setu/core function), and updates instantly
  // as sliders move.
  const liveResult = useMemo(() => {
    if (!summary) return null
    return simulateScoreDelta(
      { summary, vintageYears: 0 },
      {
        extraActiveDays,
        extraUdhaarRepaid,
        targetDigitalSharePercent: targetDigitalShare > 0 ? targetDigitalShare : undefined,
      }
    )
  }, [summary, extraActiveDays, extraUdhaarRepaid, targetDigitalShare])

  const baseResult = serverResult ?? liveResult
  const projectedDelta = liveResult && baseResult ? liveResult.score - baseResult.score : 0

  const finance = useMemo(() => structureFinance(selection.margin), [selection.margin])
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
  const loanProbabilities = useMemo(
    () => (baseResult ? getLoanSanctionProbabilities(eligibleSchemes, baseResult.score) : []),
    [eligibleSchemes, baseResult]
  )

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 sm:py-20 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
          <ShieldCheck size={22} />
        </span>
        <h1 className="text-2xl font-extrabold text-primary-900">{t('creditScore.title')}</h1>
        <div className="mt-8 rounded-3xl border border-primary-100 card-shadow-lg bg-white px-8 py-14">
          <p className="text-sm text-ink-900/60">{t('creditScore.signInPrompt')}</p>
          <button
            type="button"
            onClick={requestLogin}
            className="mt-5 inline-flex items-center rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-400 transition-colors"
          >
            {t('creditScore.signInCta')}
          </button>
        </div>
      </div>
    )
  }

  if (!baseResult || !summary) {
    return (
      <div className="mx-auto max-w-5xl px-5 sm:px-8 py-14 text-center text-sm text-ink-900/50">
        {loadFailed ? t('creditScore.loadError') : t('common.loading')}
      </div>
    )
  }

  const readinessItems = buildReadinessItems({ summary, selection, t })
  const readinessCompleted = readinessItems.filter((i) => i.done).length

  return (
    <div className="mx-auto max-w-5xl px-5 sm:px-8 py-10 sm:py-14">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600/10 px-3 py-1 text-[11px] font-bold text-teal-700 mb-3">
          <ShieldCheck size={12} />
          {t('creditScore.transparentBadge')}
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-900">{t('creditScore.title')}</h1>
        <p className="mt-2 text-sm text-ink-900/60">{t('creditScore.subtitle')}</p>
      </div>

      {loadFailed && (
        <p className="mb-6 text-center text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
          {t('creditScore.loadError')}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-primary-100 bg-white p-6 sm:p-8 flex flex-col items-center">
          <RadialGauge score={liveResult.score} verdict={t(liveResult.verdictKey)} min={300} max={850} />
          <p className="mt-4 text-center text-[12px] text-ink-900/50">{t('creditScore.scoreCaption')}</p>
        </div>

        <div className="rounded-3xl border border-primary-100 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-bold text-primary-900 mb-4">{t('creditScore.loanSanctionTitle')}</h2>
          {loanProbabilities.length === 0 ? (
            <p className="text-[12.5px] text-ink-900/45">{t('creditScore.noMatchesYet')}</p>
          ) : (
            <div className="space-y-2.5">
              {loanProbabilities.map((p) => (
                <div key={p.schemeId} className="flex items-center justify-between gap-3 rounded-xl bg-primary-50/60 px-3.5 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.probabilityPercent == null ? (
                      <HelpCircle size={14} className="text-amber-600 shrink-0" />
                    ) : (
                      <CheckCircle2 size={14} className="text-teal-700 shrink-0" />
                    )}
                    <span className="text-[12.5px] font-semibold text-primary-900 truncate">{t(p.nameKey)}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      p.probabilityPercent == null ? 'bg-amber-100 text-amber-700' : 'bg-teal-600/10 text-teal-700'
                    }`}
                  >
                    {p.probabilityPercent == null ? t(p.labelKey) : `${p.probabilityPercent}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="mt-10 mb-1 text-lg font-extrabold text-primary-900">{t('creditScore.pillarsTitle')}</h2>
      <p className="mb-4 text-[12.5px] text-ink-900/50">{t('creditScore.pillarsSubtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {baseResult.pillars.map((pillar) => (
          <div key={pillar.id} className="rounded-2xl border border-primary-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-primary-900">{t(pillar.labelKey)}</p>
              <span className="text-[10.5px] font-semibold text-ink-900/40">{pillar.weightPercent}%</span>
            </div>
            <p className="mt-1 text-[11.5px] text-ink-900/50">
              {t('creditScore.pointsLabel', { earned: pillar.pointsEarned, max: pillar.pointsMax })} ·{' '}
              {t('creditScore.achievedLabel', { percent: pillar.achievedPercent })}
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-primary-50 overflow-hidden">
              <div className="h-full bg-primary-700" style={{ width: `${pillar.achievedPercent}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-teal-700">{t(pillar.tipKey)}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-3xl border border-primary-100 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-amber-500" />
          <h2 className="text-sm font-bold text-primary-900">{t('creditScore.simulatorTitle')}</h2>
        </div>
        <p className="mb-4 text-[12.5px] text-ink-900/50">{t('creditScore.simulatorSubtitle')}</p>

        <div className="rounded-2xl bg-primary-50/60 px-4 py-3 mb-5 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-primary-800">{t('creditScore.projectedScore')}</span>
          <span className="text-lg font-extrabold text-primary-900">
            {liveResult.score}
            {projectedDelta > 0 && (
              <span className="ml-1.5 text-[12px] font-bold text-teal-700">{t('creditScore.projectedDelta', { delta: projectedDelta })}</span>
            )}
          </span>
        </div>

        <div className="space-y-5">
          <SliderRow
            label={t('creditScore.sliderActiveDays')}
            value={extraActiveDays}
            max={SLIDER_MAX_EXTRA_DAYS}
            step={5}
            displayValue={`+${extraActiveDays} ${t('common.days')}`}
            onChange={setExtraActiveDays}
          />
          <SliderRow
            label={t('creditScore.sliderUdhaarRepaid')}
            value={extraUdhaarRepaid}
            max={Math.min(SLIDER_MAX_EXTRA_UDHAAR, Math.max(500, summary.pendingUdhaar))}
            step={100}
            displayValue={`+${formatINR(extraUdhaarRepaid)}`}
            onChange={setExtraUdhaarRepaid}
          />
          <SliderRow
            label={t('creditScore.sliderDigitalShare')}
            value={targetDigitalShare}
            max={SLIDER_MAX_DIGITAL_SHARE}
            step={5}
            displayValue={targetDigitalShare > 0 ? formatPercent(targetDigitalShare) : t('creditScore.noChange')}
            onChange={setTargetDigitalShare}
          />
        </div>
      </div>

      <div className="mt-10 rounded-3xl border border-primary-100 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-primary-900">{t('creditScore.readinessTitle')}</h2>
          <span className="rounded-full bg-teal-600/10 px-3 py-1 text-[11px] font-bold text-teal-700">
            {t('creditScore.readinessCompleted', { count: readinessCompleted, total: readinessItems.length })}
          </span>
        </div>
        <div className="space-y-2.5">
          {readinessItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-xl border border-primary-50 px-3.5 py-3">
              {item.done ? (
                <CheckCircle2 size={16} className="text-teal-700 shrink-0 mt-0.5" />
              ) : (
                <Circle size={16} className="text-ink-900/25 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-primary-900">{item.title}</p>
                <p className="text-[11.5px] text-ink-900/50">{item.sub}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  item.done ? 'bg-teal-600/10 text-teal-700' : 'bg-ink-900/5 text-ink-900/40'
                }`}
              >
                {item.done ? t('creditScore.verifiedTag') : t('creditScore.pendingTag')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SliderRow({ label, value, max, step, displayValue, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[12.5px] font-semibold text-primary-800">{label}</label>
        <span className="text-[12.5px] font-bold text-primary-900">{displayValue}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary-700"
      />
    </div>
  )
}

// Udyam registration has no real server source yet (Shop Profile — a
// later phase — would persist it) and is never fabricated: it shows
// clearly as "not yet verified" rather than a guessed checkmark.
// Bank-account linkage has two independent real signals today: opting
// into Account Aggregator this session, or having at least one
// bank-statement-verified transaction (summary.bankVerifiedTransactionCount,
// from the "add a bank statement" upload on Bahi-Khata) — the statement
// upload is the stronger, document-backed proof, so it's called out with
// its own sub-text rather than collapsing both into one generic "linked".
function buildReadinessItems({ summary, selection, t }) {
  const udhaarSharePercent = summary.totalSales > 0 ? (summary.pendingUdhaar / summary.totalSales) * 100 : 0
  const bankStatementVerified = summary.bankVerifiedTransactionCount > 0
  const aaLinked = selection.marginSource === 'aa'
  const bankLinked = bankStatementVerified || aaLinked

  return [
    {
      id: 'logging',
      done: summary.activeDayCount >= 60,
      title: t('creditScore.readiness.logging.title'),
      sub: t('creditScore.readiness.logging.sub', { days: summary.activeDayCount }),
    },
    {
      id: 'udyam',
      done: false,
      title: t('creditScore.readiness.udyam.title'),
      sub: t('creditScore.readiness.udyam.sub'),
    },
    {
      id: 'udhaarShare',
      done: summary.totalSales > 0 && udhaarSharePercent <= 25,
      title: t('creditScore.readiness.udhaarShare.title'),
      sub: t('creditScore.readiness.udhaarShare.sub', { percent: udhaarSharePercent.toFixed(1) }),
    },
    {
      id: 'digitalShare',
      done: summary.digitalSharePercent >= 30,
      title: t('creditScore.readiness.digitalShare.title'),
      sub: t('creditScore.readiness.digitalShare.sub', { percent: summary.digitalSharePercent.toFixed(1) }),
    },
    {
      id: 'bankAccount',
      done: bankLinked,
      title: t('creditScore.readiness.bankAccount.title'),
      sub: bankStatementVerified
        ? t('creditScore.readiness.bankAccount.subStatementVerified', { count: summary.bankVerifiedTransactionCount })
        : aaLinked
          ? t('creditScore.readiness.bankAccount.subLinked')
          : t('creditScore.readiness.bankAccount.subUnlinked'),
    },
  ]
}
