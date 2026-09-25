import { useEffect, useState } from 'react'
import { MapPin, Plus, Trash2, UserPlus } from 'lucide-react'
import { useI18n } from '../../i18n/I18nContext'
import { getOfficerAccounts, getOfficerStats, inviteOfficer, setOfficerJurisdictions, updateOfficer } from '../../lib/admin'
import { getBlocks, getDistricts, getStates } from '../../lib/geography'
import { humanizeSlug } from '../../lib/slug'

// Officers: the only place an officer account is created (nobody can sign
// up as one). An admin invites by phone and/or Gmail, sets the name +
// designation that will be frozen onto every approval that officer
// records, assigns the districts/blocks they cover (which is what routes
// new submissions to them), and can deactivate them — immediately
// effective, since the API re-reads the account on every request.
export default function OfficerAccountsTab() {
  const { t } = useI18n()
  const [rows, setRows] = useState(null)
  const [stats, setStats] = useState({})
  const [error, setError] = useState(false)

  const load = () => {
    setError(false)
    getOfficerAccounts().then((r) => (r.ok ? setRows(r.data) : setError(true)))
    getOfficerStats().then((r) => r.ok && setStats(Object.fromEntries(r.data.map((s) => [s.officerId, s]))))
  }
  useEffect(load, [])

  return (
    <div className="space-y-6">
      <InviteForm onInvited={load} />
      {error && <p className="text-sm text-red-600">{t('admin.loadError')}</p>}
      {!rows && !error && <p className="text-sm text-ink-900/50">{t('common.loading')}</p>}
      {rows?.length === 0 && <p className="text-sm text-ink-900/50">{t('admin.noOfficers')}</p>}
      {rows && (
        <ul className="space-y-3">
          {rows.map((o) => (
            <OfficerCard key={o.id} officer={o} stats={stats[o.id]} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  )
}

function InviteForm({ onInvited }) {
  const { t } = useI18n()
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [designation, setDesignation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const result = await inviteOfficer({
      phone: phone ? `+91${phone}` : undefined,
      email: email.trim() || undefined,
      displayName,
      designation,
    })
    setBusy(false)
    if (result.ok) {
      setPhone('')
      setEmail('')
      setDisplayName('')
      setDesignation('')
      setMessage({ ok: true, text: t('adminFlow.invited') })
      onInvited()
    } else setMessage({ ok: false, text: result.data?.error?.message || t('auth.genericError') })
  }

  const input = 'rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none'
  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-primary-100 bg-primary-50/40 p-4 space-y-3">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-primary-900">
        <UserPlus size={15} />
        {t('adminFlow.inviteTitle')}
      </p>
      <p className="text-[12px] text-ink-900/55">{t('adminFlow.inviteHint')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('adminFlow.namePlaceholder')} className={input} />
        <input required value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder={t('adminFlow.designationPlaceholder')} className={input} />
        <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 py-2.5">
          <span className="text-sm text-ink-900/50">+91</span>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder={t('adminFlow.phonePlaceholder')}
            className="w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('adminFlow.emailPlaceholder')} className={input} />
      </div>
      {message && <p className={`text-[12px] ${message.ok ? 'text-teal-700' : 'text-red-600'}`}>{message.text}</p>}
      <button
        type="submit"
        disabled={busy || (!phone && !email) || (phone && phone.length !== 10)}
        className="rounded-full bg-primary-700 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-primary-800 disabled:opacity-50 transition-colors"
      >
        {busy ? t('adminFlow.inviting') : t('adminFlow.inviteCta')}
      </button>
    </form>
  )
}

function OfficerCard({ officer, stats, onChanged }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleActive = async () => {
    setBusy(true)
    setError('')
    const r = await updateOfficer(officer.id, { active: !officer.active })
    setBusy(false)
    if (r.ok) onChanged()
    else setError(r.data?.error?.message || t('auth.genericError'))
  }

  const removeJurisdiction = async (index) => {
    const next = officer.jurisdictions.filter((_, i) => i !== index).map((j) => ({ districtId: j.districtId, blockId: j.blockId }))
    const r = await setOfficerJurisdictions(officer.id, next)
    if (r.ok) onChanged()
    else setError(r.data?.error?.message || t('auth.genericError'))
  }

  return (
    <li className={`rounded-2xl border bg-white p-4 ${officer.active ? 'border-primary-100' : 'border-dashed border-ink-900/20 opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-bold text-primary-900">
            {officer.displayName || '—'}
            {!officer.active && <span className="ml-2 rounded-full bg-ink-900/10 px-2 py-0.5 text-[10.5px] font-bold text-ink-900/60">{t('adminFlow.deactivated')}</span>}
          </p>
          <p className="text-[12.5px] text-ink-900/60">{officer.designation || t('adminFlow.noDesignation')}</p>
          <p className="mt-1 text-[12px] text-ink-900/50">
            {[officer.phone, officer.email, officer.invitedEmail && t('adminFlow.pendingInvite', { email: officer.invitedEmail })].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="text-right text-[12px] text-ink-900/60">
          <p>{t('adminFlow.openCount', { count: officer.openApplications })}</p>
          {stats && <p>{t('adminFlow.appealStats', { pending: stats.pendingCount, resolved: stats.resolvedCount })}</p>}
        </div>
      </div>

      <div className="mt-3">
        <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink-900/40">
          <MapPin size={11} />
          {t('adminFlow.jurisdiction')}
        </p>
        {officer.jurisdictions.length === 0 && <p className="mt-1 text-[12.5px] text-amber-700">{t('adminFlow.noJurisdiction')}</p>}
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {officer.jurisdictions.map((j, i) => (
            <li key={`${j.districtId}-${j.blockId}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-[12px] font-semibold text-primary-800">
              {j.blockName ? `${humanizeSlug(j.blockName)}, ${humanizeSlug(j.districtName)}` : t('adminFlow.wholeDistrict', { district: humanizeSlug(j.districtName) })}
              <button type="button" onClick={() => removeJurisdiction(i)} aria-label={t('adminFlow.removeJurisdiction')} className="text-primary-500 hover:text-red-600">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
        {editing ? (
          <JurisdictionPicker
            onCancel={() => setEditing(false)}
            onAdd={async (entry) => {
              const next = [...officer.jurisdictions.map((j) => ({ districtId: j.districtId, blockId: j.blockId })), entry]
              const r = await setOfficerJurisdictions(officer.id, next)
              if (r.ok) {
                setEditing(false)
                onChanged()
              } else setError(r.data?.error?.message || t('auth.genericError'))
            }}
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:text-primary-800">
            <Plus size={12} />
            {t('adminFlow.addJurisdiction')}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
      <div className="mt-3 border-t border-primary-50 pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={toggleActive}
          className={`text-[12px] font-semibold ${officer.active ? 'text-red-600 hover:text-red-800' : 'text-teal-700 hover:text-teal-900'}`}
        >
          {officer.active ? t('adminFlow.deactivate') : t('adminFlow.reactivate')}
        </button>
      </div>
    </li>
  )
}

function JurisdictionPicker({ onAdd, onCancel }) {
  const { t } = useI18n()
  const [states, setStates] = useState([])
  const [districts, setDistricts] = useState([])
  const [blocks, setBlocks] = useState([])
  const [stateId, setStateId] = useState('tamil_nadu')
  const [districtUuid, setDistrictUuid] = useState('')
  const [blockUuid, setBlockUuid] = useState('')

  useEffect(() => {
    getStates().then(setStates)
  }, [])
  useEffect(() => {
    setDistrictUuid('')
    getDistricts(stateId).then(setDistricts)
  }, [stateId])
  useEffect(() => {
    setBlockUuid('')
    if (districtUuid) getBlocks(districtUuid).then(setBlocks)
    else setBlocks([])
  }, [districtUuid])

  const select = 'rounded-lg border border-primary-200 bg-white px-2 py-2 text-[12.5px]'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-primary-50/50 p-3">
      <select value={stateId} onChange={(e) => setStateId(e.target.value)} className={select} aria-label={t('wizard.stateLabel')}>
        {states.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select value={districtUuid} onChange={(e) => setDistrictUuid(e.target.value)} className={select} aria-label={t('wizard.districtLabel')}>
        <option value="">{t('adminFlow.pickDistrict')}</option>
        {districts.map((d) => (
          <option key={d.uuid} value={d.uuid}>
            {d.name}
          </option>
        ))}
      </select>
      <select value={blockUuid} onChange={(e) => setBlockUuid(e.target.value)} className={select} disabled={!districtUuid} aria-label={t('wizard.blockLabel')}>
        <option value="">{t('adminFlow.wholeDistrictOption')}</option>
        {blocks.map((b) => (
          <option key={b.uuid} value={b.uuid}>
            {b.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!districtUuid}
        onClick={() => onAdd({ districtId: districtUuid, blockId: blockUuid || null })}
        className="rounded-full bg-primary-700 px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
      >
        {t('adminFlow.addCta')}
      </button>
      <button type="button" onClick={onCancel} className="text-[12.5px] font-semibold text-ink-900/55">
        {t('common.cancel')}
      </button>
    </div>
  )
}
