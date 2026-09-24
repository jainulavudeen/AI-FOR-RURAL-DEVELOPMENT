import { useEffect, useRef, useState } from 'react'
import { MapPin, Check, AlertTriangle, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { encodeDigipin, decodeDigipin, DigipinOutOfBoundsError, DigipinFormatError } from '../lib/digipin'
import { getReverseGeocode } from '../lib/marketData'
import { matchLocationByName } from '../lib/geography'

const geolocationSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator

function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
  })
}

// DIGIPIN precision tag for the Wizard's location step, additive to the
// required state/district/block dropdowns. `onPinned` always fires (the
// DIGIPIN math is pure client-side, never fails alongside a GPS success).
// `onLocationResolved` is a second, independent, best-effort pass: it
// calls the backend's /feasibility/reverse-geocode (real, keyless OSM
// Nominatim lookup by default) and matches the returned state/district
// name against the real nationwide administrative catalogue
// (lib/geography.js — Census 2011 names, 35 states/628 districts). A
// genuine spelling/formatting mismatch between Nominatim's name and the
// Census name correctly reports "not resolved" rather than an error
// (CLAUDE.md rule 4: degrade, don't error). Block never auto-fills: real
// block-level boundary polygons don't exist to reverse-geocode against
// (blocks.geom stays null — see ingestion/adminHierarchy/), same
// precedent as Wizard.jsx's voice-input matching stopping at district.
// Mirrors SiteCaptureCard.jsx's geolocation -> encodeDigipin pattern,
// minus the camera/consent/report linkage specific to site evidence.
export default function LocationDigipin({ digipin, onPinned, onClear, onLocationResolved, selectedStateId, selectedDistrictId }) {
  const { t } = useI18n()
  const [mode, setMode] = useState('idle') // idle | manual
  const [working, setWorking] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [errorReason, setErrorReason] = useState(null)
  const [matchNotice, setMatchNotice] = useState(null) // null | 'matched' | 'stateOnly' | 'unmatched'

  // Mirrors the Wizard's current state/district selection so the async
  // reverse-geocode below can tell whether the user picked a district
  // manually while the (unbounded, no-timeout) network round-trip was in
  // flight. Without this, a manual pick made between "Use my location" and
  // the network reply was silently overwritten the moment the reply
  // landed — the exact bug where selecting a valid district "did nothing".
  const latestSelectionRef = useRef({ stateId: selectedStateId, districtId: selectedDistrictId })
  useEffect(() => {
    latestSelectionRef.current = { stateId: selectedStateId, districtId: selectedDistrictId }
  }, [selectedStateId, selectedDistrictId])

  const handleUseLocation = async () => {
    const requestedFrom = { stateId: selectedStateId, districtId: selectedDistrictId }
    setWorking(true)
    setErrorReason(null)
    setMatchNotice(null)
    try {
      const position = await getPosition()
      const { latitude, longitude } = position.coords
      const pin = encodeDigipin(latitude, longitude)
      onPinned({ digipin: pin, lat: latitude, lon: longitude })
      setMode('idle')

      // Best-effort second pass — never throws past this point, and never
      // undoes the DIGIPIN pin above just because reverse geocoding is
      // slow, unreachable, or has no match against the real nationwide
      // catalogue (lib/geography.js).
      const resolved = await getReverseGeocode(latitude, longitude)
      const { stateId, stateName, districtId, districtName } = resolved
        ? await matchLocationByName(resolved.state, resolved.district)
        : {}
      const current = latestSelectionRef.current
      const userChangedSelectionMeanwhile =
        current.stateId !== requestedFrom.stateId || current.districtId !== requestedFrom.districtId

      if (stateId && !userChangedSelectionMeanwhile) {
        onLocationResolved?.({ stateId, stateName, districtId, districtName })
        // District doesn't always match even when state does — OSM
        // Nominatim's district name doesn't always agree exactly with
        // the Census name, so a genuine mismatch correctly leaves districtId
        // empty. Reporting that honestly rather than claiming both filled.
        setMatchNotice(districtId ? 'matched' : 'stateOnly')
      } else if (stateId && userChangedSelectionMeanwhile) {
        // The user already made their own choice while this was in
        // flight — deliberately drop the result rather than clobber it or
        // show a match notice that would contradict what's actually
        // selected now.
      } else {
        setMatchNotice('unmatched')
      }
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
      <div className="mt-4">
        <div className="flex items-center gap-2 rounded-xl border border-teal-600/30 bg-teal-50/60 px-4 py-2.5">
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
        {matchNotice === 'matched' && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-teal-700">
            <Check size={13} />
            {t('wizard.digipinLocationMatched')}
          </p>
        )}
        {matchNotice === 'stateOnly' && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-700">
            <Check size={13} />
            {t('wizard.digipinLocationStateOnly')}
          </p>
        )}
        {matchNotice === 'unmatched' && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-900/50">
            <AlertTriangle size={13} />
            {t('wizard.digipinLocationUnmatched')}
          </p>
        )}
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
