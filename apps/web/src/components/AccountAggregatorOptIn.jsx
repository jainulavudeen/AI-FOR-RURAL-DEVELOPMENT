import { useState } from 'react'
import { ShieldCheck, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { requestAaConsent, fetchAaMargin } from '../lib/accountAggregator'

// Opt-in only — self-reported margin capital (the default, set in the
// Wizard) is never a precondition for a report. See CLAUDE.md's
// non-negotiable boundary: opting into Account Aggregator is a choice.
// The mock provider (apps/api's default) activates consent immediately,
// so this flow completes in one click for the demo; a real AA provider
// would insert an out-of-band approval step in the user's AA app between
// "consenting" and "fetching" — this component's state machine already
// has room for that (the 'consenting' state), even though it resolves
// instantly today.
export default function AccountAggregatorOptIn({ marginSource, onVerified }) {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  // 'idle' | 'consenting' | 'fetching' | 'error'
  const [state, setState] = useState('idle')

  if (marginSource === 'aa') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-teal-700">
        <Check size={12} />
        {t('results.marginSourceAa')}
      </p>
    )
  }

  const handleClick = async () => {
    if (!isAuthenticated) {
      requestLogin()
      return
    }

    setState('consenting')
    const consentResult = await requestAaConsent()
    if (!consentResult.ok || !consentResult.data?.consentId) {
      setState('error')
      return
    }

    setState('fetching')
    const fetchResult = await fetchAaMargin(consentResult.data.consentId, 'margin_capital_verification')
    if (!fetchResult.ok || typeof fetchResult.data?.estimatedMarginCapital !== 'number') {
      setState('error')
      return
    }

    setState('idle')
    onVerified(fetchResult.data.estimatedMarginCapital)
  }

  const isBusy = state === 'consenting' || state === 'fetching'

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-60 transition-colors"
      >
        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
        {state === 'consenting' && t('results.aaConsenting')}
        {state === 'fetching' && t('results.aaFetching')}
        {(state === 'idle' || state === 'error') && t('results.aaOptInCta')}
      </button>
      {state === 'error' && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-red-600">
          <AlertTriangle size={11} />
          {t('results.aaError')}
        </p>
      )}
    </div>
  )
}
