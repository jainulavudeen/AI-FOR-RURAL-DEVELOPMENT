import { useRef, useState } from 'react'
import { Camera, Check, Clock, AlertTriangle, MapPin } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { encodeDigipin, DigipinOutOfBoundsError } from '../lib/digipin'
import { compressImageFile } from '../lib/imageCompress'
import { uploadSiteCapture } from '../lib/siteCapture'
import { getSiteAddressSuggestion } from '../lib/googleMaps'
import MapAttribution from './MapAttribution'

const geolocationSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator

function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
  })
}

// Camera capture plus a DIGIPIN pin for the proposed business site — turns
// "hyper-local" into evidence a bank or CSC officer can verify (see
// apps/api/src/modules/siteCapture). `<input type=file capture=environment>`
// rather than a custom getUserMedia video preview: it's the lighter, more
// universally-supported way to reach a phone camera (with a file-picker
// fallback on desktop/no-camera devices for free), which matters more here
// than a custom UI given the target device. Consent is explicit and
// required before geolocation is even requested, let alone anything stored.
//
// Between capture and upload is an address step: when online, a Google
// reverse-geocode suggestion pre-fills an editable field; the user
// confirms or corrects it, and only THEIR text is saved (as user-provided
// data, with how it was produced — see apps/api db/schema/siteCaptures.ts).
// Offline, or if Google is slow/unavailable, the field is simply empty
// and optional. The DIGIPIN remains the permanent location record.
export default function SiteCaptureCard({ reportId }) {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const [consented, setConsented] = useState(false)
  const [state, setState] = useState('idle') // idle | working | confirm | sending | sent | queued | error
  const [errorReason, setErrorReason] = useState(null)
  const [pending, setPending] = useState(null) // captured photo + pin, awaiting address step
  const [suggestion, setSuggestion] = useState(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [addressText, setAddressText] = useState('')
  const fileInputRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!isAuthenticated) {
      requestLogin()
      return
    }

    setState('working')
    setErrorReason(null)
    try {
      const [photoDataUrl, position] = await Promise.all([compressImageFile(file), getPosition()])
      const { latitude, longitude } = position.coords
      const digipin = encodeDigipin(latitude, longitude)

      setPending({ digipin, latitude, longitude, photoDataUrl, consentAt: new Date().toISOString() })
      setSuggestion(null)
      setAddressText('')
      setState('confirm')

      // Best-effort; the address field works without it. getSiteAddressSuggestion
      // returns null at once when offline.
      setSuggestionLoading(true)
      getSiteAddressSuggestion(latitude, longitude).then((result) => {
        setSuggestionLoading(false)
        if (!result) return
        setSuggestion(result)
        setAddressText((current) => current || result.address)
      })
    } catch (err) {
      setState('error')
      if (err instanceof DigipinOutOfBoundsError) setErrorReason('outOfBounds')
      else if (err?.code === 1) setErrorReason('locationDenied') // GeolocationPositionError.PERMISSION_DENIED
      else setErrorReason('generic')
    }
  }

  const handleSave = async (withAddress) => {
    if (!pending) return
    const trimmed = withAddress ? addressText.trim() : ''
    let addressSource = null
    if (trimmed) {
      if (!suggestion) addressSource = 'user_entered'
      else addressSource = trimmed === suggestion.address.trim() ? 'user_confirmed' : 'user_corrected'
    }
    setState('sending')
    const result = await uploadSiteCapture({
      reportId: reportId ?? null,
      ...pending,
      confirmedAddress: trimmed || null,
      addressSource,
    })
    setPending(null)
    if (result.queued) setState('queued')
    else if (result.ok) setState('sent')
    else {
      setErrorReason('generic')
      setState('error')
    }
  }

  const isDone = state === 'sent' || state === 'queued'
  const inAddressStep = state === 'confirm' || state === 'sending'

  return (
    <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={16} className="text-primary-600" />
        <span className="text-sm font-bold text-primary-900">{t('siteCapture.title')}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-900/65 mb-3.5">{t('siteCapture.body')}</p>

      {!geolocationSupported() && <p className="text-[12px] text-amber-700">{t('siteCapture.noGeolocation')}</p>}

      {inAddressStep && (
        <div>
          <p className="text-[12.5px] font-bold text-primary-900 mb-1">{t('siteCapture.addressTitle')}</p>
          <p className="text-[11.5px] leading-snug text-ink-900/60 mb-2">
            {suggestionLoading ? t('siteCapture.addressLoading') : suggestion ? t('siteCapture.addressHelp') : t('siteCapture.addressHelpManual')}
          </p>
          <textarea
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder={t('siteCapture.addressPlaceholder')}
            className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
          />
          {suggestion && <MapAttribution source={suggestion.source} />}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={state === 'sending' || !addressText.trim()}
              onClick={() => handleSave(true)}
              className="inline-flex items-center gap-2 rounded-full bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Check size={15} />
              {t('siteCapture.addressConfirm')}
            </button>
            <button
              type="button"
              disabled={state === 'sending'}
              onClick={() => handleSave(false)}
              className="rounded-full border border-primary-200 px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-40 transition-colors"
            >
              {t('siteCapture.addressSkip')}
            </button>
          </div>
        </div>
      )}

      {geolocationSupported() && !isDone && !inAddressStep && (
        <>
          <label className="flex items-start gap-2.5 cursor-pointer mb-3.5">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-primary-700"
            />
            <span className="text-[12.5px] text-ink-900/70">{t('siteCapture.consentLabel')}</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            disabled={!consented || state === 'working'}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Camera size={15} />
            {state === 'working' ? t('siteCapture.working') : t('siteCapture.cta')}
          </button>

          {state === 'error' && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-red-600">
              <AlertTriangle size={13} />
              {t(`siteCapture.error.${errorReason ?? 'generic'}`)}
            </p>
          )}
        </>
      )}

      {isDone && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-teal-700">
          {state === 'sent' ? <Check size={15} /> : <Clock size={15} />}
          {state === 'sent' ? t('siteCapture.sent') : t('siteCapture.queued')}
        </p>
      )}
    </div>
  )
}
