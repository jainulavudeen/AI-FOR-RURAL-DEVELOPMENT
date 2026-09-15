import { customType } from 'drizzle-orm/pg-core'

interface GeometryConfig {
  type?: string
  srid?: number
}

// PostGIS geometry column. drizzle-orm has no first-class geometry helper,
// so this is a thin customType — stores/reads WKT/GeoJSON as text via the
// driver, DDL emits `geometry(<type>,<srid>)`. Real geometries are populated
// by the Prompt 2A ingestion pipeline (DIGIPIN grid + Census/Mission
// Antyodaya joins); districts/blocks carry a nullable geom column until then.
export const geometry = customType<{ data: string; config: GeometryConfig }>({
  dataType(config) {
    const type = config?.type ?? 'Geometry'
    const srid = config?.srid ?? 4326
    return `geometry(${type},${srid})`
  },
})

// pgvector embedding column. Same reasoning as `geometry` above — drizzle-orm
// has no first-class pgvector helper, so this is a thin customType. Stored/
// read as pgvector's own text literal form `[0.1,0.2,...]`; the driver never
// needs to parse the array itself, so a plain string round-trip is enough.
export const vector = customType<{ data: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 512})`
  },
})
