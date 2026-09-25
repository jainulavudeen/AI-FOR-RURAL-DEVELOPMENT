import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, FileCheck2, MessageSquareWarning, Send, UserRoundCheck, Hourglass } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { listMyApplications, submitApplication } from '../lib/applications'
import ApplicationSummary from './ApplicationSummary'
import ApplicationTimeline, { StatusBadge } from './ApplicationTimeline'

// The applicant's side of the flow, at the top of My Dashboard: start a
// report, see every saved application with its status timeline, submit a
// draft for officer review, read the officer's note and resubmit, and —
// once approved — open the dossier carrying the Verified Approval.
export default function MyApplications() {
  const { t } = useI18n()
  const [apps, setApps] = useState(null)
  const [error, setError] = useState(false)

  const load = () => {
    setError(false)
    listMyApplications().then((result) => {
      if (result.ok) setApps(result.data)
      else setError(true)
    })
  }
  useEffect(load, [])

  const replace = (updated) => setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))

  return (
    <section id="applications" className="rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-primary-900">{t('applications.title')}</h2>
          <p className="text-[12.5px] text-ink-900/55">{t('applications.subtitle')}</p>
        </div>
        <Link
          to="/eligibility"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-amber-400 transition-colors"
        >
          <FilePlus2 size={15} />
          {t('applications.startNew')}
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          {t('applications.loadError')}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            {t('common.retry')}
          </button>
        </p>
      )}
      {!apps && !error && <p className="text-sm text-ink-900/50">{t('common.loading')}</p>}
      {apps && apps.length === 0 && (
        <div className="rounded-2xl bg-primary-50/60 px-4 py-5 text-[13px] text-ink-900/65">
          <p className="font-semibold text-primary-900">{t('applications.emptyTitle')}</p>
          <p className="mt-1">{t('applications.emptyBody')}</p>
        </div>
      )}
      {apps && apps.length > 0 && (
        <ul className="space-y-4">
          {apps.map((app) => (
            <ApplicationCard key={app.id} app={app} onUpdated={replace} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ApplicationCard({ app, onUpdated }) {
  const { t } = useI18n()
  const [submitOpen, setSubmitOpen] = useState(false)
  const decision = app.latestDecision
  const needsAction = app.status === 'rejected' || app.status === 'more_info'

  return (
    <li className="rounded-2xl border border-primary-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <ApplicationSummary application={app} />
        <StatusBadge status={app.status} />
      </div>

      <div className="mt-4">
        <ApplicationTimeline application={app} />
      </div>

      {(app.status === 'submitted' || app.status === 'under_review') && (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-900/65">
          {app.assignedOfficer ? <UserRoundCheck size={14} className="text-teal-600" /> : <Hourglass size={14} className="text-amber-600" />}
          {app.assignedOfficer
            ? t('applications.assignedTo', { name: app.assignedOfficer.label, designation: app.assignedOfficer.designation ?? '' })
            : t('applications.awaitingAssignment')}
        </p>
      )}

      {needsAction && decision && (
        <div className={`mt-3 rounded-xl px-3.5 py-3 ${app.status === 'rejected' ? 'bg-red-50' : 'bg-orange-50'}`}>
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink-900/80">
            <MessageSquareWarning size={14} />
            {t('applications.officerNote', { name: decision.officerName })}
          </p>
          <p className="mt-1 whitespace-pre-line text-[13px] text-ink-900/80">{decision.note}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {app.status === 'approved' && app.dossierId && (
          <Link
            to={`/bank-dossier/${app.dossierId}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-teal-600 transition-colors"
          >
            <FileCheck2 size={15} />
            {t('applications.downloadDossier')}
          </Link>
        )}
        {(app.status === 'draft' || needsAction) && !submitOpen && (
          <button
            type="button"
            onClick={() => setSubmitOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-primary-800 transition-colors"
          >
            <Send size={14} />
            {app.status === 'draft' ? t('applications.submitCta') : t('applications.resubmitCta')}
          </button>
        )}
        {needsAction && (
          <Link
            to="/eligibility"
            className="inline-flex items-center rounded-full border border-primary-200 px-4 py-2.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
          >
            {t('applications.updateReportCta')}
          </Link>
        )}
      </div>

      {submitOpen && <SubmitForm app={app} onDone={(updated) => { setSubmitOpen(false); if (updated) onUpdated(updated) }} />}
    </li>
  )
}

function SubmitForm({ app, onDone }) {
  const { t } = useI18n()
  const [proprietorName, setProprietorName] = useState('')
  const [bankName, setBankName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isResubmit = app.status !== 'draft'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const result = await submitApplication(app.id, {
      proprietorName: proprietorName.trim() || null,
      bankName: bankName.trim() || null,
      note: note.trim() || null,
    })
    setBusy(false)
    if (result.ok) onDone(result.data)
    else setError(result.status === 0 ? t('auth.offline') : result.data?.error?.message || t('auth.genericError'))
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-2xl bg-primary-50/50 p-4">
      <p className="text-[12.5px] text-ink-900/65">{t('applications.submitExplainer')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={proprietorName}
          onChange={(e) => setProprietorName(e.target.value)}
          placeholder={t('bankDossier.proprietorNamePlaceholder')}
          aria-label={t('bankDossier.proprietorNameLabel')}
          className="rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
        />
        <input
          type="text"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder={t('bankDossier.bankNamePlaceholder')}
          aria-label={t('bankDossier.bankNameLabel')}
          className="rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
        />
      </div>
      {isResubmit && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t('applications.resubmitNotePlaceholder')}
          className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
        />
      )}
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-primary-700 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-primary-800 disabled:opacity-50 transition-colors"
        >
          {busy ? t('applications.submitting') : t('applications.confirmSubmit')}
        </button>
        <button type="button" onClick={() => onDone(null)} className="rounded-full px-4 py-2.5 text-[13px] font-semibold text-ink-900/60 hover:text-ink-900">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
