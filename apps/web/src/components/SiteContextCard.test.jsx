import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n/I18nContext'
import SiteContextCard from './SiteContextCard'

const census = {
  villageName: 'pottapatti',
  villageDistanceKm: 0.1,
  vintageLabel: 'Census 2011',
  datasetVersionId: 'v1',
  facilities: {
    bank: { availableInVillage: false, distanceKm: null },
    market: { availableInVillage: false, distanceKm: null },
    school: { availableInVillage: true, distanceKm: 0 },
  },
}

const live = {
  competition: { count: 20, capped: true, method: 'place_type', searchedFor: ['tailor'], radiusKm: 5, retrievedAt: '2026-09-25T04:00:00Z', provider: 'real' },
  nearestFacilities: {
    facilities: { bank: { placeId: 'p1', straightLineKm: 1.5, roadDistanceKm: 2.1, travelMinutes: 5 } },
    source: 'google',
    retrievedAt: '2026-09-25T04:00:00Z',
    provider: 'real',
    attributions: [],
  },
}

const renderCard = (props) =>
  render(
    <I18nProvider>
      <SiteContextCard {...props} />
    </I18nProvider>
  )

describe('SiteContextCard', () => {
  it('renders nothing at all with no data (offline, no pin) — never an empty slot', () => {
    const { container } = renderCard({ census: null, live: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows Census only, with no live column or Google attribution, when Google is unavailable', () => {
    renderCard({ census, live: null })
    expect(screen.getByText('Census 2011', { selector: 'th' })).toBeInTheDocument()
    expect(screen.queryByText(/Road distance/)).not.toBeInTheDocument()
    expect(screen.queryByText('Google Maps')).not.toBeInTheDocument()
    expect(screen.queryByText('Indicative live lookup')).not.toBeInTheDocument()
  })

  it('shows Census and live side by side, with the caveat, the "20 or more" cap and attribution', () => {
    renderCard({ census, live })
    expect(screen.getByText('Census 2011', { selector: 'th' })).toBeInTheDocument()
    expect(screen.getByText(/Road distance/)).toBeInTheDocument()
    expect(screen.getByText('2.1 km · 5 min')).toBeInTheDocument()
    expect(screen.getByText('20 or more found')).toBeInTheDocument()
    expect(screen.getByText(/may mean businesses here are not mapped yet/)).toBeInTheDocument()
    expect(screen.getByText('Google Maps')).toBeInTheDocument()
    expect(screen.getByText('Indicative live lookup')).toBeInTheDocument()
  })

  it('credits OpenStreetMap, not Google, when distances came from the free fallback', () => {
    const osm = { ...live.nearestFacilities, source: 'openstreetmap', facilities: { bank: { osmRef: 'node/1', straightLineKm: 1.5, roadDistanceKm: 3, travelMinutes: 7 } } }
    renderCard({ census, live: { competition: null, nearestFacilities: osm } })
    expect(screen.getByText('OpenStreetMap contributors')).toBeInTheDocument()
    expect(screen.queryByText('Google Maps')).not.toBeInTheDocument()
    expect(screen.getByText('3 km · 7 min')).toBeInTheDocument()
  })

  it('labels mock data as demo data', () => {
    renderCard({ census: null, live: { ...live, competition: { ...live.competition, provider: 'mock' } } })
    expect(screen.getByText(/Demo data/)).toBeInTheDocument()
  })
})
