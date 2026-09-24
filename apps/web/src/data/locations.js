// Mock location data: a representative subset of Indian states and districts.
// Each district carries a rural block/panchayat-union layer so entrepreneurs
// can select the actual sub-district unit they operate in, not just the
// district headquarters — this also feeds the feasibility seed so insights
// vary at that finer grain.
const RURAL_BLOCKS = [
  { id: 'block_1', labelKey: 'block.block_1' },
  { id: 'block_2', labelKey: 'block.block_2' },
  { id: 'block_3', labelKey: 'block.block_3' },
]

function district(id) {
  return { id, labelKey: `district.${id}`, blocks: RURAL_BLOCKS }
}

export const LOCATIONS = {
  uttar_pradesh: {
    labelKey: 'state.uttar_pradesh',
    districts: ['lucknow', 'kanpur', 'varanasi', 'gorakhpur', 'jhansi'].map(district),
  },
  maharashtra: {
    labelKey: 'state.maharashtra',
    districts: ['pune', 'nashik', 'kolhapur', 'amravati', 'satara'].map(district),
  },
  tamil_nadu: {
    labelKey: 'state.tamil_nadu',
    districts: ['madurai', 'coimbatore', 'salem', 'tiruchirappalli', 'erode'].map(district),
  },
  bihar: {
    labelKey: 'state.bihar',
    districts: ['patna', 'gaya', 'muzaffarpur', 'bhagalpur', 'darbhanga'].map(district),
  },
  rajasthan: {
    labelKey: 'state.rajasthan',
    districts: ['jaipur', 'udaipur', 'jodhpur', 'ajmer', 'bikaner'].map(district),
  },
  madhya_pradesh: {
    labelKey: 'state.madhya_pradesh',
    districts: ['indore', 'bhopal', 'gwalior', 'jabalpur', 'sagar'].map(district),
  },
  west_bengal: {
    labelKey: 'state.west_bengal',
    districts: ['nadia', 'howrah', 'murshidabad', 'bardhaman', 'malda'].map(district),
  },
  karnataka: {
    labelKey: 'state.karnataka',
    districts: ['mysuru', 'belagavi', 'hubballi', 'mangaluru', 'tumakuru'].map(district),
  },
}

export const STATE_IDS = Object.keys(LOCATIONS)

// Best-effort match of a reverse-geocoded state/district name (real-world
// names, e.g. "Tamil Nadu" / "Madurai") against this mock catalogue's ids
// (lowercase-underscore slugs of the same real names — 'tamil_nadu' /
// 'madurai'). Only ever resolves for the 8 states x 5 districts listed
// above; every other name legitimately returns '', which the caller
// (LocationDigipin.jsx) surfaces as "location detected, not in our
// coverage yet" rather than an error — this catalogue is a demo subset,
// not the real district list nationwide (see CLAUDE.md).
const DIACRITICS_RE = /[\u0300-\u036f]/g

function normalizeForMatch(str) {
  return str
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/\b(district|division|region|taluk|taluka)\b/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function matchLocationByName(stateName, districtName) {
  const stateId = stateName ? STATE_IDS.find((id) => id === normalizeForMatch(stateName)) ?? '' : ''
  if (!stateId) return { stateId: '', districtId: '' }

  const districtId = districtName
    ? LOCATIONS[stateId].districts.find((d) => d.id === normalizeForMatch(districtName))?.id ?? ''
    : ''
  return { stateId, districtId }
}
