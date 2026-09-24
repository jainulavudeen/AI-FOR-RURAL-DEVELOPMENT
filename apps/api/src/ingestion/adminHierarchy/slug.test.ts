import { describe, expect, it } from 'vitest'
import { slugify, titleCase } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with underscores', () => {
    expect(slugify('Tamil Nadu')).toBe('tamil_nadu')
    expect(slugify('Madurai')).toBe('madurai')
  })

  it('collapses punctuation/special characters into a single underscore', () => {
    expect(slugify("Char'dhoora e Shrief")).toBe('char_dhoora_e_shrief')
    expect(slugify('Andaman & Nicobar Islands')).toBe('andaman_nicobar_islands')
  })

  it('strips leading/trailing underscores', () => {
    expect(slugify('  Leh (Ladakh)  ')).toBe('leh_ladakh')
  })
})

describe('titleCase', () => {
  it('capitalizes each word', () => {
    expect(titleCase('uttar pradesh')).toBe('Uttar Pradesh')
    expect(titleCase('madurai')).toBe('Madurai')
  })
})
