import { env } from '../../config/env'

export interface AgmarknetCommodityPrice {
  commodity: string
  market: string
  modalPrice: number
  arrivalDate: string // YYYY-MM-DD, normalized from the API's DD/MM/YYYY
}

export interface RawMarketActivity {
  district: string
  prices: AgmarknetCommodityPrice[]
  fetchedAt: string // ISO
}

export interface AgmarknetProvider {
  fetchDistrictActivity(district: string): Promise<RawMarketActivity>
}

const AGMARKNET_RESOURCE_URL = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070'

function normalizeDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/')
  if (!d || !m || !y) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Real, verified-reachable API (api.data.gov.in, resource
// 9ef84268-d588-465a-a308-a864a43d0070 — daily mandi prices from
// Agmarknet). Confirmed live this session; the shared public demo key is
// no longer authorized, so this needs a real self-registered
// AGMARKNET_API_KEY (free, data.gov.in) — same shape as the MSG91 SMS
// adapter: real, but credential-gated, not the default.
export class RealAgmarknetProvider implements AgmarknetProvider {
  constructor(private readonly apiKey: string) {}

  async fetchDistrictActivity(district: string): Promise<RawMarketActivity> {
    if (!this.apiKey) {
      throw new Error('AGMARKNET_API_KEY must be set when AGMARKNET_PROVIDER=real')
    }

    const url = new URL(AGMARKNET_RESOURCE_URL)
    url.searchParams.set('api-key', this.apiKey)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '100')
    url.searchParams.set('filters[district]', district)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Agmarknet fetch failed: ${response.status} ${await response.text()}`)
    }

    const data = (await response.json()) as { records?: Array<Record<string, string>> }
    const prices: AgmarknetCommodityPrice[] = (data.records ?? [])
      .map((r) => ({
        commodity: r.commodity ?? '',
        market: r.market ?? '',
        modalPrice: Number(r.modal_price),
        arrivalDate: normalizeDate(r.arrival_date ?? ''),
      }))
      .filter((p) => p.commodity && Number.isFinite(p.modalPrice))

    return { district, prices, fetchedAt: new Date().toISOString() }
  }
}

// Default adapter — clearly-synthetic data, prefixed "MOCK:" so it's never
// mistaken for a real fetch even mid-demo. Lets the team run this with no
// credentials, same as the console SMS adapter.
export class MockAgmarknetProvider implements AgmarknetProvider {
  async fetchDistrictActivity(district: string): Promise<RawMarketActivity> {
    const today = new Date().toISOString().slice(0, 10)
    return {
      district,
      prices: [
        { commodity: 'MOCK: Paddy', market: `${district} Mandi`, modalPrice: 2100, arrivalDate: today },
        { commodity: 'MOCK: Maize', market: `${district} Mandi`, modalPrice: 1850, arrivalDate: today },
        { commodity: 'MOCK: Cotton', market: `${district} Mandi`, modalPrice: 6400, arrivalDate: today },
      ],
      fetchedAt: new Date().toISOString(),
    }
  }
}

export function createAgmarknetProvider(): AgmarknetProvider {
  if (env.AGMARKNET_PROVIDER === 'real') {
    return new RealAgmarknetProvider(env.AGMARKNET_API_KEY ?? '')
  }
  return new MockAgmarknetProvider()
}
