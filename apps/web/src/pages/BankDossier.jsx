import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FileText, Printer, ShieldCheck, Stamp, Clock } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { generateBankDossier, getBankDossier, approveBankDossier } from '../lib/bankDossier'
import { formatINR } from '../lib/format'
import { LOCATIONS } from '../data/locations'
import { BUSINESS_TYPES } from '../data/businesses'
import '../styles/print.css'

const DATE_LOCALE = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

// "Loan-ready in one print" — a frozen, point-in-time snapshot (see
// apps/api's bankDossier module: once generated, a dossier's numbers never
// change, even if the applicant's live ledger/credit score moves the next
// day, the same reproducibility posture reports.inputs/emiSchedule already
// have). window.print() + styles/print.css is the whole PDF mechanism —
// no JS PDF library, matching the one existing precedent (Results.jsx's
// "Download Report" button).
export default function BankDossier() {
  const { t, language } = useI18n()
  const { isAuthenticated, requestLogin, role } = useAuth()
  const { selection } = useAppData()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [dossier, setDossier] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(false)
  const [proprietorName, setProprietorName] = useState('')
  const [bankName, setBankName] = useState('')
  const preselectedSchemeId = searchParams.get('schemeId')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setDossier(null)
    setLoadFailed(false)
    getBankDossier(id).then((result) => {
      if (cancelled) return
      if (result.ok) setDossier(result.data)
      else setLoadFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const handleGenerate = async (e) => {
    e.preventDefault()
    setGenerating(true)
    setGenerateError(false)
    const result = await generateBankDossier({
      selection,
      schemeId: preselectedSchemeId || null,
      proprietorName: proprietorName.trim() || null,
      bankName: bankName.trim() || null,
    })
    setGenerating(false)
    if (result.ok && result.data?.id) {
      navigate(`/bank-dossier/${result.data.id}`)
    } else {
      setGenerateError(true)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 sm:py-20 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
          <FileText size={22} />
        </span>
        <h1 className="text-2xl font-extrabold text-primary-900">{t('bankDossier.title')}</h1>
        <div className="mt-8 rounded-3xl border border-primary-100 card-shadow-lg bg-white px-8 py-14">
          <p className="text-sm text-ink-900/60">{t('bankDossier.signInPrompt')}</p>
          <button
            type="button"
            onClick={requestLogin}
            className="mt-5 inline-flex items-center rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-400 transition-colors"
          >
            {t('bankDossier.signInCta')}
          </button>
        </div>
      </div>
    )
  }

  // Generation form — shown when there's no :id in the URL yet.
  if (!id) {
    return (
      <div className="mx-auto max-w-xl px-5 sm:px-8 py-14 sm:py-20">
        <div className="text-center mb-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
            <FileText size={22} />
          </span>
          <h1 className="text-2xl font-extrabold text-primary-900">{t('bankDossier.title')}</h1>
          <p className="mt-2 text-sm text-ink-900/60">{t('bankDossier.generateSubtitle')}</p>
        </div>
        <form onSubmit={handleGenerate} className="rounded-3xl border border-primary-100 bg-white p-6 sm:p-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-900/40">
              {t('bankDossier.proprietorNameLabel')}
            </label>
            <input
              type="text"
              value={proprietorName}
              onChange={(e) => setProprietorName(e.target.value)}
              placeholder={t('bankDossier.proprietorNamePlaceholder')}
              className="w-full rounded-xl border border-primary-200 px-3 py-2.5 text-sm text-ink-900 focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-900/40">
              {t('bankDossier.bankNameLabel')}
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t('bankDossier.bankNamePlaceholder')}
              className="w-full rounded-xl border border-primary-200 px-3 py-2.5 text-sm text-ink-900 focus:border-primary-500 focus:outline-none"
            />
          </div>
          <p className="text-[11px] text-ink-900/40 leading-snug">{t('bankDossier.selfReportedNote')}</p>
          {generateError && <p className="text-[12px] text-red-600">{t('bankDossier.generateError')}</p>}
          <button
            type="submit"
            disabled={generating}
            className="w-full rounded-full bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {generating ? t('bankDossier.generating') : t('bankDossier.generateCta')}
          </button>
        </form>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 text-center text-sm text-ink-900/50">{t('bankDossier.loadError')}</div>
    )
  }

  if (!dossier) {
    return (
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 text-center text-sm text-ink-900/50">{t('common.loading')}</div>
    )
  }

  return (
    <DossierView
      dossier={dossier}
      t={t}
      language={language}
      isOfficer={role === 'officer'}
      onApproved={(approval) => setDossier((prev) => (prev ? { ...prev, latestApproval: approval } : prev))}
    />
  )
}

function ApprovalPanel({ dossierId, t, onApproved }) {
  const [officerName, setOfficerName] = useState('')
  const [officerDesignation, setOfficerDesignation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await approveBankDossier(dossierId, {
      officerName: officerName.trim(),
      officerDesignation: officerDesignation.trim(),
    })
    setSubmitting(false)
    if (result.ok && result.data) {
      onApproved(result.data)
      setOfficerName('')
      setOfficerDesignation('')
    } else {
      setError(result.data?.error?.message ?? t('bankDossier.approveError'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="no-print mb-6 rounded-2xl border border-teal-600/30 bg-teal-50/50 p-5 space-y-3">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-teal-800">
        <Stamp size={14} />
        {t('bankDossier.approvalPanelTitle')}
      </p>
      <p className="text-[11.5px] text-teal-900/70">{t('bankDossier.approvalPanelHint')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          required
          value={officerName}
          onChange={(e) => setOfficerName(e.target.value)}
          placeholder={t('bankDossier.officerNamePlaceholder')}
          className="rounded-xl border border-teal-600/30 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-teal-600 focus:outline-none"
        />
        <input
          type="text"
          required
          value={officerDesignation}
          onChange={(e) => setOfficerDesignation(e.target.value)}
          placeholder={t('bankDossier.officerDesignationPlaceholder')}
          className="rounded-xl border border-teal-600/30 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-teal-600 focus:outline-none"
        />
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
      >
        {submitting ? t('bankDossier.approving') : t('bankDossier.approveCta')}
      </button>
    </form>
  )
}

function DossierView({ dossier, t, language, isOfficer, onApproved }) {
  const s = dossier.snapshot
  const stateLabel = s.stateId ? t(LOCATIONS[s.stateId]?.labelKey ?? '') : ''
  const districtObj = s.stateId ? LOCATIONS[s.stateId]?.districts.find((d) => d.id === s.districtId) : null
  const districtLabel = districtObj ? t(districtObj.labelKey) : ''
  const business = BUSINESS_TYPES.find((b) => b.id === s.businessId)

  const monthlyDebtServiceHeadroom = s.financial.summary.netSurplus / Math.max(1, s.financial.summary.monthBuckets.length)

  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-8 py-10 sm:py-14">
      <div className="no-print flex items-center justify-between mb-6">
        <span className="rounded-full bg-teal-600/10 px-3 py-1 text-[11px] font-bold text-teal-700">{t('bankDossier.readyBadge')}</span>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-primary-800 transition-colors"
        >
          <Printer size={15} />
          {t('bankDossier.printCta')}
        </button>
      </div>

      {isOfficer && <ApprovalPanel dossierId={dossier.id} t={t} onApproved={onApproved} />}

      <div className="dossier-print rounded-3xl border border-primary-100 bg-white p-6 sm:p-10 print:rounded-none print:border-none">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary-100 pb-4 mb-6">
          <div>
            <p className="text-lg font-extrabold text-primary-900">{t('bankDossier.masthead')}</p>
            <p className="text-[11px] text-ink-900/50">{t('bankDossier.mastheadSubtitle')}</p>
          </div>
          <div className="text-right text-[11px] text-ink-900/50 space-y-0.5">
            <p>{t('bankDossier.docRef', { ref: s.docRef })}</p>
            <p>
              {t('bankDossier.issueDate', {
                date: new Date(s.issueDate).toLocaleDateString(DATE_LOCALE[language] || 'en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              })}
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-600/10 px-2 py-0.5 text-[10px] font-bold text-teal-700">
              <ShieldCheck size={10} />
              {t('bankDossier.verifiedBadge')}
            </span>
          </div>
        </div>

        <h1 className="text-xl font-extrabold text-primary-900 mb-6">{t('bankDossier.documentTitle')}</h1>

        <Section number={1} title={t('bankDossier.section1Title')}>
          <FactGrid
            items={[
              [t('bankDossier.proprietorNameLabel'), s.proprietorName || t('bankDossier.notCaptured')],
              [t('bankDossier.tradeCategoryLabel'), business ? t(business.labelKey) : t('bankDossier.notCaptured')],
              [t('bankDossier.locationLabel'), stateLabel ? `${districtLabel ? districtLabel + ', ' : ''}${stateLabel}` : t('bankDossier.notCaptured')],
              [t('bankDossier.vintageLabel'), t('bankDossier.notCaptured')],
              [t('bankDossier.bankLabel'), s.bankName || t('bankDossier.notCaptured')],
              [t('bankDossier.phoneLabel'), s.applicantPhone || t('bankDossier.notCaptured')],
            ]}
          />
        </Section>

        <Section number={2} title={t('bankDossier.section2Title')}>
          <div className="flex items-center gap-4 mb-3">
            <p className="text-3xl font-extrabold text-primary-900">
              {s.financial.creditScore.score}
              <span className="text-sm font-semibold text-ink-900/40"> / 850</span>
            </p>
            <span className="rounded-full bg-teal-600/10 px-3 py-1 text-[11px] font-bold text-teal-700">
              {t(s.financial.creditScore.verdictKey)}
            </span>
          </div>
          <FactGrid
            items={s.financial.creditScore.pillars.map((p) => [t(p.labelKey), `${p.achievedPercent}%`])}
            columns={4}
          />
        </Section>

        <Section number={3} title={t('bankDossier.section3Title')}>
          <FactGrid
            items={[
              [t('bankDossier.grossSalesLabel'), formatINR(s.financial.summary.totalSales)],
              [t('bankDossier.costsLabel'), formatINR(s.financial.summary.totalExpenses)],
              [t('bankDossier.netCashFlowLabel'), formatINR(s.financial.summary.netSurplus)],
              [t('bankDossier.debtServiceHeadroomLabel'), `${formatINR(monthlyDebtServiceHeadroom)}/${t('common.month')}`],
            ]}
          />
          {s.financial.summary.bankVerifiedTransactionCount > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-teal-700">
              <ShieldCheck size={12} />
              {t('bankDossier.bankVerifiedNote', {
                count: s.financial.summary.bankVerifiedTransactionCount,
                amount: formatINR(s.financial.summary.bankVerifiedSalesTotal),
              })}
            </p>
          )}
        </Section>

        <Section number={4} title={t('bankDossier.section4Title')}>
          {s.financial.topMatches.length === 0 ? (
            <p className="text-[12.5px] text-ink-900/45">{t('bankDossier.noMatches')}</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-900/40 border-b border-primary-100">
                  <th className="py-1.5 pr-2">{t('bankDossier.schemeColLabel')}</th>
                  <th className="py-1.5 pr-2">{t('bankDossier.matchColLabel')}</th>
                  <th className="py-1.5">{t('bankDossier.limitColLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {s.financial.topMatches.map(({ scheme, matchScore }) => (
                  <tr key={scheme.id} className="border-b border-primary-50">
                    <td className="py-2 pr-2 font-semibold text-primary-900">{t(scheme.nameKey)}</td>
                    <td className="py-2 pr-2">
                      <span className="rounded-full bg-teal-600/10 px-2 py-0.5 text-[11px] font-bold text-teal-700">{matchScore}%</span>
                    </td>
                    <td className="py-2 text-ink-900/60">{scheme.kind === 'generic' ? formatINR(scheme.scheme.loanCap) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section number={5} title={t('bankDossier.section5Title')}>
          <p className="text-[11.5px] text-ink-900/60 leading-relaxed">{t('bankDossier.authenticationBody', { ref: s.docRef })}</p>
        </Section>

        <ApprovalBlock approval={dossier.latestApproval} t={t} language={language} />
      </div>
    </div>
  )
}

// Always prints something here — "APPROVED" with real detail, or a clear
// "Pending review" — never blank. CLAUDE.md item 7: call this "Verified
// Approval", never "digitally signed" (no government DSC exists in this
// app). The signature hash is printed so a bank can check it themselves
// at GET /bank-dossier/verify/:hash with no Setu login needed.
function ApprovalBlock({ approval, t, language }) {
  return (
    <div className="mt-2 rounded-2xl border-2 border-dashed border-primary-200 p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-primary-600 mb-3">{t('bankDossier.approvalSectionTitle')}</p>
      {approval ? (
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3 py-1 text-[12px] font-extrabold uppercase tracking-wide text-white mb-3">
            <Stamp size={13} />
            {t('bankDossier.approvedStamp')}
          </span>
          <FactGrid
            items={[
              [t('bankDossier.approvedByLabel'), approval.officerName],
              [t('bankDossier.officerDesignationLabel'), approval.officerDesignation],
              [t('bankDossier.officerIdLabel'), approval.officerId],
              [
                t('bankDossier.approvedAtLabel'),
                new Date(approval.approvedAt).toLocaleString(DATE_LOCALE[language] || 'en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              ],
            ]}
          />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-900/35">{t('bankDossier.signatureHashLabel')}</p>
          <p className="font-mono text-[10.5px] text-ink-900/70 break-all">{approval.signatureHash}</p>
          <p className="mt-2 text-[10.5px] text-ink-900/45 leading-snug">{t('bankDossier.verifyInstructions')}</p>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-amber-700">
          <Clock size={13} />
          {t('bankDossier.pendingReview')}
        </p>
      )}
    </div>
  )
}

function Section({ number, title, children }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-wide text-primary-600 mb-2">
        {number}. {title}
      </p>
      {children}
    </div>
  )
}

function FactGrid({ items, columns = 2 }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${columns} gap-3`}>
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-primary-50/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-900/35">{label}</p>
          <p className="text-[12.5px] font-bold text-primary-900 mt-0.5 truncate">{value}</p>
        </div>
      ))}
    </div>
  )
}
