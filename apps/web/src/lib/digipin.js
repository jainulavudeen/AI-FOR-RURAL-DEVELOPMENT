// DIGIPIN encode — ported from apps/api/src/ingestion/digipin/algorithm.ts
// (itself ported verbatim from India Post's official reference
// implementation). This IS a deliberate, documented duplication, not an
// oversight of CLAUDE.md's "never fork logic" rule — that rule is scoped
// to the financial calculator (packages/core/calculator.ts), the one
// thing that ever decides a rupee figure. DIGIPIN is pure geocoding math,
// not a financial number, and the site-capture flow needs to work fully
// offline (queue-for-background-sync is the *upload*, but capture itself
// — including computing the pin — shouldn't require connectivity at all,
// matching CLAUDE.md's offline-first posture for feasibility scoring
// too). apps/api still exposes GET /feasibility/digipin independently, for
// parity/verification and any server-side use — see routes.ts.
//
// Verified against the same worked example apps/api's version cites:
// encodeDigipin(13.11179621, 80.20264269) === '4T396F42L7'.

const DIGIPIN_GRID = [
  ['F', 'C', '9', '8'],
  ['J', '3', '2', '7'],
  ['K', '4', '5', '6'],
  ['L', 'M', 'P', 'T'],
]

const BOUNDS = { minLat: 2.5, maxLat: 38.5, minLon: 63.5, maxLon: 99.5 }

const VALID_DIGIPIN = /^[23456789CJKLMPFT]{10}$/

export class DigipinOutOfBoundsError extends Error {}
export class DigipinFormatError extends Error {}

export function encodeDigipin(lat, lon) {
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat) {
    throw new DigipinOutOfBoundsError(`Latitude ${lat} outside DIGIPIN bounds [${BOUNDS.minLat}, ${BOUNDS.maxLat}]`)
  }
  if (lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    throw new DigipinOutOfBoundsError(`Longitude ${lon} outside DIGIPIN bounds [${BOUNDS.minLon}, ${BOUNDS.maxLon}]`)
  }

  let minLat = BOUNDS.minLat
  let maxLat = BOUNDS.maxLat
  let minLon = BOUNDS.minLon
  let maxLon = BOUNDS.maxLon
  let digipin = ''

  for (let level = 1; level <= 10; level += 1) {
    const latDiv = (maxLat - minLat) / 4
    const lonDiv = (maxLon - minLon) / 4

    let row = 3 - Math.floor((lat - minLat) / latDiv)
    let col = Math.floor((lon - minLon) / lonDiv)
    row = Math.max(0, Math.min(row, 3))
    col = Math.max(0, Math.min(col, 3))

    digipin += DIGIPIN_GRID[row][col]

    maxLat = minLat + latDiv * (4 - row)
    minLat = minLat + latDiv * (3 - row)
    minLon = minLon + lonDiv * col
    maxLon = minLon + lonDiv
  }

  return digipin
}

// Decode side of the same port — see the file header. Lets a user who
// already knows their DIGIPIN (e.g. printed on a government document) skip
// granting geolocation permission entirely.
export function decodeDigipin(digipin) {
  if (typeof digipin !== 'string') {
    throw new DigipinFormatError('DIGIPIN must be provided as a string')
  }

  const pin = digipin.trim().toUpperCase()
  if (pin.length !== 10) {
    throw new DigipinFormatError('DIGIPIN must be a continuous 10-character string')
  }
  if (!VALID_DIGIPIN.test(pin)) {
    throw new DigipinFormatError('DIGIPIN contains characters outside the approved DIGIPIN alphabet')
  }

  let minLat = BOUNDS.minLat
  let maxLat = BOUNDS.maxLat
  let minLon = BOUNDS.minLon
  let maxLon = BOUNDS.maxLon

  for (const char of pin) {
    let ri = -1
    let ci = -1
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        if (DIGIPIN_GRID[r][c] === char) {
          ri = r
          ci = c
        }
      }
    }

    const latDiv = (maxLat - minLat) / 4
    const lonDiv = (maxLon - minLon) / 4

    const lat1 = maxLat - latDiv * (ri + 1)
    const lat2 = maxLat - latDiv * ri
    const lon1 = minLon + lonDiv * ci
    const lon2 = minLon + lonDiv * (ci + 1)

    minLat = lat1
    maxLat = lat2
    minLon = lon1
    maxLon = lon2
  }

  return { latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2 }
}
