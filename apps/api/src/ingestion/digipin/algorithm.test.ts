import { describe, expect, it } from 'vitest'
import { DigipinFormatError, DigipinOutOfBoundsError, decodeDigipin, encodeDigipin } from './algorithm.js'

describe('encodeDigipin', () => {
  it('matches the official worked example from INDIAPOST-gov/digipin', () => {
    // github.com/INDIAPOST-gov/digipin src/digipin.js docstring example.
    expect(encodeDigipin(13.11179621, 80.20264269)).toBe('4T396F42L7')
  })

  it('rejects a latitude outside DIGIPIN bounds', () => {
    expect(() => encodeDigipin(50, 80)).toThrow(DigipinOutOfBoundsError)
  })

  it('rejects a longitude outside DIGIPIN bounds', () => {
    expect(() => encodeDigipin(20, 40)).toThrow(DigipinOutOfBoundsError)
  })
})

describe('decodeDigipin', () => {
  it('round-trips close to the original coordinate', () => {
    const code = encodeDigipin(9.9252, 78.1198) // Madurai city, approx
    const { latitude, longitude } = decodeDigipin(code)
    expect(latitude).toBeCloseTo(9.9252, 3)
    expect(longitude).toBeCloseTo(78.1198, 3)
  })

  it('rejects a code of the wrong length', () => {
    expect(() => decodeDigipin('ABC')).toThrow(DigipinFormatError)
  })

  it('rejects a code with characters outside the DIGIPIN alphabet', () => {
    expect(() => decodeDigipin('AAAAAAAAAA')).toThrow(DigipinFormatError)
  })

  it('is case-insensitive', () => {
    const upper = encodeDigipin(9.9252, 78.1198)
    expect(decodeDigipin(upper.toLowerCase())).toEqual(decodeDigipin(upper))
  })
})
