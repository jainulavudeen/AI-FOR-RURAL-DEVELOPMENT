import { useRef, useState } from 'react'
import { Camera, Check, Clock, AlertTriangle, MapPin } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { encodeDigipin, DigipinOutOfBoundsError } from '../lib/digipin'
import { compressImageFile } from '../lib/imageCompress'
import { uploadSiteCapture } from '../lib/siteCapture'

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
export default function SiteCaptureCard({ reportId }) {
  const { t } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const [consented, setConsented] = useState(false)
  const [state, setState] = useState('idle') // idle | working | sent | queued | error
  const [errorReason, setErrorReason] = useState(null)
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

      const result = await uploadSiteCapture({
        reportId: reportId ?? null,
        digipin,
        latitude,
        longitude,
        photoDataUrl,
        consentAt: new Date().toISOString(),
      })

      if (result.queued) setState('queued')
      else if (result.ok) setState('sent')
      else setState('error')
    } catch (err) {
      setState('error')
      if (err instanceof DigipinOutOfBoundsError) setErrorReason('outOfBounds')
      else if (err?.code === 1) setErrorReason('locationDenied') // GeolocationPositionError.PERMISSION_DENIED
      else setErrorReason('generic')
    }
  }

  const isDone = state === 'sent' || state === 'queued'

  return (
    <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50/40 p-5">
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={16} className="text-primary-600" />
        <span className="text-sm font-bold text-primary-900">{t('siteCapture.title')}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-900/65 mb-3.5">{t('siteCapture.body')}</p>

      {!geolocationSupported() && <p className="text-[12px] text-amber-700">{t('siteCapture.noGeolocation')}</p>}

      {geolocationSupported() && !isDone && (
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
