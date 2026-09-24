import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n/I18nContext'
import LocationDigipin from './LocationDigipin'
import * as marketData from '../lib/marketData'
import * as geography from '../lib/geography'

// Regression coverage for: "selecting a valid district does nothing" —
// root cause was LocationDigipin's reverse-geocode callback unconditionally
// overwriting the Wizard's state/district selection whenever it resolved,
// with no check for whether the user had since picked something manually.
// These tests exercise LocationDigipin directly (not the full Wizard) so
// the async race can be controlled precisely: the geolocation + reverse
// geocode calls are mocked with a promise this test resolves on demand,
// simulating "the network reply lands after the user already clicked a
// dropdown option."

function deferred() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function setup({ selectedStateId = '', selectedDistrictId = '' } = {}) {
  const onLocationResolved = vi.fn()
  const onPinned = vi.fn()
  const onClear = vi.fn()
  const utils = render(
    <I18nProvider>
      <LocationDigipin
        digipin=""
        selectedStateId={selectedStateId}
        selectedDistrictId={selectedDistrictId}
        onPinned={onPinned}
        onClear={onClear}
        onLocationResolved={onLocationResolved}
      />
    </I18nProvider>
  )
  return { ...utils, onLocationResolved, onPinned }
}

describe('LocationDigipin GPS reverse-geocode race condition', () => {
  let positionDeferred
  let geocodeDeferred

  beforeEach(() => {
    positionDeferred = deferred()
    geocodeDeferred = deferred()
    vi.spyOn(marketData, 'getReverseGeocode').mockReturnValue(geocodeDeferred.promise)
    // matchLocationByName hits GET /geography/districts against the real
    // nationwide catalogue (lib/geography.js) — stubbed here so this test
    // doesn't depend on a live API server being reachable.
    vi.spyOn(geography, 'matchLocationByName').mockResolvedValue({
      stateId: 'tamil_nadu',
      stateName: 'Tamil Nadu',
      districtId: 'madurai',
      districtName: 'Madurai',
      districtUuid: 'uuid-madurai',
    })
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: vi.fn((resolve) => positionDeferred.promise.then(resolve)) },
      configurable: true,
    })
  })

  it('applies the GPS result when the user made no manual selection while it was in flight', async () => {
    const { onLocationResolved } = setup({ selectedStateId: '', selectedDistrictId: '' })

    fireEvent.click(screen.getByText(/use my current location/i))
    positionDeferred.resolve({ coords: { latitude: 9.9252, longitude: 78.1198 } })
    geocodeDeferred.resolve({ state: 'Tamil Nadu', district: 'Madurai' })

    await waitFor(() =>
      expect(onLocationResolved).toHaveBeenCalledWith({
        stateId: 'tamil_nadu',
        stateName: 'Tamil Nadu',
        districtId: 'madurai',
        districtName: 'Madurai',
      })
    )
  })

  it('drops the GPS result instead of clobbering a district the user picked while it was resolving', async () => {
    const { onLocationResolved, rerender } = setup({ selectedStateId: 'tamil_nadu', selectedDistrictId: '' })

    fireEvent.click(screen.getByText(/use my current location/i))
    positionDeferred.resolve({ coords: { latitude: 9.9252, longitude: 78.1198 } })

    // The user picks "Coimbatore" from the dropdown themselves before the
    // network reply lands — simulated by re-rendering with the Wizard's
    // updated selection props, exactly as a real parent re-render would.
    rerender(
      <I18nProvider>
        <LocationDigipin
          digipin=""
          selectedStateId="tamil_nadu"
          selectedDistrictId="coimbatore"
          onPinned={vi.fn()}
          onClear={vi.fn()}
          onLocationResolved={onLocationResolved}
        />
      </I18nProvider>
    )

    // GPS reply finally arrives, resolving to a *different* district
    // (Madurai) than what the user already chose (Coimbatore).
    geocodeDeferred.resolve({ state: 'Tamil Nadu', district: 'Madurai' })

    // Give the pending .then() chain a tick to run.
    await new Promise((r) => setTimeout(r, 10))

    expect(onLocationResolved).not.toHaveBeenCalled()
  })
})
