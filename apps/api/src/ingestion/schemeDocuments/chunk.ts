import type { CorpusSection } from './types.js'

const MAX_CHUNK_CHARS = 800

export interface Chunk {
  section: string
  chunkIndex: number
  text: string
}

// Paragraph-bounded chunking, keeping `section` per chunk (see
// db/schema/schemeDocumentChunks.ts) so a citation can point at
// "NSFDC — Eligibility Criteria" rather than just the document. Pure,
// synchronous, no I/O.
export function chunkDocument(sections: CorpusSection[]): Chunk[] {
  const chunks: Chunk[] = []
  let index = 0

  for (const section of sections) {
    const paragraphs = section.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)

    let buffer = ''
    for (const paragraph of paragraphs) {
      if (buffer && buffer.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
        chunks.push({ section: section.section, chunkIndex: index, text: buffer })
        index += 1
        buffer = ''
      }
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    }
    if (buffer) {
      chunks.push({ section: section.section, chunkIndex: index, text: buffer })
      index += 1
    }
  }

  return chunks
}
