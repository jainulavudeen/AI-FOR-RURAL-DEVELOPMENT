import { useEffect, useState } from 'react'
import { ChevronDown, History } from 'lucide-react'
import { useI18n } from '../../i18n/I18nContext'
import { listAllApplications, reassignApplication } from '../../lib/applications'
import { getAuditLog, getOfficerAccounts } from '../../lib/admin'
import ApplicationSummary from '../ApplicationSummary'
import ApplicationTimeline, { StatusBadge } from '../ApplicationTimeline'

const STATUSES = ['submitted', 'under_review', 'more_info', 'approved', 'rejected', 'draft']
const REASSIGNABLE = ['submitted', 'under_review', 'more_info']

// Every application across the programme. Defaults to the UNASSIGNED
// queue — submissions from a block no officer covers — which only an
// admin can route. Admins assign/reassign (audited); they never decide.
export default function ApplicationsAdminTab() {
  const { t } = useI18n()
  const [filter, setFilter] = useState('unassigned')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const [officers, setOfficers] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    getOfficerAccounts().then((r) => r.ok && setOfficers(r.data.filter((o) => o.active)))
  }, [])

  const load = () => {
    setRows(null)
    setError(false)
    const args = filter === 'unassigned' ? { unassigned: true } : filter === 'all' ? {} : { status: filter }
    listAllApplications(args).then((r) => (r.ok ? setRows(r.data) : setError(true)))
  }
  useEffect(load, [filter])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-[12.5px]"
          aria-label={t('adminFlow.filterLabel')}
        >
          <option value="unassigned">{t('adminFlow.unassignedQueue')}</option>
          <option value="all">{t('admin.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`applications.status.${s}`)}
            </option>
          ))}
        </select>
        {filter === 'unassigned' && <p className="text-[12px] text-ink-900/55">{t('adminFlow.unassignedExplainer')}</p>}
      </div>

      {error && <p className="text-sm text-red-600">{t('admin.loadError')}</p>}
      {!rows && !error && <p className="text-sm text-ink-900/50">{t('common.loading')}</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl bg-primary-50/60 px-4 py-5 text-[13px] text-ink-900/60">{t('admin.noResults')}</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((a) => (
            <ApplicationRow
              key={a.id}
              app={a}
              officers={officers}
              expanded={expanded === a.id}
              onToggle={() => setExpanded((cur) => (cur === a.id ? null : a.id))}
              onChanged={load}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ApplicationRow({ app, officers, expanded, onToggle, onChanged }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [audit, setAudit] = useState(null)

  useEffect(() => {
    if (!expanded) return
    getAuditLog({ targetId: app.id }).then((r) => r.ok && setAudit(r.data))
  }, [expanded, app.id])

  const handleAssign = async (officerId) => {
    if (!officerId) return
    setBusy(true)
    setError('')
    const result = await reassignApplication(app.id, officerId)
    setBusy(false)
    if (result.ok) onChanged()
    else setError(result.data?.error?.message || t('auth.genericError'))
  }

  // Officers whose jurisdiction covers this application's district are
  // listed first — the admin can still pick anyone.
  const covering = officers.filter((o) => o.jurisdictions.some((j) => j.districtId === app.districtId))
  const others = officers.filter((o) => !covering.includes(o))

  return (
    <li className="rounded-2xl border border-primary-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-ink-900/60">
            {app.applicant?.label || app.applicant?.phone || app.applicant?.email}
          </p>
          <ApplicationSummary application={app} />
          <p className="mt-1 text-[12px] text-ink-900/60">
            {app.assignedOfficer
              ? t('adminFlow.assignedTo', { name: app.assignedOfficer.label })
              : app.status === 'draft'
                ? t('adminFlow.notSubmitted')
                : t('adminFlow.noOfficerCovers')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={app.status} />
          {REASSIGNABLE.includes(app.status) && (
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => handleAssign(e.target.value)}
              className="rounded-lg border border-primary-200 bg-white px-2 py-1.5 text-[12px]"
              aria-label={t('adminFlow.assignLabel')}
            >
              <option value="" disabled>
                {busy ? t('admin.reassigning') : app.assignedOfficerId ? t('admin.reassignPlaceholder') : t('adminFlow.assignPlaceholder')}
              </option>
              {covering.length > 0 && (
                <optgroup label={t('adminFlow.coveringOfficers')}>
                  {covering.filter((o) => o.id !== app.assignedOfficerId).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.displayName} · {t('adminFlow.openCount', { count: o.openApplications })}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t('adminFlow.otherOfficers')}>
                {others.filter((o) => o.id !== app.assignedOfficerId).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName} · {t('adminFlow.openCount', { count: o.openApplications })}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
      <button type="button" onClick={onToggle} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:text-primary-800">
        <History size={12} />
        {t('adminFlow.historyToggle')}
        <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} />
      </button>
      {expanded && (
        <div className="mt-3 space-y-4 border-t border-primary-50 pt-3">
          <ApplicationTimeline application={app} />
          {!audit && <p className="text-[12px] text-ink-900/45">{t('common.loading')}</p>}
          {audit && (
            <ol className="space-y-1.5">
              {[...audit].reverse().map((e) => (
                <li key={e.id} className="text-[12px] text-ink-900/70">
                  <span className="text-ink-900/45">{new Date(e.createdAt).toLocaleString()}</span> · <AuditAction entry={e} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}

// "K. Meena (officer) approved" style, readable by a non-engineer; the
// raw action code is kept in a tooltip for exactness.
export function AuditAction({ entry }) {
  const { t } = useI18n()
  const actor = entry.actorRole === 'system' ? t('roles.system') : `${entry.actorLabel ?? entry.actorId.slice(0, 8)} (${t(`roles.${entry.actorRole}`)})`
  const key = `audit.${entry.action}`
  const label = t(key)
  return (
    <span title={entry.action}>
      <span className="font-semibold text-primary-900">{actor}</span> {label === key ? entry.action : label}
      {entry.metadata?.note ? <span className="text-ink-900/55"> — “{entry.metadata.note}”</span> : null}
    </span>
  )
}
