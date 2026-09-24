import '../../config/loadEnv.js'
import { readdirSync, readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { schemeDocumentChunks, schemeDocuments } from '../../db/schema/index.js'
import { createEmbeddingProvider } from '../../llm/embeddingProvider.js'
import { recordDatasetVersion } from '../datasetVersions.js'
import { loadCorpusDocument, type LoadDeps } from './load.js'
import type { CorpusDocument } from './types.js'

const CORPUS_DIR = new URL('./corpus', import.meta.url).pathname

async function main() {
  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json'))
  const docs: CorpusDocument[] = files.map((f) => JSON.parse(readFileSync(`${CORPUS_DIR}/${f}`, 'utf8')))

  console.log(`Found ${docs.length} corpus documents: ${docs.map((d) => d.schemeId).join(', ')}`)

  const embeddingProvider = createEmbeddingProvider()

  const deps: LoadDeps = {
    findDocument: async (schemeId) => {
      const [row] = await db
        .select({ id: schemeDocuments.id, contentHash: schemeDocuments.contentHash })
        .from(schemeDocuments)
        .where(eq(schemeDocuments.schemeId, schemeId))
        .limit(1)
      return row ?? null
    },
    upsertDocument: async (input) => {
      const [row] = await db
        .insert(schemeDocuments)
        .values(input)
        .onConflictDoUpdate({
          target: schemeDocuments.schemeId,
          set: {
            title: input.title,
            sourceUrl: input.sourceUrl,
            sourceDescription: input.sourceDescription,
            vintageLabel: input.vintageLabel,
            contentHash: input.contentHash,
            datasetVersionId: input.datasetVersionId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schemeDocuments.id })
      if (!row) throw new Error(`Failed to upsert scheme_documents row for ${input.schemeId}`)
      return row
    },
    deleteChunks: async (documentId) => {
      await db.delete(schemeDocumentChunks).where(eq(schemeDocumentChunks.documentId, documentId))
    },
    insertChunk: async (input) => {
      await db.insert(schemeDocumentChunks).values({
        documentId: input.documentId,
        section: input.section,
        chunkIndex: input.chunkIndex,
        text: input.text,
        embedding: input.embeddingLiteral,
      })
    },
  }

  const datasetVersion = await recordDatasetVersion(db, {
    source: 'scheme_documents',
    vintageLabel: 'Scheme eligibility corpus (NSFDC/NBCFDC/NSKFDC/NHFDC/SEED/Jan Samarth)',
    sourceDescription: `${docs.length} hand-curated eligibility documents transcribed from official scheme portals`,
    fetchedAt: new Date(),
    recordCount: docs.length,
  })

  let loaded = 0
  let unchanged = 0
  let totalChunks = 0

  for (const doc of docs) {
    const result = await loadCorpusDocument(deps, embeddingProvider, doc, datasetVersion.id)
    if (result.status === 'loaded') {
      loaded += 1
      totalChunks += result.chunksLoaded
      console.log(`  ${doc.schemeId}: (re)loaded, ${result.chunksLoaded} chunks embedded`)
    } else {
      unchanged += 1
      console.log(`  ${doc.schemeId}: unchanged (content hash match) — skipped`)
    }
  }

  console.log(
    `${loaded} document(s) (re)loaded, ${unchanged} unchanged, ${totalChunks} chunks embedded under dataset_versions ${datasetVersion.id}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
