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
