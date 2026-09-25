import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { datasetVersions, villageAmenities, villages } from '../../db/schema/index.js'

// The government half of the "Census 2011 vs live road distance" comparison
// on the report. Deliberately separate from modules/googleMaps: this is the
// auditable figure, always shown with its vintage label, and still
// available when Google is disabled, over its cap, or offline (the service
// worker caches this GET — see apps/web/vite.config.js).

export type CensusFacilityCategory = 'bank' | 'market' | 'school'

export interface CensusFacilityFigure {
  availableInVillage: boolean
  // The Census extract we load records a distance for very few amenities
  // (ATM is the only relevant one); null means "not recorded", not zero.
  distanceKm: number | null
}

export interface CensusFacilities {
  villageName: string
  // How far the pin is from the Census village point we matched it to.
  villageDistanceKm: number
  vintageLabel: string
  datasetVersionId: string
  facilities: Record<CensusFacilityCategory, CensusFacilityFigure>
}

// Beyond this the pin isn't meaningfully "in" any ingested village —
// showing a village 20 km away as the pin's Census baseline would mislead.
export const MAX_VILLAGE_MATCH_KM = 5

const CATEGORY_FACILITY_TYPES: Record<CensusFacilityCategory, string[]> = {
  bank: ['commercial_bank', 'cooperative_bank'],
  market: ['market', 'weekly_haat'],
  school: ['primary_school', 'middle_school', 'secondary_school'],
}

export interface AmenityRow {
  facilityType: string
  availableInVillage: boolean
  distanceKm: string | null
}

// Pure, testable: collapse a village's long/tall amenity rows into the
// three categories the report compares.
export function summariseAmenities(rows: AmenityRow[]): Record<CensusFacilityCategory, CensusFacilityFigure> {
  const byType = new Map(rows.map((r) => [r.facilityType, r]))
  const summarise = (category: CensusFacilityCategory): CensusFacilityFigure => {
    const available = CATEGORY_FACILITY_TYPES[category].some((t) => byType.get(t)?.availableInVillage)
    return { availableInVillage: available, distanceKm: available ? 0 : null }
  }
  const bank = summarise('bank')
  // The only bank-adjacent distance the Census extract carries is to the
  // nearest ATM — used only when no bank is in the village, and labelled
  // as an ATM distance in the UI.
  if (!bank.availableInVillage) {
    const atm = byType.get('nearest_atm_distance')
    if (atm?.distanceKm != null && Number.isFinite(Number(atm.distanceKm))) bank.distanceKm = Number(atm.distanceKm)
  }
  return { bank, market: summarise('market'), school: summarise('school') }
}

// Never throws (rule 4): no nearby village, no amenities, or a DB error all
// mean "no Census figure for this pin".
export async function getCensusFacilitiesNearPoint(db: Db, lat: number, lon: number): Promise<CensusFacilities | null> {
  try {
    const point = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`
    const [village] = await db
      .select({
        id: villages.id,
        name: villages.name,
        distanceMeters: sql<number>`ST_Distance(${villages.geom}::geography, ${point}::geography)`,
      })
      .from(villages)
      .where(sql`${villages.geom} IS NOT NULL`)
      .orderBy(sql`${villages.geom} <-> ${point}`)
      .limit(1)

    if (!village || Number(village.distanceMeters) / 1000 > MAX_VILLAGE_MATCH_KM) return null

    const rows = await db
      .select({
        facilityType: villageAmenities.facilityType,
        availableInVillage: villageAmenities.availableInVillage,
        distanceKm: villageAmenities.distanceKm,
        datasetVersionId: villageAmenities.datasetVersionId,
        vintageLabel: datasetVersions.vintageLabel,
      })
      .from(villageAmenities)
      .innerJoin(datasetVersions, eq(villageAmenities.datasetVersionId, datasetVersions.id))
      .where(eq(villageAmenities.villageId, village.id))

    const first = rows[0]
    if (!first) return null

    return {
      villageName: village.name,
      villageDistanceKm: Math.round((Number(village.distanceMeters) / 1000) * 10) / 10,
      vintageLabel: first.vintageLabel,
      datasetVersionId: first.datasetVersionId,
      facilities: summariseAmenities(rows),
    }
  } catch {
    return null
  }
}
