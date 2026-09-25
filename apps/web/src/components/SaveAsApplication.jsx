import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderPlus, RefreshCcw } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { createApplication, listMyApplications, reviseApplication } from '../lib/applications'
import { applicationTitle } from './ApplicationSummary'

// Results → My Dashboard. The report on screen is already saved silently
// (Results.jsx's saveReport); this turns it into something an officer can
// review: a new draft application, or — if an officer asked for more
// information, rejected it, or the applicant wants to revise an approved
// one — the new report attached to that existing application. Revising
// never edits the old report or approval; it records a new version.
export default function SaveAsApplication({ reportId }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [revisable, setRevisable] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listMyApplications().then((result) => {
      if (cancelled || !result.ok) return
      setRevisable(result.data.filter((a) => ['more_info', 'rejected', 'approved'].includes(a.status) && a.reportId !== reportId))
    })
    return () => {
      cancelled = true
    }
  }, [reportId])

  const run = async (action) => {
    setBusy(true)
    setError('')
    const result = await action()
    setBusy(false)
    if (result.ok) navigate('/dashboard#applications')
    else setError(result.status === 0 ? t('auth.offline') : result.data?.error?.message || t('auth.genericError'))
  }

  return (
    <div className="no-print rounded-3xl border border-teal-600/30 bg-teal-50/40 p-5 sm:p-6">
      <p className="text-[15px] font-extrabold text-primary-900">{t('applications.saveTitle')}</p>
      <p className="mt-1 text-[12.5px] text-ink-900/60">{reportId ? t('applications.saveBody') : t('applications.saving')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!reportId || busy}
          onClick={() => run(() => createApplication(reportId))}
          className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
        >
          <FolderPlus size={15} />
          {t('applications.saveCta')}
        </button>
        {revisable.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={!reportId || busy}
            onClick={() => run(() => reviseApplication(a.id, reportId))}
            className="inline-flex items-center gap-1.5 rounded-full border border-teal-700/40 bg-white px-4 py-2.5 text-[13px] font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw size={14} />
            {t('applications.attachTo', { title: applicationTitle(t, a), status: t(`applications.status.${a.status}`) })}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  )
}
