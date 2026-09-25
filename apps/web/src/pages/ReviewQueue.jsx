import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, FileText, Gavel, Inbox, Phone, Mail, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { decideApplication, listAssignedApplications, startReview } from '../lib/applications'
import ApplicationSummary from '../components/ApplicationSummary'
import ApplicationTimeline, { StatusBadge } from '../components/ApplicationTimeline'
import OfficerDashboard from './OfficerDashboard'

// The officer's landing page. Shows ONLY applications assigned to this
// officer — by jurisdiction at submit time, or by an admin — because the
// API returns nothing else (GET /applications/assigned). From here the
// officer opens the frozen dossier, takes the case under review, and
// records a decision: approve (→ Verified Approval on the dossier),
// request more information, or reject — the last two with a note the
// applicant sees. "Review requests" is the pre-existing appeals queue.
export default function ReviewQueue() {
  const { t } = useI18n()
  const { displayName, session } = useAuth()
  const [tab, setTab] = useState('applications')

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-700 text-white">
          <ClipboardCheck size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-primary-900">{t('review.title')}</h1>
          <p className="text-sm text-ink-900/55">
            {displayName ? t('review.subtitleNamed', { name: displayName, designation: session?.designation ?? '' }) : t('review.subtitle')}
          </p>
        </div>
      </div>
      <p className="mt-3 mb-6 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
        {t('review.onlyAssigned')}
      </p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-primary-100 pb-3">
        {[
          { key: 'applications', icon: Inbox },
          { key: 'appeals', icon: Gavel },
        ].map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
              tab === key ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
            }`}
          >
            <Icon size={14} />
            {t(`review.tab.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'applications' ? <AssignedApplications /> : <OfficerDashboard embedded />}
    </div>
  )
}

function AssignedApplications() {
  const { t } = useI18n()
  const [apps, setApps] = useState(null)
  const [error, setError] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = () => {
    setError(false)
    listAssignedApplications().then((result) => {
      if (result.ok) {
        setApps(result.data)
        setSelectedId((cur) => cur ?? result.data.find((a) => a.status === 'submitted' || a.status === 'under_review')?.id ?? null)
      } else setError(true)
    })
  }
  useEffect(load, [])

  const replace = (updated) => setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  const selected = apps?.find((a) => a.id === selectedId) ?? null
  const open = apps?.filter((a) => a.status === 'submitted' || a.status === 'under_review') ?? []
  const done = apps?.filter((a) => !(a.status === 'submitted' || a.status === 'under_review')) ?? []

  if (error) return <p className="text-sm text-red-600">{t('review.loadError')}</p>
  if (!apps) return <p className="text-sm text-ink-900/50">{t('common.loading')}</p>

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-900/45">{t('review.openCases', { count: open.length })}</p>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:text-primary-800">
            <RefreshCw size={12} />
            {t('common.refresh')}
          </button>
        </div>
        {apps.length === 0 && <p className="rounded-2xl bg-primary-50/60 px-4 py-5 text-[13px] text-ink-900/60">{t('review.empty')}</p>}
        <CaseList items={open} selectedId={selectedId} onSelect={setSelectedId} />
        {done.length > 0 && (
          <>
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-900/45">{t('review.decidedCases')}</p>
            <CaseList items={done} selectedId={selectedId} onSelect={setSelectedId} />
          </>
        )}
      </div>
      <div>{selected ? <CaseDetail key={selected.id} app={selected} onUpdated={replace} /> : <p className="text-sm text-ink-900/45">{t('review.selectPrompt')}</p>}</div>
    </div>
  )
}

function CaseList({ items, selectedId, onSelect }) {
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onSelect(a.id)}
            className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
              a.id === selectedId ? 'border-primary-500 bg-primary-50/60' : 'border-primary-100 bg-white hover:border-primary-300'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-ink-900/60">{a.applicant?.label || a.applicant?.phone || a.applicant?.email}</p>
              <ApplicationSummary application={a} />
            </div>
            <StatusBadge status={a.status} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function CaseDetail({ app, onUpdated }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const decidable = app.status === 'submitted' || app.status === 'under_review'

  const act = async (fn) => {
    setBusy(true)
    setError('')
    const result = await fn()
    setBusy(false)
    if (result.ok) {
      onUpdated(result.data)
      setNote('')
    } else setError(result.status === 0 ? t('auth.offline') : result.data?.error?.message || t('auth.genericError'))
  }

  const decide = (decision) => {
    if (decision !== 'approved' && !note.trim()) {
      setError(t('review.noteRequired'))
      return
    }
    act(() => decideApplication(app.id, decision, note.trim() || null))
  }

  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <ApplicationSummary application={app} />
        <StatusBadge status={app.status} />
      </div>

      {app.applicant && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-900/65">
          <span className="font-semibold text-primary-900">{app.applicant.label}</span>
          {app.applicant.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone size={12} />
              {app.applicant.phone}
            </span>
          )}
          {app.applicant.email && (
            <span className="inline-flex items-center gap-1">
              <Mail size={12} />
              {app.applicant.email}
            </span>
          )}
        </div>
      )}

      <div className="mt-5">
        <ApplicationTimeline application={app} />
      </div>

      {app.events?.some((e) => e.note) && (
        <div className="mt-4 space-y-2">
          {app.events
            .filter((e) => e.note)
            .map((e) => (
              <p key={e.id} className="rounded-xl bg-primary-50/60 px-3 py-2 text-[12.5px] text-ink-900/75">
                <span className="font-semibold">{t(`roles.${e.actorRole}`, {})}:</span> {e.note}
              </p>
            ))}
        </div>
      )}

      {app.dossierId && (
        <Link
          to={`/bank-dossier/${app.dossierId}`}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-4 py-2.5 text-[13px] font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
        >
          <FileText size={14} />
          {t('review.openDossier')}
        </Link>
      )}

      {app.status === 'submitted' && (
        <div className="mt-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => startReview(app.id))}
            className="rounded-full bg-primary-700 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-primary-800 disabled:opacity-50 transition-colors"
          >
            {t('review.startReview')}
          </button>
        </div>
      )}

      {decidable && (
        <div className="mt-5 space-y-3 rounded-2xl bg-primary-50/50 p-4">
          <p className="text-[13px] font-bold text-primary-900">{t('review.decisionTitle')}</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t('review.notePlaceholder')}
            className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
          />
          <p className="text-[11.5px] text-ink-900/50">{t('review.approveExplainer')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('approved')}
              className="rounded-full bg-teal-700 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {t('review.approve')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('more_info')}
              className="rounded-full bg-orange-500 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-orange-400 disabled:opacity-50 transition-colors"
            >
              {t('review.moreInfo')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('rejected')}
              className="rounded-full border border-red-300 bg-white px-5 py-2.5 text-[13px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {t('review.reject')}
            </button>
          </div>
        </div>
      )}

      {app.latestDecision && !decidable && (
        <p className="mt-5 text-[12.5px] text-ink-900/60">
          {t('review.decidedBy', {
            name: app.latestDecision.officerName,
            decision: t(`applications.status.${app.latestDecision.decision}`),
            date: new Date(app.latestDecision.decidedAt).toLocaleString(),
          })}
        </p>
      )}

      {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}
    </div>
  )
}
