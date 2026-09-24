import { sha256Hex } from '../../lib/hash.js'
import type { EmbeddingProvider } from '../../llm/embeddingProvider.js'
import { toVectorLiteral } from '../../llm/embeddingProvider.js'
import { chunkDocument } from './chunk.js'
import type { CorpusDocument } from './types.js'

// The re-embed trigger CLAUDE.md asks for: "embed scheme eligibility
// documents once and re-embed on document change, tracked by a content
// hash." Hashing the concatenated section text means any edit to the
// corpus JSON — not just a changed schemeId — is detected.
export function computeContentHash(doc: CorpusDocument): string {
  return sha256Hex(doc.sections.map((s) => `${s.section}\n${s.text}`).join('\n\n'))
}

export interface ExistingDocument {
  id: string
  contentHash: string
}

export interface LoadDeps {
  findDocument: (schemeId: string) => Promise<ExistingDocument | null>
  upsertDocument: (input: {
    schemeId: string
    title: string
    sourceUrl: string
    sourceDescription: string
    vintageLabel: string
    contentHash: string
    datasetVersionId: string
  }) => Promise<{ id: string }>
  deleteChunks: (documentId: string) => Promise<void>
  insertChunk: (input: {
    documentId: string
    section: string
    chunkIndex: number
    text: string
    embeddingLiteral: string
  }) => Promise<void>
}

export interface LoadOneResult {
  status: 'unchanged' | 'loaded'
  chunksLoaded: number
}

// Idempotent on content hash — an unchanged document's chunks are left
// alone entirely (no re-embed call); a changed one has its old chunks
// deleted and is fully re-chunked and re-embedded.
export async function loadCorpusDocument(
  deps: LoadDeps,
  embeddingProvider: EmbeddingProvider,
  doc: CorpusDocument,
  datasetVersionId: string
): Promise<LoadOneResult> {
  const contentHash = computeContentHash(doc)
  const existing = await deps.findDocument(doc.schemeId)

  if (existing && existing.contentHash === contentHash) {
    return { status: 'unchanged', chunksLoaded: 0 }
  }

  const { id: documentId } = await deps.upsertDocument({
    schemeId: doc.schemeId,
    title: doc.title,
    sourceUrl: doc.sourceUrl,
    sourceDescription: doc.sourceDescription,
    vintageLabel: doc.vintageLabel,
    contentHash,
    datasetVersionId,
  })

  if (existing) {
    await deps.deleteChunks(documentId)
  }

  const chunks = chunkDocument(doc.sections)
  for (const chunk of chunks) {
    const embedding = await embeddingProvider.embed(chunk.text)
    await deps.insertChunk({
      documentId,
      section: chunk.section,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      embeddingLiteral: toVectorLiteral(embedding),
    })
  }

  return { status: 'loaded', chunksLoaded: chunks.length }
}
