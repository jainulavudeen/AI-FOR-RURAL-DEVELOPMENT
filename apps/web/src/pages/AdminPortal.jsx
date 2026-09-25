import { useEffect, useState } from 'react'
import { ShieldCheck, Users, FileText, Gavel, History, RefreshCw, Inbox } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { getOfficerAccounts, getAdminReports, getAdminAppeals, reassignAppeal, getAuditLog } from '../lib/admin'
import ApplicationsAdminTab, { AuditAction } from '../components/admin/ApplicationsAdminTab'
import OfficerAccountsTab from '../components/admin/OfficerAccountsTab'
import { LOCATIONS, STATE_IDS } from '../data/locations'
import { humanizeSlug } from '../lib/slug'

const STATUS_OPTIONS = ['pending', 'assigned', 'in_review', 'resolved', 'rejected', 'escalated']

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  assigned: 'bg-primary-100 text-primary-700',
  in_review: 'bg-primary-100 text-primary-700',
  resolved: 'bg-teal-600/10 text-teal-700',
  rejected: 'bg-red-100 text-red-700',
  escalated: 'bg-orange-100 text-orange-700',
}

const TABS = [
  { key: 'applications', icon: Inbox },
  { key: 'officers', icon: Users },
  { key: 'reports', icon: FileText },
  { key: 'appeals', icon: Gavel },
  { key: 'auditLog', icon: History },
]

const ALL_DISTRICTS = STATE_IDS.flatMap((stateId) => LOCATIONS[stateId].districts.map((d) => ({ ...d, stateId })))

// The district FILTER dropdown still lists only the old 8-state mock
// catalogue's districts (not a correctness bug — oversight tooling, lower
// priority than the applicant-facing Wizard — see CLAUDE.md item 8+9
// follow-up), but a REPORT/APPEAL row's real districtId (from real
// nationwide geography, see Wizard.jsx) won't be in that list — falls
// back to humanizing the slug rather than showing the raw id.
function districtLabel(t, districtId) {
  const d = ALL_DISTRICTS.find((x) => x.id === districtId)
  return d ? t(d.labelKey) : humanizeSlug(districtId)
}

// Oversight only — this page never lets an admin approve, resolve, or
// reject anything itself. Admins route work (assign/reassign applications
// and appeals), manage officer accounts and their jurisdictions, and see
// the full audit log. Reaching this page at all requires role 'admin'
// (App.jsx's RequireRole), and every call it makes is independently
// enforced server-side — an officer token gets a 403 from the API even
// if it bypasses this UI entirely.
export default function AdminPortal() {
  const { t } = useI18n()
  const [tab, setTab] = useState('applications')

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-700 text-white">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-primary-900">{t('admin.title')}</h1>
          <p className="text-sm text-ink-900/55">{t('admin.subtitle')}</p>
        </div>
      </div>
      <p className="mt-3 mb-8 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
        {t('admin.oversightDisclaimer')}
      </p>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-primary-100 pb-3">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
              tab === key ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
            }`}
          >
            <Icon size={14} />
            {t(`admin.tab.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'applications' && <ApplicationsAdminTab />}
      {tab === 'officers' && <OfficerAccountsTab />}
      {tab === 'reports' && <ReportsTab t={t} />}
      {tab === 'appeals' && <AppealsTab t={t} />}
      {tab === 'auditLog' && <AuditLogTab t={t} />}
    </div>
  )
}

function TableShell({ children }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-primary-100 bg-white">
      <table className="w-full text-[12.5px]">{children}</table>
    </div>
  )
}

