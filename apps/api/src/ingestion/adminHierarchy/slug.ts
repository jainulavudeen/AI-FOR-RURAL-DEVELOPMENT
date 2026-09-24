// Shared by parse.ts and every downstream consumer that needs to turn a
// real Census/SHRUG name into the slug-style id this app's client already
// uses everywhere (selection.stateId/districtId/blockId — see
// db/seed.ts's pre-existing 'tamil_nadu'/'madurai' rows, which this
// nationwide ingestion follows exactly, not a new convention).
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function titleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}
