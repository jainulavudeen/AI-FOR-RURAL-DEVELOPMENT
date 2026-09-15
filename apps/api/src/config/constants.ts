// Fixed embedding dimension shared by the pgvector column definition
// (db/schema/schemeDocumentChunks.ts), the mock embedding provider, and the
// real one (Voyage AI's voyage-3-lite). Keeping this in one place means
// swapping providers never requires a schema/migration change.
export const EMBEDDING_DIMENSIONS = 512
