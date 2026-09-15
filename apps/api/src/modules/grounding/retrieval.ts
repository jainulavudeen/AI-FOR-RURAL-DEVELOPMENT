import { eq, inArray, sql } from 'drizzle-orm'
import { getMatchingSocialSchemes } from '@setu/core'
import type { Db } from '../../db/client'
import { schemeDocumentChunks, schemeDocuments } from '../../db/schema'
import type { EmbeddingProvider } from '../../llm/embeddingProvider'
import { toVectorLiteral } from '../../llm/embeddingProvider'
import { withTimeout } from '../../lib/withTimeout'
import type { GroundedClaim, QueryRequestBody } from './types'

const TOP_K = 4
const EMBEDDING_TIMEOUT_MS = 2500

// @setu/core's social-scheme routing returns ids beyond this corpus's scope
// (CLAUDE.md scopes the corpus to exactly NSFDC/NBCFDC/NSKFDC/NHFDC/SEED +
// Jan Samarth — nstfdc and stand_up_india have no document here yet).
// jan_samarth is always a candidate: it's the general-purpose scheme, not
// tied to a social category.
const CORPUS_SCHEME_IDS = new Set(['nsfdc', 'nbcfdc', 'nskfdc', 'nhfdc', 'dwbdnc_seed', 'jan_samarth'])

function candidateSchemeIds(context: QueryRequestBody['context']): string[] | null {
  if (!context?.category && !context?.isWomanOwned) return null
  const matched = getMatchingSocialSchemes(context?.category ?? null, context?.isWomanOwned ?? false)
    .map((s) => s.id)
    .filter((id) => CORPUS_SCHEME_IDS.has(id))
  if (matched.length === 0) return null
  return [...matched, 'jan_samarth']
}

export interface RetrievalDeps {
  db: Db
  embeddingProvider: EmbeddingProvider
}

// Never throws (CLAUDE.md rule 4) — an embedding failure, a timed-out
// embed, or a DB error all degrade to "no claims retrieved", and the caller
// falls back to the deterministic template. Rule 3: every returned claim
// carries its source, section, and vintage.
export async function retrieveGroundedClaims(
  deps: RetrievalDeps,
  question: string,
  context?: QueryRequestBody['context']
): Promise<GroundedClaim[]> {
  try {
    const queryEmbedding = await withTimeout(deps.embeddingProvider.embed(question), EMBEDDING_TIMEOUT_MS)
    const queryLiteral = toVectorLiteral(queryEmbedding)
    const schemeIds = candidateSchemeIds(context)

    const distance = sql<number>`${schemeDocumentChunks.embedding} <=> ${queryLiteral}::vector`

    const rows = await deps.db
      .select({
        text: schemeDocumentChunks.text,
        section: schemeDocumentChunks.section,
        schemeId: schemeDocuments.schemeId,
        sourceUrl: schemeDocuments.sourceUrl,
        vintageLabel: schemeDocuments.vintageLabel,
        distance,
      })
      .from(schemeDocumentChunks)
      .innerJoin(schemeDocuments, eq(schemeDocumentChunks.documentId, schemeDocuments.id))
      .where(schemeIds ? inArray(schemeDocuments.schemeId, schemeIds) : undefined)
      .orderBy(distance)
      .limit(TOP_K)

    return rows.map((row) => ({
      text: row.text,
      sourceId: row.schemeId,
      section: row.section,
      sourceUrl: row.sourceUrl,
      dataVintage: row.vintageLabel,
      similarity: 1 - Number(row.distance),
    }))
  } catch {
    return []
  }
}
