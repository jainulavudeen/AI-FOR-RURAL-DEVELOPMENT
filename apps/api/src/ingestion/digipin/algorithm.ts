// DIGIPIN encode/decode — ported verbatim from India Post's official,
// Apache-2.0 reference implementation (github.com/INDIAPOST-gov/digipin,
// src/digipin.js). Pure, deterministic, no I/O. Verified against the
// repo's own worked example: encode(13.11179621, 80.20264269) === '4T396F42L7'.
//
// This is the addressing key every ingested table joins against — see
// CLAUDE.md. It needs real lat/lng to do anything; see backfill.ts and the
// Known Gaps note about not yet having a confirmed coordinate source for
// Madurai's villages.

const DIGIPIN_GRID = [
  ['F', 'C', '9', '8'],
  ['J', '3', '2', '7'],
  ['K', '4', '5', '6'],
  ['L', 'M', 'P', 'T'],
] as const

const BOUNDS = { minLat: 2.5, maxLat: 38.5, minLon: 63.5, maxLon: 99.5 }

const VALID_DIGIPIN = /^[23456789CJKLMPFT]{10}$/

// row/col are always clamped to 0-3 just before this is called, so the
// lookup can never actually miss — this just satisfies noUncheckedIndexedAccess.
function gridChar(row: number, col: number): string {
  const char = DIGIPIN_GRID[row]?.[col]
  if (char === undefined) throw new Error(`Unreachable: grid index out of range (${row}, ${col})`)
  return char
}

export class DigipinOutOfBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DigipinOutOfBoundsError'
  }
}

export class DigipinFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DigipinFormatError'
  }
}

export function encodeDigipin(lat: number, lon: number): string {
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

    digipin += gridChar(row, col)

    maxLat = minLat + latDiv * (4 - row)
    minLat = minLat + latDiv * (3 - row)
    minLon = minLon + lonDiv * col
    maxLon = minLon + lonDiv
  }

  return digipin
}

export interface LatLng {
  latitude: number
  longitude: number
}

export function decodeDigipin(digipin: string): LatLng {
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
        if (DIGIPIN_GRID[r]?.[c] === char) {
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
