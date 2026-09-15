import { describe, expect, it } from 'vitest'
import type { EmbeddingProvider } from '../../llm/embeddingProvider'
import { computeContentHash, loadCorpusDocument, type ExistingDocument, type LoadDeps } from './load'
import type { CorpusDocument } from './types'

function makeEmbeddingProvider(): { provider: EmbeddingProvider; calls: string[] } {
  const calls: string[] = []
  return {
    provider: {
      embed: async (text) => {
        calls.push(text)
        return [0, 0, 0]
      },
    },
    calls,
  }
}

function makeFakeDb() {
  const documents = new Map<string, ExistingDocument & { datasetVersionId: string }>()
  const chunksByDocument = new Map<string, unknown[]>()
  let nextId = 1

  const deps: LoadDeps = {
    findDocument: async (schemeId) => documents.get(schemeId) ?? null,
    upsertDocument: async (input) => {
      const existing = documents.get(input.schemeId)
      const id = existing?.id ?? `doc-${nextId++}`
      documents.set(input.schemeId, { id, contentHash: input.contentHash, datasetVersionId: input.datasetVersionId })
      return { id }
    },
    deleteChunks: async (documentId) => {
      chunksByDocument.delete(documentId)
    },
    insertChunk: async (input) => {
      const list = chunksByDocument.get(input.documentId) ?? []
      list.push(input)
      chunksByDocument.set(input.documentId, list)
    },
  }

  return { deps, documents, chunksByDocument }
}

const DOC: CorpusDocument = {
  schemeId: 'nsfdc',
  title: 'NSFDC',
  sourceUrl: 'https://nsfdc.nic.in/eligibility-requirements',
  sourceDescription: 'NSFDC eligibility requirements page',
  vintageLabel: 'as of 2026',
  sections: [{ section: 'Eligibility', text: 'SC applicants with family income under ₹5 lakh qualify.' }],
}

describe('loadCorpusDocument', () => {
  it('loads a new document and embeds its chunks', async () => {
    const { deps, chunksByDocument } = makeFakeDb()
    const { provider, calls } = makeEmbeddingProvider()

    const result = await loadCorpusDocument(deps, provider, DOC, 'version-1')

    expect(result.status).toBe('loaded')
    expect(result.chunksLoaded).toBe(1)
    expect(calls).toHaveLength(1)
    expect(chunksByDocument.size).toBe(1)
  })

  it('skips re-embedding entirely when the content hash is unchanged', async () => {
    const { deps } = makeFakeDb()
    const { provider, calls } = makeEmbeddingProvider()

    await loadCorpusDocument(deps, provider, DOC, 'version-1')
    calls.length = 0 // reset call log

    const second = await loadCorpusDocument(deps, provider, DOC, 'version-2')

    expect(second.status).toBe('unchanged')
    expect(second.chunksLoaded).toBe(0)
    expect(calls).toHaveLength(0) // no embedding calls made
  })

  it('deletes old chunks and re-embeds when the document content changes', async () => {
    const { deps, chunksByDocument } = makeFakeDb()
    const { provider } = makeEmbeddingProvider()

    await loadCorpusDocument(deps, provider, DOC, 'version-1')
    const changedDoc: CorpusDocument = {
      ...DOC,
      sections: [{ section: 'Eligibility', text: 'SC applicants with family income under ₹6 lakh now qualify.' }],
    }

    const result = await loadCorpusDocument(deps, provider, changedDoc, 'version-2')

    expect(result.status).toBe('loaded')
    expect(chunksByDocument.size).toBe(1)
    const [chunks] = [...chunksByDocument.values()]
    expect(chunks).toHaveLength(1)
  })
})

describe('computeContentHash', () => {
  it('is stable for identical content and changes when text changes', () => {
    const hash1 = computeContentHash(DOC)
    const hash2 = computeContentHash(DOC)
    expect(hash1).toBe(hash2)

    const changed: CorpusDocument = { ...DOC, sections: [{ section: 'Eligibility', text: 'different text' }] }
    expect(computeContentHash(changed)).not.toBe(hash1)
  })
})
