import { describe, expect, it } from 'vitest'
import { chunkDocument } from './chunk'

describe('chunkDocument', () => {
  it('keeps a short section as a single chunk, tagged with its section name', () => {
    const chunks = chunkDocument([{ section: 'Eligibility', text: 'SC applicants with family income under ₹5 lakh qualify.' }])
    expect(chunks).toEqual([{ section: 'Eligibility', chunkIndex: 0, text: 'SC applicants with family income under ₹5 lakh qualify.' }])
  })

  it('splits a long section into multiple paragraph-bounded chunks with increasing indices', () => {
    const longParagraph = 'A'.repeat(500)
    const chunks = chunkDocument([{ section: 'Terms', text: `${longParagraph}\n\n${longParagraph}\n\n${longParagraph}` }])
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.section === 'Terms')).toBe(true)
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i))
  })

  it('continues chunkIndex across multiple sections rather than restarting per section', () => {
    const chunks = chunkDocument([
      { section: 'A', text: 'first' },
      { section: 'B', text: 'second' },
    ])
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1])
  })
})
