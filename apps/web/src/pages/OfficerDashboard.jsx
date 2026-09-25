import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Search, ChevronDown } from 'lucide-react'
import { SCHEMES } from '@setu/core'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { getOfficerQueue, updateAppeal } from '../lib/feedback'
import { humanizeSlug } from '../lib/slug'
import { BUSINESS_TYPES } from '../data/businesses'
import Skeleton from '../components/Skeleton'

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  assigned: 'bg-primary-100 text-primary-700',
  in_review: 'bg-primary-100 text-primary-700',
  resolved: 'bg-teal-600/10 text-teal-700',
  rejected: 'bg-red-100 text-red-700',
  escalated: 'bg-orange-100 text-orange-700',
}

const STATUS_KEYS = {
  pending: 'officer.statusPending',
  assigned: 'officer.statusAssigned',
  in_review: 'officer.statusInReview',
  resolved: 'officer.statusResolved',
  rejected: 'officer.statusRejected',
  escalated: 'officer.statusEscalated',
}

const STATUS_OPTIONS = ['pending', 'assigned', 'in_review', 'resolved', 'rejected']

function scoreColor(score) {
  if (score >= 80) return 'text-teal-700'
  if (score >= 60) return 'text-primary-700'
  if (score >= 45) return 'text-amber-700'
  return 'text-red-600'
}

