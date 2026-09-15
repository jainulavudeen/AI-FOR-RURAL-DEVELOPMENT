import type { Db } from '../db/client'
import { datasetVersions } from '../db/schema'

export interface RecordDatasetVersionInput {
  source: string
  vintageLabel: string
  sourceDescription: string
  fetchedAt: Date
  recordCount: number
  notes?: string
}

// Shared by every loader — one append-only row per ingestion run. See
// db/schema/datasetVersions.ts for why this is separate from the
// idempotent-upsert fact tables it's referenced by.
export async function recordDatasetVersion(db: Db, input: RecordDatasetVersionInput) {
  const [row] = await db
    .insert(datasetVersions)
    .values({
      source: input.source,
      vintageLabel: input.vintageLabel,
      sourceDescription: input.sourceDescription,
      fetchedAt: input.fetchedAt,
      recordCount: input.recordCount,
      notes: input.notes,
    })
    .returning({ id: datasetVersions.id })

  if (!row) throw new Error('Failed to record dataset_versions row')
  return row
}
