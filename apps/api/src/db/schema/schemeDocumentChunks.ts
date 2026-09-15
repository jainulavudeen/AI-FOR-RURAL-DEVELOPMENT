import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { EMBEDDING_DIMENSIONS } from '../../config/constants'
import { vector } from './customTypes'
import { schemeDocuments } from './schemeDocuments'

// The actual embeddable/retrievable unit. `section` is kept per chunk (not
// just on the parent document) so a citation can point at "NSFDC — Eligibility
// Criteria" rather than just "NSFDC" (CLAUDE.md rule 3: source + vintage on
// every retrieved claim). Tiny corpus (a handful of documents, tens of
// chunks) — the HNSW index below is about demonstrating the real access
// pattern, not because this scale needs one.
export const schemeDocumentChunks = pgTable(
  'scheme_document_chunks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    documentId: uuid('document_id')
      .notNull()
      .references(() => schemeDocuments.id, { onDelete: 'cascade' }),
    section: text('section').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (table) => [
    unique('scheme_document_chunks_document_chunk_unique').on(table.documentId, table.chunkIndex),
    index('scheme_document_chunks_document_id_idx').on(table.documentId),
    index('scheme_document_chunks_embedding_hnsw_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ]
)