function AppealRow({ appeal, t, onSaved }) {
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState(appeal.status)
  const [note, setNote] = useState(appeal.resolutionNote || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null) // null | { reason: string|null, offline: boolean }

  const business = BUSINESS_TYPES.find((b) => b.id === appeal.report?.inputs?.businessId)
  // Prefers the real name saved alongside the report's inputs (every
  // report generated after real nationwide geography landed carries
  // stateName/districtName/blockName — see Wizard.jsx); humanizes the
  // slug as a fallback for an older report saved before that.
  const inputs = appeal.report?.inputs
  const districtLabel = inputs?.districtId ? inputs.districtName || humanizeSlug(inputs.districtId) : null
  const blockLabel = inputs?.blockId ? inputs.blockName || humanizeSlug(inputs.blockId) : null
  const scheme = appeal.report ? SCHEMES[appeal.report.matchedSchemeId] : null

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const result = await updateAppeal(appeal.id, { status, resolutionNote: note })
    setSaving(false)
    if (result.ok) {
      setExpanded(false)
      onSaved(result.data)
    } else if (result.status === 0) {
      // A thrown fetch (offline, DNS failure, or a blocked CORS
      // preflight) never reaches the server at all — status 0, no body.
      // Distinct from a real server-side rejection below.
      setError({ reason: null, offline: true })
    } else {
      setError({ reason: result.data?.error?.message ?? null, offline: false })
    }
  }

  return (
    <>
      <tr className="border-t border-primary-50 hover:bg-primary-50/30 transition-colors">
        <td className="px-5 py-4">
          <p className="font-semibold text-primary-900">{appeal.applicantPhone}</p>
          <p className="text-[11px] text-ink-900/40">{appeal.id.slice(0, 8)}</p>
        </td>
        <td className="px-5 py-4 text-ink-900/70">{business ? t(business.labelKey) : '—'}</td>
        <td className="px-5 py-4 text-ink-900/70">
          {blockLabel && districtLabel ? `${blockLabel}, ${districtLabel}` : '—'}
        </td>
        <td className={`px-5 py-4 font-bold ${appeal.report ? scoreColor(appeal.report.score) : ''}`}>
          {appeal.report ? appeal.report.score : '—'}
        </td>
        <td className="px-5 py-4 text-ink-900/70">{scheme ? t(scheme.nameKey) : '—'}</td>
        <td className="px-5 py-4">
          <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[appeal.status]}`}>
            {t(STATUS_KEYS[appeal.status])}
          </span>
        </td>
        <td className="px-5 py-4 text-right">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs font-semibold text-primary-700 hover:underline">
            {t('officer.manageAction')}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-primary-50 bg-primary-50/20">
          <td colSpan={7} className="px-5 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-3 items-start max-w-2xl">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-900/40 mb-1.5">
                  {t('officer.statusLabel')}
                </label>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {t(STATUS_KEYS[s])}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-primary-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-900/40 mb-1.5">
                  {t('officer.resolutionNoteLabel')}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('officer.resolutionNotePlaceholder')}
                  rows={2}
                  className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div className="pt-6">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-primary-700 px-5 py-2 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? t('officer.saving') : t('officer.save')}
                </button>
              </div>
            </div>
            {error && (
              <p className="mt-2 text-[11px] text-red-600">
                {error.offline
                  ? t('officer.saveErrorOffline')
                  : error.reason
                    ? t('officer.saveErrorReason', { reason: error.reason })
                    : t('officer.saveError')}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// Rendered as the "Review requests" (appeals) tab inside ReviewQueue —
// `embedded` drops its own page header. Appeals route to officers by the
// same jurisdiction rule as applications (apps/api feedback/routes.ts).
export default function OfficerDashboard({ embedded = false }) {
  const { t } = useI18n()
  const { isAuthenticated, role, requestLogin } = useAuth()
  const [query, setQuery] = useState('')
  const [queue, setQueue] = useState(null)
  const [error, setError] = useState(false)

  const canView = isAuthenticated && role === 'officer'

  useEffect(() => {
    if (!canView) return
    let cancelled = false
    setQueue(null)
    setError(false)
    getOfficerQueue().then((result) => {
      if (cancelled) return
      if (result.ok) setQueue(result.data)
      else setError(true)
    })
    return () => {
      cancelled = true
    }
  }, [canView])

  const filtered = (queue ?? []).filter(
    (a) =>
      (a.applicantPhone ?? '').toLowerCase().includes(query.toLowerCase()) ||
      (a.report?.inputs?.businessId ?? '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className={embedded ? '' : 'mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16'}>
      {!embedded && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-700 text-white">
              <Users size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-primary-900">{t('officer.title')}</h1>
              <p className="text-sm text-ink-900/55">{t('officer.subtitle')}</p>
            </div>
          </div>
          <p className="mt-3 mb-8 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
            {t('officer.disclaimer')}
          </p>
        </>
      )}
      {embedded && <p className="mb-4 text-[12.5px] text-ink-900/55">{t('review.appealsExplainer')}</p>}

      {!canView && (
        <div className="rounded-3xl border border-primary-100 card-shadow-lg bg-white px-8 py-14 text-center">
          <p className="text-sm text-ink-900/60">{!isAuthenticated ? t('officer.signInPrompt') : t('officer.notOfficer')}</p>
          {!isAuthenticated && (
            <button
              type="button"
              onClick={requestLogin}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
            >
              {t('auth.signIn')}
            </button>
          )}
        </div>
      )}

      {canView && (
        <>
          <div className="relative mb-5 max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-primary-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              className="w-full rounded-xl border border-primary-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="overflow-x-auto rounded-3xl border border-primary-100 card-shadow-lg bg-white"
          >
            {queue === null && !error && (
              <div className="p-5 space-y-3" aria-label={t('officer.loading')}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
            {error && <p className="px-5 py-10 text-center text-sm text-red-600">{t('officer.error')}</p>}
            {queue !== null && !error && filtered.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-ink-900/50">{t('officer.empty')}</p>
            )}
            {queue !== null && !error && filtered.length > 0 && (
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-ink-900/40">
                    <th className="px-5 py-4 font-medium">{t('officer.colApplicant')}</th>
                    <th className="px-5 py-4 font-medium">{t('officer.colBusiness')}</th>
                    <th className="px-5 py-4 font-medium">{t('officer.colLocation')}</th>
                    <th className="px-5 py-4 font-medium">{t('officer.colScore')}</th>
                    <th className="px-5 py-4 font-medium">{t('officer.colScheme')}</th>
                    <th className="px-5 py-4 font-medium">{t('officer.colStatus')}</th>
                    <th className="px-5 py-4 font-medium text-right">{t('officer.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <AppealRow
                      key={a.id}
                      appeal={a}
                      t={t}
                      onSaved={(updated) => setQueue((q) => q.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        </>
      )}
    </div>
  )
}
