import { describe, expect, it } from 'vitest'
import { nearestWithin } from './fallbackProvider.js'

describe('nearestWithin (OpenStreetMap fallback via Photon)', () => {
  const center = { lat: 10.0, lon: 78.0 }
  const feature = (id: number, lat: number, lon: number) => ({ geometry: { coordinates: [lon, lat] as [number, number] }, properties: { osm_type: 'N', osm_id: id } })

  it('picks the nearest result regardless of Photon\'s relevance order', () => {
    const result = nearestWithin(center, 25000, 'bank', [feature(1, 10.05, 78.0), feature(2, 10.01, 78.0)])
    expect(result).toEqual({ category: 'bank', osmRef: 'N/2', location: { lat: 10.01, lon: 78.0 } })
  })

  it('drops results outside the radius — location bias is only a preference', () => {
    // ~2,300 km away, like a real Photon reply for a pin with no market mapped nearby
    expect(nearestWithin(center, 25000, 'market', [feature(3, 28.6, 77.2)])).toBeNull()
  })

  it('ignores features without coordinates or an OSM id', () => {
    expect(nearestWithin(center, 25000, 'school', [{ properties: { osm_id: 4 } }, { geometry: { coordinates: [78, 10] } }])).toBeNull()
  })
})
