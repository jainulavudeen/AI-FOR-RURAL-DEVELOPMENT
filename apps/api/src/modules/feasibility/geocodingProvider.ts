import { env } from '../../config/env'

export interface ReverseGeocodeResult {
  state: string
  district: string
}

export interface GeocodingProvider {
  reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult | null>
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'

// Free, keyless reverse geocoding (OpenStreetMap Nominatim) for the
// Wizard's "use my current location" button — resolves a GPS point to a
// state/district name, which apps/web then matches against its own mock
// location catalogue (data/locations.js's matchLocationByName). Only
// state/district are requested: block-level data doesn't exist anywhere
// in this repo (CLAUDE.md Known Gaps) or in Nominatim's admin hierarchy
// for rural India, so block selection stays manual — same precedent as
// Wizard.jsx's voice-input matching, which also stops at district.
export class RealNominatimGeocodingProvider implements GeocodingProvider {
  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lon))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('zoom', '10')
    url.searchParams.set('accept-language', 'en')

    const response = await fetch(url, {
      headers: { 'User-Agent': env.GEOCODING_USER_AGENT },
    })
    if (!response.ok) return null

    const data = (await response.json()) as { address?: Record<string, string> }
    const address = data.address
    if (!address) return null

    const state = address.state ?? ''
    const district = address.state_district ?? address.county ?? address.district ?? ''
    if (!state) return null

    return { state, district }
  }
}

// Deliberately returns null, not synthetic data — unlike
// MockAgmarknetProvider's clearly MOCK-labelled figures, fabricating a
// state/district here would feed straight into a real dropdown selection,
// not narrative text, so "no signal" is the only honest mock behaviour.
// GEOCODING_PROVIDER=mock opts into this for tests/offline dev with zero
// outbound calls.
export class MockGeocodingProvider implements GeocodingProvider {
  async reverseGeocode(): Promise<ReverseGeocodeResult | null> {
    return null
  }
}

export function createGeocodingProvider(): GeocodingProvider {
  if (env.GEOCODING_PROVIDER === 'mock') return new MockGeocodingProvider()
  return new RealNominatimGeocodingProvider()
}