function ReportsTab({ t }) {
  const [districtId, setDistrictId] = useState('')
  const [verdictKey, setVerdictKey] = useState('')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  const load = () => {
    setRows(null)
    setError(false)
    getAdminReports({ districtId: districtId || undefined, verdictKey: verdictKey || undefined }).then((result) => {
      if (result.ok) setRows(result.data)
      else setError(true)
    })
  }

  useEffect(load, [districtId, verdictKey])

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={districtId}
          onChange={(e) => setDistrictId(e.target.value)}
          className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-[12.5px]"
        >
          <option value="">{t('admin.allDistricts')}</option>
          {ALL_DISTRICTS.map((d) => (
            <option key={d.id} value={d.id}>
              {t(d.labelKey)}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={verdictKey}
          onChange={(e) => setVerdictKey(e.target.value)}
          placeholder={t('admin.verdictFilterPlaceholder')}
          className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-[12.5px]"
        />
      </div>

      {error && <p className="text-sm text-red-600">{t('admin.loadError')}</p>}
      {!rows && !error && <p className="text-sm text-ink-900/50">{t('common.loading')}</p>}
      {rows && (
        <TableShell>
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-900/40 border-b border-primary-100">
              <th className="px-4 py-3">{t('admin.applicantColLabel')}</th>
              <th className="px-4 py-3">{t('admin.scoreColLabel')}</th>
              <th className="px-4 py-3">{t('admin.verdictColLabel')}</th>
              <th className="px-4 py-3">{t('admin.schemeColLabel')}</th>
              <th className="px-4 py-3">{t('admin.districtColLabel')}</th>
              <th className="px-4 py-3">{t('admin.dateColLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-primary-50">
                <td className="px-4 py-3 font-semibold text-primary-900">{r.applicantPhone ?? '—'}</td>
                <td className="px-4 py-3">{r.score}</td>
                <td className="px-4 py-3">{r.verdictKey}</td>
                <td className="px-4 py-3">{r.matchedSchemeId}</td>
                <td className="px-4 py-3">{r.districtId ? districtLabel(t, r.districtId) : '—'}</td>
                <td className="px-4 py-3">{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-900/40">
                  {t('admin.noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}

function AppealsTab({ t }) {
  const [districtId, setDistrictId] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const [officers, setOfficers] = useState([])
  const [reassigning, setReassigning] = useState(null)

  useEffect(() => {
    getOfficerAccounts().then((result) => {
      if (result.ok) setOfficers(result.data.filter((o) => o.active))
    })
  }, [])

  const load = () => {
    setRows(null)
    setError(false)
    getAdminAppeals({ districtId: districtId || undefined, status: status || undefined }).then((result) => {
      if (result.ok) setRows(result.data)
      else setError(true)
    })
  }

  useEffect(load, [districtId, status])

  const handleReassign = async (appealId, officerId) => {
    if (!officerId) return
    setReassigning(appealId)
    const result = await reassignAppeal(appealId, officerId)
    setReassigning(null)
    if (result.ok) load()
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={districtId}
          onChange={(e) => setDistrictId(e.target.value)}
          className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-[12.5px]"
        >
          <option value="">{t('admin.allDistricts')}</option>
          {ALL_DISTRICTS.map((d) => (
            <option key={d.id} value={d.id}>
              {t(d.labelKey)}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-primary-200 bg-white px-3 py-2 text-[12.5px]"
        >
          <option value="">{t('admin.allStatuses')}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{t('admin.loadError')}</p>}
      {!rows && !error && <p className="text-sm text-ink-900/50">{t('common.loading')}</p>}
      {rows && (
        <TableShell>
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-900/40 border-b border-primary-100">
              <th className="px-4 py-3">{t('admin.applicantColLabel')}</th>
              <th className="px-4 py-3">{t('officer.statusLabel')}</th>
              <th className="px-4 py-3">{t('admin.officerColLabel')}</th>
              <th className="px-4 py-3">{t('admin.districtColLabel')}</th>
              <th className="px-4 py-3">{t('admin.reassignColLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-primary-50">
                <td className="px-4 py-3 font-semibold text-primary-900">{a.applicantPhone ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3">{a.assignedOfficerPhone ?? (a.assignedOfficerId ? a.assignedOfficerId.slice(0, 8) : t('adminFlow.unassigned'))}</td>
                <td className="px-4 py-3">{a.districtId ? districtLabel(t, a.districtId) : '—'}</td>
                <td className="px-4 py-3">
                  <select
                    disabled={reassigning === a.id}
                    defaultValue=""
                    onChange={(e) => handleReassign(a.id, e.target.value)}
                    className="rounded-lg border border-primary-200 bg-white px-2 py-1.5 text-[11.5px]"
                  >
                    <option value="" disabled>
                      {reassigning === a.id ? t('admin.reassigning') : t('admin.reassignPlaceholder')}
                    </option>
                    {officers
                      .filter((o) => o.id !== a.assignedOfficerId)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.displayName || o.phone || o.email}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-900/40">
                  {t('admin.noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}

function AuditLogTab({ t }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  const load = () => {
    setRows(null)
    setError(false)
    getAuditLog().then((result) => {
      if (result.ok) setRows(result.data)
      else setError(true)
    })
  }

  useEffect(load, [])

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary-600 hover:text-primary-800"
        >
          <RefreshCw size={12} />
          {t('common.refresh')}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{t('admin.loadError')}</p>}
      {!rows && !error && <p className="text-sm text-ink-900/50">{t('common.loading')}</p>}
      {rows && (
        <TableShell>
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-900/40 border-b border-primary-100">
              <th className="px-4 py-3">{t('admin.dateColLabel')}</th>
              <th className="px-4 py-3">{t('admin.actionColLabel')}</th>
              <th className="px-4 py-3">{t('admin.actorColLabel')}</th>
              <th className="px-4 py-3">{t('admin.targetColLabel')}</th>
              <th className="px-4 py-3">{t('admin.detailsColLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id} className="border-t border-primary-50">
                <td className="px-4 py-3 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <AuditAction entry={entry} />
                </td>
                <td className="px-4 py-3">
                  {entry.actorRole === 'system' ? (
                    t('roles.system')
                  ) : (
                    <>
                      {entry.actorLabel ?? entry.actorId.slice(0, 8)} <span className="text-ink-900/40">({t(`roles.${entry.actorRole}`)})</span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  {entry.targetType} {entry.targetId.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-ink-900/60">{entry.metadata ? JSON.stringify(entry.metadata) : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-900/40">
                  {t('admin.noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
