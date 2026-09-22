import { useRef, useState } from 'react'
import { FileUp, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { uploadBankStatement } from '../lib/bankStatement'

// "Add a bank statement" — a real, best-effort PDF parse (see apps/api's
// bankStatement module for exactly what it can and can't recognize), never
// simulated. Uploaded transactions SUPPLEMENT the self-logged Bahi-Khata
// ledger — they're tagged source: 'bank_statement' server-side and never
// replace anything already logged (this session's explicit design
// decision). Since the upload endpoint returns only a summary, not the
// inserted rows, the caller is expected to refetch the ledger on success
// (see onUploaded) rather than trying to merge rows locally.
export default function BankStatementUpload({ onUploaded }) {
  const { t } = useI18n()
  const inputRef = useRef(null)
  const [state, setState] = useState('idle') // 'idle' | 'uploading' | 'done' | 'error'
  const [result, setResult] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    setState('uploading')
    setErrorMessage('')
    const response = await uploadBankStatement(file)

    if (response.ok && response.data) {
      setResult(response.data)
      setState('done')
      onUploaded?.(response.data)
    } else {
      setErrorMessage(response.data?.error?.message || t('bankStatement.genericError'))
      setState('error')
    }
  }

  return (
    <div className="rounded-2xl border border-primary-100 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileUp size={16} className="text-primary-600" />
        <span className="text-sm font-bold text-primary-900">{t('bankStatement.cardTitle')}</span>
      </div>
      <p className="text-[12px] text-ink-900/50 mb-3">{t('bankStatement.cardSubtitle')}</p>

      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === 'uploading'}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-primary-800 disabled:opacity-60 transition-colors"
      >
        {state === 'uploading' ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
        {state === 'uploading' ? t('bankStatement.uploading') : t('bankStatement.uploadCta')}
      </button>

      {state === 'done' && result && (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-teal-600/10 px-3 py-2.5 text-[12px] text-teal-800">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{t('bankStatement.successMessage', { count: result.transactionsExtracted })}</p>
            {result.warnings?.length > 0 && (
              <p className="mt-0.5 text-teal-700/80">{t('bankStatement.warningsNote', { count: result.warnings.length })}</p>
            )}
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      )}

      <p className="mt-3 text-[10.5px] text-ink-900/35 leading-snug">{t('bankStatement.disclaimer')}</p>
    </div>
  )
}
