import { useState } from 'react'
import { MapPin, Check, AlertTriangle, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { encodeDigipin, decodeDigipin, DigipinOutOfBoundsError, DigipinFormatError } from '../lib/digipin'

const geolocationSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator

function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
  })
}

// Optional DIGIPIN precision tag for the Wizard's location step — additive
// to the required state/district/block dropdowns, never a replacement.
// There's no district/block boundary data ingested anywhere in this repo
// today (only Madurai's villages have real geometry — see CLAUDE.md Known
// Gaps), so a DIGIPIN/GPS point can't be auto-resolved to a dropdown
// selection nationwide; this only records a precise point alongside
// whatever the applicant picks manually. Mirrors SiteCaptureCard.jsx's
// geolocation -> encodeDigipin pattern, minus the camera/consent/report
// linkage that's specific to site evidence.
export default function LocationDigipin({ digipin, onPinned, onClear }) {
  const { t } = useI18n()
  const [mode, setMode] = useState('idle') // idle | manual
  const [working, setWorking] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [errorReason, setErrorReason] = useState(null)

  const handleUseLocation = async () => {
    setWorking(true)
    setErrorReason(null)
    try {
      const position = await getPosition()
      const { latitude, longitude } = position.coords
      const pin = encodeDigipin(latitude, longitude)
      onPinned({ digipin: pin, lat: latitude, lon: longitude })
      setMode('idle')
    } catch (err) {
      if (err instanceof DigipinOutOfBoundsError) setErrorReason('outOfBounds')
      else if (err?.code === 1) setErrorReason('locationDenied')
      else setErrorReason('generic')
    } finally {
      setWorking(false)
    }
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    try {
      const { latitude, longitude } = decodeDigipin(manualInput)
      onPinned({ digipin: manualInput.trim().toUpperCase(), lat: latitude, lon: longitude })
      setMode('idle')
      setManualInput('')
      setErrorReason(null)
    } catch (err) {
      setErrorReason(err instanceof DigipinFormatError ? 'invalidFormat' : 'generic')
    }
  }

  if (digipin) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-teal-600/30 bg-teal-50/60 px-4 py-2.5">
        <MapPin size={15} className="text-teal-700 shrink-0" />
        <span className="text-xs text-teal-900">{t('wizard.digipinPinned', { digipin })}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label={t('common.back')}
          className="ml-auto text-teal-700/60 hover:text-teal-900"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {geolocationSupported() && (
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={working}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-40 transition-colors"
          >
            <MapPin size={13} />
            {working ? t('wizard.digipinWorking') : t('wizard.useMyLocation')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode(mode === 'manual' ? 'idle' : 'manual')}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
        >
          {mode === 'manual' ? <Check size={13} /> : null}
          {t('wizard.enterDigipinToggle')}
        </button>
      </div>

      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value.toUpperCase())}
            placeholder={t('wizard.digipinPlaceholder')}
            maxLength={10}
            className="w-full max-w-[220px] rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm tracking-wide text-ink-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
          />
          <button
            type="submit"
            className="rounded-full bg-primary-700 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600 transition-colors"
          >
            {t('common.continue')}
          </button>
        </form>
      )}

      {errorReason && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-700">
          <AlertTriangle size={13} />
          {t(`wizard.digipinError.${errorReason}`)}
        </p>
      )}
    </div>
  )
}
